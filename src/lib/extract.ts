import * as cheerio from "cheerio";
import type { Person, Socials } from "./types";
import { normalizeDomain, normalizePhone } from "./domain";

/** Facts pulled from a single HTML page. Several independent extractors so a redesign rarely breaks all of them. */
export interface PageFacts {
  url: string;
  title?: string;
  description?: string;
  emails: { address: string; url: string }[];
  phones: string[];
  socials: Socials;
  people: Person[];
  founded?: { year: number; quote: string };
  headcount?: { value: number; quote: string };
  familyOwned?: string;
  generational: string[];
  hiring?: string;
  locationsCount?: number;
  franchise?: string;
  tech: string[];
  copyrightYear?: number;
  mobile: boolean;
  address?: string;
  city?: string;
  region?: string;
  text: string;
  links: { href: string; text: string }[];
  captcha: boolean;
}

const THIS_YEAR = new Date().getFullYear();
const YEAR = `(18[5-9]\\d|19\\d\\d|20[0-2]\\d)`;

const TECH: [string, RegExp][] = [
  ["Google Analytics", /google-analytics\.com|googletagmanager\.com\/gtag|gtag\(\s*['"]config/i],
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]{4,}/],
  ["Meta Pixel", /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/i],
  ["WordPress", /wp-content\/|wp-includes\//i],
  ["WooCommerce", /woocommerce/i],
  ["Wix", /static\.wixstatic\.com|wix-bolt|_wixCIDX/i],
  ["Squarespace", /static1\.squarespace\.com|squarespace-cdn/i],
  ["GoDaddy Website Builder", /img1\.wsimg\.com|websites\.godaddy/i],
  ["Weebly", /weebly\.com|editmysite\.com/i],
  ["Shopify", /cdn\.shopify\.com|myshopify\.com/i],
  ["Webflow", /webflow\.(com|io)|data-wf-page/i],
  ["Duda", /dudamobile|multiscreensite\.com|irp\.cdn-website\.com/i],
  ["HubSpot", /js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics/i],
  ["Salesforce / Pardot", /pardot\.com|force\.com\/|salesforce-sites/i],
  ["ServiceTitan", /servicetitan/i],
  ["Housecall Pro", /housecallpro/i],
  ["Jobber", /getjobber\.com|clienthub\.getjobber/i],
  ["Podium", /podium\.com|podium-webchat/i],
  ["Birdeye", /birdeye\.com/i],
  ["Calendly", /calendly\.com/i],
  ["Acuity Scheduling", /acuityscheduling\.com/i],
  ["Stripe", /js\.stripe\.com/i],
  ["Square", /squareup\.com|square\.site/i],
  ["Intercom", /widget\.intercom\.io|intercomcdn/i],
  ["Drift", /js\.driftt\.com|drift\.com\/include/i],
  ["Tawk.to", /embed\.tawk\.to/i],
  ["Zendesk", /zdassets\.com|zopim/i],
  ["Tidio", /code\.tidio\.co/i],
  ["LiveChat", /cdn\.livechatinc\.com/i],
  ["Mailchimp", /list-manage\.com|chimpstatic\.com/i],
  ["Next.js", /\/_next\/static\/|__NEXT_DATA__/],
  ["React", /data-reactroot|react-dom/i],
  ["Cloudflare", /cdn-cgi\/|cloudflare/i],
  ["reCAPTCHA", /google\.com\/recaptcha/i],
];

export { BOOKING_TECH, CHAT_TECH, ANALYTICS_TECH, DIY_BUILDERS } from "./tech";

const ROLE_WORDS = "Owner|Co-Owner|Founder|Co-Founder|President|CEO|Chief Executive Officer|Principal|Managing Partner|Proprietor|General Manager|Managing Director";
const NAME = "([A-Z][a-z]+(?:\\s[A-Z]\\.)?\\s(?:Mc|Mac|O')?[A-Z][a-zA-Z'’-]+)";
const NOT_NAMES = /^(Our|The|Your|About|Contact|Meet|Air|Heating|Service|Services|Home|Free|Call|Get|Read|Learn|Family|Owner|Founder|Customer|Privacy|Terms|Request|View|Best|Top|New|North|South|East|West|Google|Facebook|United|Since|Company|Business|Team)\b/;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function quoteAround(text: string, index: number, len: number, pad = 70): string {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + len + pad);
  return (start > 0 ? "…" : "") + clean(text.slice(start, end)) + (end < text.length ? "…" : "");
}

function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

type JsonLdNode = Record<string, unknown>;

function flattenJsonLd(raw: unknown): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const node = n as JsonLdNode;
    out.push(node);
    if (node["@graph"]) walk(node["@graph"]);
  };
  walk(raw);
  return out;
}

const BUSINESS_TYPES = /Organization|LocalBusiness|Corporation|Store|Service|Contractor|Plumber|Electrician|HVAC|Dentist|Attorney|Restaurant|Bakery|AutoRepair|Roofing|MedicalBusiness|ProfessionalService|HomeAndConstructionBusiness/i;

export function extractPage(html: string, url: string): PageFacts {
  const $ = cheerio.load(html);
  const siteDomain = normalizeDomain(url);
  const title = clean($("title").first().text()) || undefined;
  const description = clean($('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "") || undefined;
  const captcha =
    /just a moment|attention required|verify you are human|access denied|are you a robot/i.test(title ?? "") ||
    (html.length < 20_000 && /cf-chl|challenge-platform|g-recaptcha|hcaptcha/i.test(html) && !/<nav/i.test(html));

  // Structured data first: most reliable when present.
  const jsonld: JsonLdNode[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonld.push(...flattenJsonLd(JSON.parse($(el).contents().text())));
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });

  const tech = TECH.filter(([, re]) => re.test(html)).map(([name]) => name);
  const mobile = $('meta[name="viewport"]').length > 0;

  const emails: { address: string; url: string }[] = [];
  const phones = new Set<string>();
  const socials: Socials = {};
  const links: { href: string; text: string }[] = [];

  $("[data-cfemail]").each((_, el) => {
    const hex = $(el).attr("data-cfemail");
    if (hex) emails.push({ address: decodeCfEmail(hex), url });
  });
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    const text = clean($(el).text()).slice(0, 80);
    if (/^mailto:/i.test(href)) emails.push({ address: decodeURIComponent(href.slice(7)).split("?")[0], url });
    else if (/^tel:/i.test(href)) {
      const p = normalizePhone(decodeURIComponent(href.slice(4)));
      if (p) phones.add(p);
    } else if (/\/cdn-cgi\/l\/email-protection#/.test(href)) {
      emails.push({ address: decodeCfEmail(href.split("#")[1]), url });
    } else {
      let abs: URL | undefined;
      try {
        abs = new URL(href, url);
      } catch {
        return;
      }
      const host = abs.hostname.replace(/^www\./, "");
      if (/linkedin\.com$/.test(host) && /\/(company|in)\//.test(abs.pathname)) socials.linkedin ??= abs.toString();
      else if (/facebook\.com$/.test(host) && abs.pathname.length > 1 && !/sharer|plugins|dialog/.test(abs.pathname)) socials.facebook ??= abs.toString();
      else if (/instagram\.com$/.test(host) && abs.pathname.length > 1) socials.instagram ??= abs.toString();
      else if (/(twitter|x)\.com$/.test(host) && abs.pathname.length > 1 && !/intent|share/.test(abs.pathname)) socials.x ??= abs.toString();
      else if (/youtube\.com$/.test(host)) socials.youtube ??= abs.toString();
      else if (/yelp\.com$/.test(host) && abs.pathname.startsWith("/biz")) socials.yelp ??= abs.toString();
      else if (normalizeDomain(abs.hostname) === siteDomain && /^https?:$/.test(abs.protocol)) links.push({ href: abs.toString().split("#")[0], text });
    }
  });

  $("script, style, noscript, svg, iframe, template").remove();
  const footerText = clean($("footer").text());
  const text = clean($("body").text());

  for (const m of text.matchAll(/\b([a-z0-9._%+-]+)\s*(?:@|\[at\]|\(at\))\s*([a-z0-9-]+(?:\s*(?:\.|\[dot\]|\(dot\))\s*[a-z0-9-]+)*\s*(?:\.|\[dot\]|\(dot\))\s*[a-z]{2,})\b/gi)) {
    emails.push({ address: `${m[1]}@${m[2].replace(/\s*(?:\[dot\]|\(dot\))\s*/gi, ".").replace(/\s+/g, "")}`, url });
  }
  for (const m of text.matchAll(/(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g)) {
    const p = normalizePhone(m[0]);
    if (p && phones.size < 6) phones.add(p);
  }

  const people: Person[] = [];
  let founded: PageFacts["founded"];
  let address: string | undefined;
  let city: string | undefined;
  let region: string | undefined;

  for (const node of jsonld) {
    const type = asArray(node["@type"] as string | string[]).join(" ");
    if (!BUSINESS_TYPES.test(type)) continue;
    const fd = String(node.foundingDate ?? "").match(new RegExp(YEAR));
    if (fd && !founded) founded = { year: Number(fd[1]), quote: `Structured data: foundingDate "${node.foundingDate}"` };
    for (const f of [...asArray(node.founder as JsonLdNode | JsonLdNode[]), ...asArray(node.employee as JsonLdNode | JsonLdNode[])]) {
      const name = typeof f === "string" ? f : (f?.name as string | undefined);
      if (name && /\s/.test(name)) people.push({ name: clean(name), role: (f as JsonLdNode)?.jobTitle ? String((f as JsonLdNode).jobTitle) : "Founder", url, quote: "Structured data (schema.org)" });
    }
    const addr = node.address as JsonLdNode | undefined;
    if (addr && typeof addr === "object" && !address) {
      address = clean([addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(", "));
      city = addr.addressLocality ? String(addr.addressLocality) : undefined;
      region = addr.addressRegion ? String(addr.addressRegion) : undefined;
    }
    if (node.telephone) {
      const p = normalizePhone(String(node.telephone));
      if (p) phones.add(p);
    }
    if (node.email) emails.push({ address: String(node.email).replace(/^mailto:/, ""), url });
  }

  if (!founded) {
    const patterns = [
      new RegExp(`\\b(?:since|est\\.?|established(?:\\s+in)?|founded(?:\\s+in)?|serving[^.]{0,50}?since|in business since|opened(?:\\s+(?:our|its)\\s+doors)?\\s+in)\\s*(?:the\\s+year\\s+)?${YEAR}\\b`, "i"),
      new RegExp(`\\b${YEAR}\\s*(?:–|-|to)?\\s*(?:founded|established)\\b`, "i"),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m.index !== undefined) {
        const year = Number(m[1]);
        if (year <= THIS_YEAR) {
          founded = { year, quote: quoteAround(text, m.index, m[0].length) };
          break;
        }
      }
    }
  }
  if (!founded) {
    const m = text.match(/\b(?:over|more than|nearly|for)?\s*(\d{2,3})\+?\s+years\s+(?:in business|of (?:family[- ])?(?:business|service|serving)|serving)\b/i);
    if (m && m.index !== undefined) {
      const n = Number(m[1]);
      if (n >= 5 && n <= 150) founded = { year: THIS_YEAR - n, quote: quoteAround(text, m.index, m[0].length) };
    }
  }

  const roleRes = [
    new RegExp(`${NAME}\\s*[,–—|-]\\s*(?:the\\s+)?(${ROLE_WORDS})\\b`, "g"),
    new RegExp(`\\b(${ROLE_WORDS})\\s*(?:[:,–—|-]|and)\\s*${NAME}`, "g"),
    new RegExp(`\\b(?:owned|founded|started|run)\\s+by\\s+${NAME}`, "g"),
  ];
  roleRes.forEach((re, idx) => {
    for (const m of text.matchAll(re)) {
      const name = idx === 1 ? m[2] : m[1];
      const role = idx === 0 ? m[2] : idx === 1 ? m[1] : "Owner";
      if (!name || NOT_NAMES.test(name) || people.some((p) => p.name === name)) continue;
      people.push({ name, role, url, quote: quoteAround(text, m.index ?? 0, m[0].length, 40) });
      if (people.length >= 5) break;
    }
  });

  let headcount: PageFacts["headcount"];
  const hc = text.match(/\b(?:team of|staff of|over|more than|employs|employing|nearly)\s+(\d{1,4})\+?\s+(?:full[- ]time\s+)?(?:employees|team members|technicians|techs|professionals|staff|people|associates|craftsmen)\b/i)
    ?? text.match(/\b(\d{1,4})\+?\s+(?:employees|team members|technicians|certified technicians)\b/i);
  if (hc && hc.index !== undefined) {
    const n = Number(hc[1]);
    if (n >= 2 && n <= 5000) headcount = { value: n, quote: quoteAround(text, hc.index, hc[0].length) };
  }

  const fam = text.match(/\b(?:family[- ]owned(?:\s+and\s+operated)?|family business|locally owned and operated|owner[- ]operated|family[- ]run)\b/i);
  const familyOwned = fam && fam.index !== undefined ? quoteAround(text, fam.index, fam[0].length, 50) : undefined;
  const generational = [...text.matchAll(/\b(?:second|third|fourth|fifth|2nd|3rd|4th|5th)[- ]generation\b|\bfather(?:[- ]and[- ]|\s*&\s*)son\b|\bpassed down\b|\bgrandfather\b|\bthree generations\b/gi)]
    .map((m) => clean(m[0]))
    .slice(0, 3);

  const hireMatch = text.match(/\b(?:now hiring|we['’]?re hiring|we are hiring|join our team|open positions|career opportunities|job openings|apply today)\b/i);
  const hiring = hireMatch && hireMatch.index !== undefined ? quoteAround(text, hireMatch.index, hireMatch[0].length, 40) : undefined;

  const loc = text.match(/\b(\d{1,3})\s+(?:convenient\s+)?(?:locations|branches|offices|stores)\b/i);
  const locationsCount = loc ? Number(loc[1]) : undefined;

  const fr = text.match(/\b(?:independently owned and operated franchise|each (?:location|franchise|office|business) is independently owned|independently owned and operated|franchise opportunit(?:y|ies)|own a franchise|become a franchisee|franchisee of|an? (?:neighborly|authority brands|horizon services|wrench group) company)\b/i);
  const franchise = fr && fr.index !== undefined ? quoteAround(text, fr.index, fr[0].length, 50) : undefined;

  const years = [...(footerText || text.slice(-1500)).matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
  const copyrightYear = years.filter((y) => y > 1995 && y <= THIS_YEAR).sort().pop();

  return {
    url,
    title,
    description,
    emails,
    phones: [...phones],
    socials,
    people,
    founded,
    headcount,
    familyOwned,
    generational,
    hiring,
    locationsCount,
    franchise,
    tech,
    copyrightYear,
    mobile,
    address,
    city,
    region,
    text: text.slice(0, 20_000),
    links,
    captcha,
  };
}

const SUBPAGE_HINTS: [RegExp, number][] = [
  [/about|our-story|who-we-are|history|company|our-company/i, 5],
  [/team|staff|leadership|owner|meet/i, 4],
  [/contact/i, 3],
  [/career|jobs|hiring|employment|join/i, 2],
];

/** Pick up to `max` same-site pages most likely to hold founding, owner and contact facts. */
export function pickSubpages(links: { href: string; text: string }[], home: string, max = 3): string[] {
  const homeUrl = new URL(home);
  const scored = new Map<string, number>();
  for (const { href, text } of links) {
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.pathname === "/" || u.pathname === homeUrl.pathname) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?)$/i.test(u.pathname)) continue;
    const hay = `${u.pathname} ${text}`;
    const score = SUBPAGE_HINTS.reduce((s, [re, w]) => (re.test(hay) ? Math.max(s, w) : s), 0);
    if (!score) continue;
    const key = `${u.origin}${u.pathname}`;
    scored.set(key, Math.max(scored.get(key) ?? 0, score - u.pathname.split("/").length * 0.1));
  }
  const chosen: string[] = [];
  const kinds = new Set<number>();
  for (const [href, score] of [...scored].sort((a, b) => b[1] - a[1])) {
    const kind = Math.round(score);
    if (kinds.has(kind) && chosen.length < max - 1) continue; // prefer one page per kind
    kinds.add(kind);
    chosen.push(href);
    if (chosen.length >= max) break;
  }
  return chosen;
}
