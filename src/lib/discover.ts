import type { Lead } from "./types";
import { INDUSTRIES, industryByKey, industryFromOsmTags, type Industry } from "./industries";
import { cacheGet, cacheSet } from "./db";
import { firstSuccess } from "./concurrency";
import { hashId, isPlatformDomain, normalizeDomain, normalizePhone, toUrl } from "./domain";
import { USER_AGENT } from "./crawler";

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export interface Place {
  label: string;
  bbox: [number, number, number, number]; // south, west, north, east
  clipped: boolean;
}

/** Geocode a free-text location with Nominatim (1 req/s policy respected by 30-day caching). */
export async function geocode(query: string): Promise<Place> {
  const key = query.trim().toLowerCase();
  const cached = await cacheGet<Place>("geo", key);
  if (cached) return cached;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "en" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Geocoder returned HTTP ${res.status}`);
  const [hit] = (await res.json()) as { display_name: string; boundingbox: string[]; lat: string; lon: string }[];
  if (!hit) throw new Error(`Could not find "${query}". Try "City, State".`);
  let [south, north, west, east] = hit.boundingbox.map(Number);
  let clipped = false;
  // Large regions (states, countries) would time out Overpass. Clip to a ~40 km metro box around the centroid.
  const MAX_SPAN = 0.7;
  if (north - south > MAX_SPAN || east - west > MAX_SPAN) {
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    [south, north, west, east] = [lat - MAX_SPAN / 2, lat + MAX_SPAN / 2, lon - MAX_SPAN / 2, lon + MAX_SPAN / 2];
    clipped = true;
  }
  const place: Place = { label: hit.display_name, bbox: [south, west, north, east], clipped };
  await cacheSet("geo", key, place, 30 * 24 * 3600_000);
  return place;
}

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function overpass(query: string): Promise<OsmElement[]> {
  const controllers = OVERPASS.map(() => new AbortController());
  const attempts = OVERPASS.map(async (endpoint, i) => {
    // Stagger mirrors slightly so a healthy primary usually answers alone.
    await new Promise((r) => setTimeout(r, i * 1500));
    if (controllers[i].signal.aborted) throw new Error("cancelled");
    const res = await fetch(endpoint, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.any([controllers[i].signal, AbortSignal.timeout(28_000)]),
    });
    const body = await res.text();
    if (!res.ok || !body.trimStart().startsWith("{")) throw new Error(`${new URL(endpoint).host}: HTTP ${res.status}`);
    const json = JSON.parse(body) as { elements: OsmElement[]; remark?: string };
    if (json.remark && /runtime error|timeout/i.test(json.remark) && !json.elements.length) throw new Error(json.remark);
    return { i, elements: json.elements };
  });
  const { i, elements } = await firstSuccess(attempts);
  controllers.forEach((c, j) => j !== i && c.abort());
  return elements;
}

export function buildOverpassQuery(industries: Industry[], bbox: Place["bbox"], limit: number): string {
  const b = bbox.map((n) => n.toFixed(4)).join(",");
  const parts = industries.flatMap((ind) => ind.osm.map(([k, v]) => `nwr["${k}"="${v}"]["name"](${b});`));
  return `[out:json][timeout:25];(${parts.join("")});out tags center ${limit};`;
}

export function osmToLead(el: OsmElement, fallbackIndustry?: Industry): Lead | null {
  const t = el.tags ?? {};
  const name = t.name?.trim();
  if (!name) return null;
  const rawSite = t.website ?? t["contact:website"] ?? t.url;
  const domain = normalizeDomain(rawSite);
  const website = domain && !isPlatformDomain(domain) ? toUrl(rawSite) : undefined;
  const phone = normalizePhone(t.phone ?? t["contact:phone"]);
  const email = (t.email ?? t["contact:email"])?.toLowerCase();
  const industry = industryFromOsmTags(t) ?? fallbackIndustry;
  const osmUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;
  const src = { source: "OpenStreetMap" as const, url: osmUrl };
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const lead: Lead = {
    id: `osm-${el.type[0]}${el.id}`,
    name,
    domain: website ? domain : undefined,
    website,
    phone,
    email,
    industry: industry?.label,
    address: street || undefined,
    city: t["addr:city"],
    region: t["addr:state"] ?? t["addr:province"],
    postcode: t["addr:postcode"],
    country: t["addr:country"],
    lat: el.lat ?? el.center?.lat,
    lon: el.lon ?? el.center?.lon,
    openingHours: t.opening_hours,
    brand: t.brand ?? (t["brand:wikidata"] || t["operator:wikidata"] ? t.operator ?? name : undefined),
    sources: ["OpenStreetMap"],
    duplicatesMerged: 0,
    provenance: {},
    stage: "new",
    notes: "",
    addedAt: Date.now(),
  };
  for (const f of ["name", "website", "phone", "email", "address", "city", "industry"] as const) if (lead[f]) lead.provenance[f] = src;
  return lead;
}

export interface DiscoverResult {
  place: Place;
  leads: Lead[];
  raw: number;
  withWebsite: number;
  cached: boolean;
}

/** Find real, currently-mapped businesses by industry within a location. Cached 24h per (industries, place). */
export async function discover(industryKeys: string[], location: string, limit = 60): Promise<DiscoverResult> {
  const industries = industryKeys.map(industryByKey).filter((i): i is Industry => !!i);
  if (!industries.length) throw new Error(`Pick at least one industry (${INDUSTRIES.slice(0, 4).map((i) => i.label).join(", ")}…)`);
  const place = await geocode(location);
  const cacheKey = hashId(`${industries.map((i) => i.key).sort().join(",")}|${place.bbox.join(",")}|${limit}`);
  const hit = await cacheGet<DiscoverResult>("discover", cacheKey);
  if (hit) return { ...hit, cached: true };

  // Over-fetch, then keep the most actionable records (with a website/phone) first.
  const elements = await overpass(buildOverpassQuery(industries, place.bbox, Math.min(limit * 4, 400)));
  const leads = elements
    .map((el) => osmToLead(el, industries.length === 1 ? industries[0] : undefined))
    .filter((l): l is Lead => !!l)
    .sort((a, b) => Number(!!b.website) * 2 + Number(!!b.phone) - (Number(!!a.website) * 2 + Number(!!a.phone)))
    .slice(0, limit);
  const result: DiscoverResult = { place, leads, raw: elements.length, withWebsite: leads.filter((l) => l.website).length, cached: false };
  await cacheSet("discover", cacheKey, result, 24 * 3600_000);
  return result;
}
