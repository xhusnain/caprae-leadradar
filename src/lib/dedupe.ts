import type { Lead } from "./types";
import { isPlatformDomain, nameKey, nameSimilarity } from "./domain";

/**
 * Entity resolution across sources. Two records are the same business when they share a
 * real (non-platform) domain, the same phone number, or a near-identical name in the same city.
 * Connected components (union-find) are merged, so A~B and B~C collapse into one lead.
 */
export function dedupeLeads(leads: Lead[]): { leads: Lead[]; removed: number } {
  const parent = leads.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const byKey = new Map<string, number>();
  const link = (key: string | undefined, i: number) => {
    if (!key) return;
    const j = byKey.get(key);
    if (j === undefined) byKey.set(key, i);
    else union(i, j);
  };

  leads.forEach((l, i) => {
    if (l.domain && !isPlatformDomain(l.domain)) link(`d:${l.domain}`, i);
    if (l.phone) link(`p:${l.phone}`, i);
    const nk = nameKey(l.name);
    if (nk) link(`n:${nk}|${(l.city ?? "").toLowerCase()}`, i);
  });

  // Fuzzy pass, bucketed by first letter of the normalized name to stay near-linear.
  const buckets = new Map<string, number[]>();
  leads.forEach((l, i) => {
    const nk = nameKey(l.name);
    if (!nk) return;
    const b = nk[0];
    buckets.set(b, [...(buckets.get(b) ?? []), i]);
  });
  for (const idx of buckets.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const a = leads[idx[x]];
        const b = leads[idx[y]];
        const sameCity = !a.city || !b.city || a.city.toLowerCase() === b.city.toLowerCase();
        const conflictingDomains = a.domain && b.domain && a.domain !== b.domain;
        if (sameCity && !conflictingDomains && nameSimilarity(a.name, b.name) >= 0.9) union(idx[x], idx[y]);
      }
    }
  }

  const groups = new Map<number, Lead[]>();
  leads.forEach((l, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), l]);
  });

  const merged = [...groups.values()].map(mergeGroup);
  return { leads: merged, removed: leads.length - merged.length };
}

function richness(l: Lead): number {
  return [l.domain, l.phone, l.email, l.address, l.city, l.industry, l.enrichment?.ok].filter(Boolean).length;
}

export function mergeGroup(group: Lead[]): Lead {
  if (group.length === 1) return group[0];
  const sorted = [...group].sort((a, b) => richness(b) - richness(a));
  const base: Lead = { ...sorted[0], provenance: { ...sorted[0].provenance } };
  const fields = ["domain", "website", "phone", "email", "industry", "address", "city", "region", "postcode", "country", "lat", "lon", "openingHours"] as const;
  for (const other of sorted.slice(1)) {
    for (const f of fields) {
      if (base[f] === undefined && other[f] !== undefined) {
        (base as unknown as Record<string, unknown>)[f] = other[f];
        if (other.provenance[f]) base.provenance[f] = other.provenance[f];
      }
    }
    base.imported = { ...other.imported, ...base.imported };
    base.enrichment ??= other.enrichment;
    if (base.stage === "new" && other.stage !== "new") base.stage = other.stage;
    base.notes = [base.notes, other.notes].filter(Boolean).join("\n");
    base.addedAt = Math.min(base.addedAt, other.addedAt);
  }
  base.sources = [...new Set(group.flatMap((l) => l.sources))];
  base.duplicatesMerged = group.reduce((n, l) => n + l.duplicatesMerged, 0) + group.length - 1;
  return base;
}
