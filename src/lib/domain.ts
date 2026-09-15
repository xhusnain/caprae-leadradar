const MULTI_PART_TLDS = new Set(["co.uk", "org.uk", "com.au", "co.nz", "co.za", "com.br", "co.in", "com.mx", "co.jp"]);

const NOT_COMPANY_SITES = [
  "facebook.com", "instagram.com", "linkedin.com", "yelp.com", "google.com", "goo.gl", "business.site",
  "twitter.com", "x.com", "youtube.com", "tiktok.com", "nextdoor.com", "bbb.org", "angi.com", "homeadvisor.com",
  "thumbtack.com", "yellowpages.com", "mapquest.com", "linktr.ee", "wixsite.com",
];

/** Canonical registrable domain: "https://WWW.Acme-HVAC.com/about?x" -> "acme-hvac.com". */
export function normalizeDomain(input?: string | null): string | undefined {
  if (!input) return undefined;
  let s = String(input).trim().toLowerCase();
  if (!s || s === "n/a" || s === "na" || s === "-") return undefined;
  if (s.includes("@") && !s.includes("/")) s = s.split("@").pop()!;
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\d?\./, "");
  s = s.split(/[/?#\s]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return undefined;
  const parts = s.split(".");
  const lastTwo = parts.slice(-2).join(".");
  const keep = MULTI_PART_TLDS.has(lastTwo) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

/** Domains that belong to platforms, not to the business itself (a Facebook page is not a website). */
export function isPlatformDomain(domain?: string): boolean {
  if (!domain) return false;
  return NOT_COMPANY_SITES.some((d) => domain === d || domain.endsWith("." + d));
}

export function toUrl(input?: string | null): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (!s) return undefined;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/\//, "")}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes(".")) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** North-American numbers to +1XXXXXXXXXX, others kept as +digits. Returns undefined for junk. */
export function normalizePhone(input?: string | null): string | undefined {
  if (!input) return undefined;
  const first = String(input).split(/[;,/]| or /i)[0];
  const digits = first.replace(/(?:ext|x)\.?\s*\d+$/i, "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15 && first.trim().startsWith("+")) return `+${digits}`;
  return undefined;
}

export function formatPhone(e164?: string): string {
  if (!e164) return "";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const LEGAL_SUFFIX = /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|co|corp|corporation|company|pllc|pc|lp|llp|plc|gmbh|the)\b\.?/g;

/** Comparable company name: lowercase, no punctuation or legal suffixes, "&" == "and". */
export function nameKey(name?: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/\s+/g, "");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity on character bigrams of normalized names (0..1). */
export function nameSimilarity(a?: string, b?: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const ga = bigrams(ka);
  const gb = bigrams(kb);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of ga) {
    overlap += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

export function hashId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
