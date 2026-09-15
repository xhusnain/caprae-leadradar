import { promises as dns } from "node:dns";
import type { EmailFinding, EmailKind } from "./types";
import { cacheGet, cacheSet } from "./db";
import { withTimeout } from "./concurrency";

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com", "msn.com",
  "live.com", "comcast.net", "att.net", "sbcglobal.net", "verizon.net", "bellsouth.net", "protonmail.com",
  "proton.me", "ymail.com", "mail.com", "gmx.com", "cox.net", "charter.net",
]);

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "trashmail.com", "yopmail.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc",
]);

const ROLE_LOCALS = new Set([
  "info", "contact", "hello", "office", "admin", "sales", "support", "service", "services", "team", "help",
  "mail", "enquiries", "inquiries", "booking", "bookings", "appointments", "billing", "accounts", "hr", "jobs",
  "careers", "marketing", "orders", "reception", "frontdesk", "customerservice", "webmaster", "noreply", "no-reply",
  "dispatch", "estimates", "quotes", "schedule", "scheduling", "general",
]);

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;

const PLACEHOLDER = /(example\.(com|org)|domain\.com|yourdomain|email\.com|sentry|wixpress|godaddy|\.png|\.jpg|\.gif|\.webp|\.svg)$/i;

export function isValidEmailSyntax(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254 && !PLACEHOLDER.test(email) && !email.includes("..");
}

export function classifyEmail(email: string): EmailKind {
  const [local, domain] = email.toLowerCase().split("@");
  if (FREEMAIL.has(domain)) return "freemail";
  const base = local.replace(/[._-]?\d+$/, "");
  return ROLE_LOCALS.has(base) ? "role" : "named";
}

/** Does this domain accept mail? MX record, or an A record (RFC 5321 implicit MX). Cached 7 days. */
export async function domainAcceptsMail(domain: string): Promise<boolean | null> {
  const cached = await cacheGet<boolean>("mx", domain);
  if (cached !== undefined) return cached;
  let result: boolean | null = null;
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 4000, "MX lookup");
    result = mx.some((r) => r.exchange && r.exchange !== ".");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      try {
        const a = await withTimeout(dns.resolve4(domain), 3000, "A lookup");
        result = a.length > 0;
      } catch {
        result = false;
      }
    } else {
      result = null; // timeout / resolver failure: unknown, don't punish the lead
    }
  }
  if (result !== null) await cacheSet("mx", domain, result, 7 * 24 * 3600_000);
  return result;
}

/** Validate, classify and MX-check a set of raw addresses. No SMTP mailbox probing (it is abusive and unreliable). */
export async function verifyEmails(raw: { address: string; url?: string }[], siteDomain?: string): Promise<EmailFinding[]> {
  const seen = new Map<string, { address: string; url?: string }>();
  for (const r of raw) {
    const address = r.address.trim().toLowerCase().replace(/^mailto:/, "").split("?")[0];
    if (isValidEmailSyntax(address) && !seen.has(address)) seen.set(address, { address, url: r.url });
  }
  const list = [...seen.values()].slice(0, 12);
  const findings = await Promise.all(
    list.map(async ({ address, url }) => {
      const domain = address.split("@")[1];
      return {
        address,
        url,
        kind: classifyEmail(address),
        mx: await domainAcceptsMail(domain),
        disposable: DISPOSABLE.has(domain),
        onOwnDomain: !!siteDomain && (domain === siteDomain || domain.endsWith("." + siteDomain)),
      } satisfies EmailFinding;
    }),
  );
  const rank = (f: EmailFinding) =>
    (f.mx === false || f.disposable ? 100 : 0) + (f.onOwnDomain ? 0 : 5) + { named: 0, role: 2, freemail: 3 }[f.kind];
  return findings.sort((a, b) => rank(a) - rank(b));
}
