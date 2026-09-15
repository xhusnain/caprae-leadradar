import Papa from "papaparse";
import type { Lead, ScoreResult } from "./types";
import { hashId, isPlatformDomain, normalizeDomain, normalizePhone, toUrl, formatPhone } from "./domain";
import { bestEmail, decisionMaker, formatMoney, TIER_LABEL } from "./score";
import { STAGES } from "./types";

/** Header aliases, including the exact columns SaaSquatch's Company Search table exports. */
const ALIASES: Record<string, string[]> = {
  name: ["company", "company name", "business name", "name", "organization", "account name"],
  website: ["website", "url", "domain", "company website", "web", "site", "company domain name"],
  phone: ["company phone", "phone", "phone number", "telephone", "main phone"],
  email: ["email", "company email", "email address", "work email"],
  industry: ["industry", "category", "sector", "business type", "vertical"],
  address: ["address", "street", "street address", "location"],
  city: ["city", "town"],
  region: ["state", "region", "province", "state/region"],
  postcode: ["zip", "postal code", "zip code", "postcode"],
  revenue: ["estimated revenue", "revenue", "annual revenue"],
  bbb: ["bbb rating", "bbb"],
  employees: ["employees", "employee count", "company size", "headcount"],
  owner: ["owner", "contact name", "full name", "person", "decision maker", "name (person)"],
  title: ["title", "job title", "position"],
  linkedin: ["linkedin", "linkedin url", "company linkedin", "person linkedin"],
};

export type ColumnMap = Partial<Record<keyof typeof ALIASES, string>>;

export function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const norm = (h: string) => h.toLowerCase().replace(/[_*]/g, " ").replace(/\s+/g, " ").trim();
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const exact = headers.find((h) => aliases.includes(norm(h)));
    const loose = exact ?? headers.find((h) => aliases.some((a) => a.length > 3 && norm(h).includes(a)));
    if (loose && !Object.values(map).includes(loose)) map[field as keyof typeof ALIASES] = loose;
  }
  return map;
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
  return { headers: res.meta.fields ?? [], rows: res.data };
}

const clean = (v?: string) => {
  const s = (v ?? "").trim();
  return !s || /^(n\/a|na|null|none|-)$/i.test(s) ? undefined : s;
};

export function rowsToLeads(rows: Record<string, string>[], map: ColumnMap, source = "CSV import"): Lead[] {
  const out: Lead[] = [];
  for (const row of rows) {
    const get = (k: keyof typeof ALIASES) => (map[k] ? clean(row[map[k]!]) : undefined);
    const rawSite = get("website");
    const domain = normalizeDomain(rawSite);
    const name = get("name") ?? domain;
    if (!name) continue;
    const website = domain && !isPlatformDomain(domain) ? toUrl(rawSite) : undefined;
    const src = { source: "CSV import" as const };
    const lead: Lead = {
      id: `csv-${hashId(`${name}|${domain ?? ""}|${get("phone") ?? ""}`)}`,
      name,
      domain: website ? domain : undefined,
      website,
      phone: normalizePhone(get("phone")),
      email: get("email")?.toLowerCase(),
      industry: get("industry"),
      address: get("address"),
      city: get("city"),
      region: get("region"),
      postcode: get("postcode"),
      imported: { revenue: get("revenue"), bbb: get("bbb"), employees: get("employees"), owner: get("owner"), title: get("title"), linkedin: get("linkedin") },
      sources: [source],
      duplicatesMerged: 0,
      provenance: {},
      stage: "new",
      notes: "",
      addedAt: Date.now(),
    };
    for (const f of ["name", "website", "phone", "email", "industry", "address"] as const) if (lead[f]) lead.provenance[f] = src;
    // SaaSquatch puts "street, city state" in one Address cell; recover city when no City column exists.
    if (!lead.city && lead.address) {
      const m = lead.address.match(/,\s*([A-Za-z .'-]+?)\s*,?\s+([A-Z]{2})\b/);
      if (m) {
        lead.city = m[1];
        lead.region = m[2];
      }
    }
    out.push(lead);
  }
  return out;
}

/** Paste box: one domain, URL, or email per line (or comma-separated). */
export function linesToLeads(text: string): Lead[] {
  const tokens = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  return tokens.flatMap((t) => {
    const domain = normalizeDomain(t);
    if (!domain || seen.has(domain) || isPlatformDomain(domain)) return [];
    seen.add(domain);
    const label = domain.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return [{
      id: `web-${domain}`, name: label, domain, website: `https://${domain}`, email: t.includes("@") ? t.toLowerCase() : undefined,
      sources: ["Manual"], duplicatesMerged: 0, provenance: { website: { source: "Manual" } }, stage: "new", notes: "", addedAt: Date.now(),
    } satisfies Lead];
  });
}

/** Neutralise spreadsheet formula injection (=, +, -, @ at cell start). */
export function safeCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const safe = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])));
  return Papa.unparse(safe);
}

type Ranked = { lead: Lead; score: ScoreResult };

export type ExportPreset = "full" | "hubspot" | "salesforce" | "call-list";

export const EXPORT_PRESETS: { key: ExportPreset; label: string; hint: string }[] = [
  { key: "full", label: "Full intelligence CSV", hint: "Every field, score, evidence and source" },
  { key: "hubspot", label: "HubSpot import", hint: "Companies + contacts, native property names" },
  { key: "salesforce", label: "Salesforce Leads", hint: "Standard Lead object fields" },
  { key: "call-list", label: "Call sheet", hint: "A/B leads with phone, opener and next step" },
];

export function exportLeads(ranked: Ranked[], preset: ExportPreset): string {
  const stageLabel = (l: Lead) => STAGES.find((s) => s.key === l.stage)?.label ?? l.stage;
  const rows = ranked.map(({ lead: l, score: s }) => {
    const e = l.enrichment;
    const email = bestEmail(l)?.address ?? l.email ?? "";
    const dm = decisionMaker(l);
    const [first, ...rest] = (dm?.name ?? "").split(" ");
    const phone = formatPhone(e?.phones[0] ?? l.phone);
    const city = l.city ?? e?.city ?? "";
    const state = l.region ?? e?.region ?? "";
    const revenue = s.revenue ? `${formatMoney(s.revenue.low)}–${formatMoney(s.revenue.high)}` : l.imported?.revenue ?? "";
    switch (preset) {
      case "hubspot":
        return {
          "Company name": l.name, "Company Domain Name": l.domain ?? "", "Phone Number": phone, "City": city, "State/Region": state,
          "Industry": l.industry ?? "", "Year Founded": e?.foundedYear ?? "", "Number of Employees": e?.headcount?.value ?? "",
          "Annual Revenue": s.revenue ? Math.round((s.revenue.low + s.revenue.high) / 2) : "", "LinkedIn Company Page": e?.socials.linkedin ?? "",
          "First Name": first ?? "", "Last Name": rest.join(" "), "Job Title": dm?.role ?? "", "Email": email,
          "Lead Status": "NEW", "LeadRadar Score": s.total, "LeadRadar Tier": `${s.tier} · ${TIER_LABEL[s.tier]}`,
          "LeadRadar Reasons": s.reasons.join(" | "), "LeadRadar Next Step": s.next.label,
        };
      case "salesforce":
        return {
          Company: l.name, FirstName: first ?? "", LastName: rest.join(" ") || "(Owner)", Title: dm?.role ?? "", Email: email, Phone: phone,
          Website: l.website ?? "", Street: l.address ?? e?.address ?? "", City: city, State: state, PostalCode: l.postcode ?? "",
          Industry: l.industry ?? "", NumberOfEmployees: e?.headcount?.value ?? "", LeadSource: `LeadRadar (${l.sources.join(" + ")})`,
          Rating: s.tier === "A" ? "Hot" : s.tier === "B" ? "Warm" : "Cold", Description: `Score ${s.total}/100. ${s.reasons.join("; ")}. Next: ${s.next.label}`,
        };
      case "call-list":
        return {
          Tier: s.tier, Score: s.total, Company: l.name, "Ask for": dm ? `${dm.name} (${dm.role})` : "Owner", Phone: phone, Email: email,
          City: city, "Why call": s.signals.slice(0, 2).map((x) => x.label).join("; "), "Next step": s.next.label, Stage: stageLabel(l), Notes: l.notes,
        };
      default:
        return {
          Rank: 0, Score: s.total, Tier: s.tier, Company: l.name, Website: l.website ?? "", Domain: l.domain ?? "", Industry: l.industry ?? "",
          Address: l.address ?? e?.address ?? "", City: city, State: state, Phone: phone, "All phones": (e?.phones ?? []).map(formatPhone).join(" / "),
          "Best email": email, "Email type": bestEmail(l)?.kind ?? "", "Email domain accepts mail": bestEmail(l)?.mx ?? "",
          "Decision maker": dm?.name ?? "", Role: dm?.role ?? "", Founded: e?.foundedYear ?? "", "Founded evidence": e?.foundedQuote ?? "",
          "Est. revenue": revenue, "Revenue method": s.revenue?.method ?? (l.imported?.revenue ? "SaaSquatch estimate" : ""),
          Headcount: e?.headcount?.value ?? l.imported?.employees ?? "", "Tech stack": (e?.tech ?? []).join(", "),
          Signals: s.signals.map((x) => x.label).join(" | "), Reasons: s.reasons.join(" | "), "Next step": s.next.label,
          "Data coverage %": Math.round(s.coverage * 100), "Completeness %": Math.round(s.completeness * 100),
          LinkedIn: e?.socials.linkedin ?? l.imported?.linkedin ?? "", Facebook: e?.socials.facebook ?? "", Sources: l.sources.join(" + "),
          "Duplicates merged": l.duplicatesMerged, Stage: stageLabel(l), Notes: l.notes, "Enriched at": e ? new Date(e.fetchedAt).toISOString() : "",
        };
    }
  });
  if (preset === "call-list") return toCsv(rows.filter((_, i) => ["A", "B"].includes(ranked[i].score.tier)));
  if (preset === "full") rows.forEach((r, i) => ((r as { Rank: number }).Rank = i + 1));
  return toCsv(rows);
}
