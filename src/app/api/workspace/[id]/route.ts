import type { NextRequest } from "next/server";
import { loadWorkspace, saveWorkspace } from "@/lib/db";

const ID = /^[a-z0-9-]{8,64}$/;
const MAX_BYTES = 4_000_000;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/workspace/[id]">) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  return Response.json({ workspace: await loadWorkspace(id) });
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/workspace/[id]">) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "workspace too large" }, { status: 413 });
  try {
    await saveWorkspace(id, JSON.parse(text));
    return Response.json({ ok: true, savedAt: Date.now() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
