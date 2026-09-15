import type { Enrichment } from "./types";
import { extractPage, pickSubpages, BOOKING_TECH, CHAT_TECH, ANALYTICS_TECH, type PageFacts } from "./extract";
import { isAllowed, parseRobots, type RobotsRules } from "./robots";
import { verifyEmails } from "./verify";
import { cacheGet, cacheSet } from "./db";
import { normalizeDomain, toUrl } from "./domain";

export const USER_AGENT = "LeadRadarBot/1.0 (+https://github.com/leadradar; B2B research; respects robots.txt)";
const PAGE_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;
const ENRICH_TTL = 7 * 24 * 3600_000;

interface FetchResult {
  status: number;
  url: string;
  html: string;
  blocked: boolean;
}

async function fetchHtml(url: string): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.8" },
    });
    const type = res.headers.get("content-type") ?? "";
    let html = "";
    if (res.body && (type.includes("html") || type === "")) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }
    const blocked = res.status === 403 || res.status === 429 || (res.status === 503 && !!res.headers.get("cf-ray"));
    return { status: res.status, url: res.url || url, html, blocked };
  } finally {
    clearTimeout(timer);
  }
}

async function robotsFor(origin: string): Promise<RobotsRules> {
  const cached = await cacheGet<RobotsRules>("robots", origin);
  if (cached) return cached;
  let rules: RobotsRules = { allow: [], disallow: [] };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${origin}/robots.txt`, { signal: ctrl.signal, headers: { "user-agent": USER_AGENT } });
    clearTimeout(t);
    if (res.ok) rules = parseRobots((await res.text()).slice(0, 200_000), "LeadRadarBot");
    // 4xx = no restrictions (RFC 9309); 5xx = treat as unreachable -> be conservative only for the homepage
  } catch {
    /* unreachable robots.txt => allowed */
  }
  await cacheSet("robots", origin, rules, 24 * 3600_000);
  return rules;
}

function emptyEnrichment(status: Enrichment["status"], started: number, error?: string): Enrichment {
  return {
    ok: false, status, error, fetchedAt: Date.now(), cached: false, ms: Date.now() - started, pages: [],
    emails: [], phones: [], socials: {}, people: [], generational: [], tech: [],
    booking: false, ecommerce: false, chat: false, analytics: false, https: false, mobile: false, textSample: "",
  };
}

/** Crawl homepage + up to 3 high-signal subpages, merge facts, verify contacts. Cached per domain for 7 days. */
export async function enrichWebsite(website: string | undefined, opts: { force?: boolean } = {}): Promise<Enrichment> {
  const started = Date.now();
  const url = toUrl(website);
  const domain = normalizeDomain(url);
  if (!url || !domain) return emptyEnrichment("no-website", started, "No website on record");

  if (!opts.force) {
    const hit = await cacheGet<Enrichment>("enrich", domain);
    if (hit) return { ...hit, cached: true, ms: Date.now() - started };
  }

  let home: FetchResult | undefined;
  let lastError = "";
  const candidates = [url, url.replace(/^https:/, "http:")];
  const origin0 = new URL(url).origin;
  const rules = await robotsFor(origin0);
  if (!isAllowed(rules, new URL(url).pathname || "/")) {
    const e = emptyEnrichment("robots", started, "robots.txt disallows crawling this site");
    await cacheSet("enrich", domain, e, ENRICH_TTL);
    return e;
  }
  for (const c of candidates) {
    try {
      home = await fetchHtml(c);
      if (home.html) break;
    } catch (e) {
      const timedOut = (e as Error).name === "AbortError";
      lastError = timedOut ? "Timed out" : (e as Error).message;
      if (timedOut) break; // a slow host will be just as slow over http; don't double the wait
    }
  }
  if (!home || (!home.html && !home.blocked)) {
    return emptyEnrichment("unreachable", started, lastError || `HTTP ${home?.status ?? "error"}`);
  }

  const first = extractPage(home.html, home.url);
  if (home.blocked || first.captcha) {
    const e = emptyEnrichment(first.captcha ? "captcha" : "blocked", started, "Bot protection detected — flagged for manual review, not bypassed");
    e.finalUrl = home.url;
    return e;
  }

  const pages: PageFacts[] = [first];
  const origin = new URL(home.url).origin;
  // Subpages in parallel (max 3 requests to one host), each bounded by the page timeout.
  const subs = pickSubpages(first.links, home.url).filter((sub) => isAllowed(rules, new URL(sub).pathname));
  const results = await Promise.allSettled(subs.map((sub) => fetchHtml(sub)));
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.status < 400 && r.value.html && new URL(r.value.url).origin === origin) {
      pages.push(extractPage(r.value.html, r.value.url));
    }
  }

  const pick = <K extends keyof PageFacts>(k: K) => pages.find((p) => p[k] !== undefined && p[k] !== "")?.[k];
  const foundedPage = pages.find((p) => p.founded);
  const headPage = pages.find((p) => p.headcount);
  const hirePage = pages.find((p) => p.hiring) ?? pages.find((p) => /career|jobs|hiring/i.test(p.url));
  const tech = [...new Set(pages.flatMap((p) => p.tech))];
  const allText = pages.map((p) => p.text).join(" ");
  const people = dedupePeople(pages.flatMap((p) => p.people));

  const enrichment: Enrichment = {
    ok: true,
    status: "ok",
    fetchedAt: Date.now(),
    cached: false,
    ms: Date.now() - started,
    finalUrl: home.url,
    pages: pages.map((p) => p.url),
    title: first.title,
    description: first.description,
    emails: await verifyEmails(pages.flatMap((p) => p.emails), domain),
    phones: [...new Set(pages.flatMap((p) => p.phones))].slice(0, 5),
    socials: Object.assign({}, ...pages.map((p) => p.socials).reverse()),
    people,
    foundedYear: foundedPage?.founded?.year,
    foundedQuote: foundedPage?.founded?.quote,
    foundedUrl: foundedPage?.url,
    headcount: headPage?.headcount ? { ...headPage.headcount, url: headPage.url } : undefined,
    familyOwned: pick("familyOwned") as string | undefined,
    generational: [...new Set(pages.flatMap((p) => p.generational))],
    hiring: hirePage ? { quote: hirePage.hiring ?? "Careers page published", url: hirePage.url } : undefined,
    locationsCount: pick("locationsCount") as number | undefined,
    franchise: pick("franchise") as string | undefined,
    tech,
    booking: tech.some((t) => BOOKING_TECH.includes(t)) || /\b(?:book (?:online|now|an appointment)|schedule (?:online|service|now)|request an appointment)\b/i.test(allText),
    ecommerce: tech.some((t) => ["Shopify", "WooCommerce", "Stripe", "Square"].includes(t)) || /add to cart/i.test(allText),
    chat: tech.some((t) => CHAT_TECH.includes(t)),
    analytics: tech.some((t) => ANALYTICS_TECH.includes(t)),
    https: home.url.startsWith("https:"),
    mobile: first.mobile,
    copyrightYear: pages.map((p) => p.copyrightYear).filter(Boolean).sort().pop(),
    address: pick("address") as string | undefined,
    city: pick("city") as string | undefined,
    region: pick("region") as string | undefined,
    textSample: [first.description, allText.slice(0, 1800)].filter(Boolean).join(" — "),
  };
  await cacheSet("enrich", domain, enrichment, ENRICH_TTL);
  return enrichment;
}

function dedupePeople(people: Enrichment["people"]): Enrichment["people"] {
  const seen = new Map<string, Enrichment["people"][number]>();
  const rank = (r: string) => (/owner|founder|president|ceo|proprietor/i.test(r) ? 0 : 1);
  for (const p of people) {
    const k = p.name.toLowerCase();
    const prev = seen.get(k);
    if (!prev || rank(p.role) < rank(prev.role)) seen.set(k, p);
  }
  return [...seen.values()].sort((a, b) => rank(a.role) - rank(b.role)).slice(0, 4);
}
