import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";

/**
 * Storage: libSQL. Locally a SQLite file under .data/, in production a Turso database
 * (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN). If neither is writable (e.g. read-only
 * serverless filesystem without Turso), we fall back to an in-memory database so the app
 * keeps working and simply loses the cache between cold starts.
 */
let client: Client | null = null;
let ready: Promise<Client> | null = null;
export let storageLabel = "SQLite (local)";

async function init(): Promise<Client> {
  const url = process.env.TURSO_DATABASE_URL;
  const candidates: { url: string; authToken?: string; label: string }[] = [];
  if (url) candidates.push({ url, authToken: process.env.TURSO_AUTH_TOKEN, label: "Turso (libSQL)" });
  if (!process.env.VERCEL) candidates.push({ url: "file:.data/leadradar.db", label: "SQLite (local)" });
  candidates.push({ url: ":memory:", label: "In-memory" });

  for (const c of candidates) {
    try {
      if (c.url.startsWith("file:")) mkdirSync(".data", { recursive: true });
      const db = createClient({ url: c.url, authToken: c.authToken });
      await db.batch(
        [
          `CREATE TABLE IF NOT EXISTS kv_cache (
             ns TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
             expires_at INTEGER NOT NULL, PRIMARY KEY (ns, key))`,
          `CREATE INDEX IF NOT EXISTS kv_cache_expiry ON kv_cache (expires_at)`,
          `CREATE TABLE IF NOT EXISTS workspaces (
             id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
        ],
        "write",
      );
      storageLabel = c.label;
      client = db;
      return db;
    } catch (e) {
      console.warn(`[db] ${c.label} unavailable:`, (e as Error).message);
    }
  }
  throw new Error("No storage backend available");
}

export function db(): Promise<Client> {
  if (client) return Promise.resolve(client);
  ready ??= init();
  return ready;
}

/** L1: per-instance memory (hot, bounded). L2: libSQL (survives restarts, shared across instances with Turso). */
const memory = new Map<string, { value: unknown; expires: number }>();
const MEMORY_MAX = 1000;

export async function cacheGet<T>(ns: string, key: string): Promise<T | undefined> {
  const k = `${ns}:${key}`;
  const hit = memory.get(k);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value as T;
  try {
    const rs = await (await db()).execute({
      sql: "SELECT value, expires_at FROM kv_cache WHERE ns = ? AND key = ? AND expires_at > ?",
      args: [ns, key, now],
    });
    const row = rs.rows[0];
    if (!row) return undefined;
    const value = JSON.parse(String(row.value)) as T;
    remember(k, value, Number(row.expires_at));
    return value;
  } catch {
    return undefined;
  }
}

export async function cacheSet(ns: string, key: string, value: unknown, ttlMs: number): Promise<void> {
  const expires = Date.now() + ttlMs;
  remember(`${ns}:${key}`, value, expires);
  try {
    await (await db()).execute({
      sql: `INSERT INTO kv_cache (ns, key, value, expires_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (ns, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      args: [ns, key, JSON.stringify(value), expires],
    });
  } catch (e) {
    console.warn("[db] cache write failed:", (e as Error).message);
  }
}

function remember(k: string, value: unknown, expires: number) {
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value as string);
  memory.set(k, { value, expires });
}

export async function loadWorkspace(id: string): Promise<unknown | null> {
  const rs = await (await db()).execute({ sql: "SELECT data FROM workspaces WHERE id = ?", args: [id] });
  return rs.rows[0] ? JSON.parse(String(rs.rows[0].data)) : null;
}

export async function saveWorkspace(id: string, data: unknown): Promise<void> {
  await (await db()).execute({
    sql: `INSERT INTO workspaces (id, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [id, JSON.stringify(data), Date.now()],
  });
}
