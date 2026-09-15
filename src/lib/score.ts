import type { BuyBox, Estimate, FactorKey, FactorResult, Lead, Lens, NextAction, ScoreResult, Signal, Tier, Weights } from "./types";
import { DIY_BUILDERS } from "./tech";
import { matchIndustry } from "./industries";

export const DEFAULT_WEIGHTS: Record<Lens, Weights> = {
  acquisition: { tenure: 30, upside: 20, reach: 20, fit: 15, proof: 15 },
  sales: { tenure: 10, upside: 30, reach: 25, fit: 20, proof: 15 },
};

export const FACTOR_META: Record<Lens, Record<FactorKey, { label: string; blurb: string }>> = {
  acquisition: {
    tenure: { label: "Succession pressure", blurb: "Long-tenured, family-run businesses are likelier to have an owner thinking about exit." },
    upside: { label: "AI value-creation upside", blurb: "Operational and digital gaps a new owner can close quickly after acquisition." },
    reach: { label: "Owner reachability", blurb: "Can you actually get the decision-maker on the phone or in their inbox?" },
    fit: { label: "Buy-box fit", blurb: "Matches your target industries, geography and minimum years in business." },
    proof: { label: "Established & operating", blurb: "Evidence the business is real, live and rooted locally." },
  },
  sales: {
    tenure: { label: "Company maturity", blurb: "Established companies have budgets and processes to buy." },
    upside: { label: "Need & buying signals", blurb: "Hiring, missing tooling and stale systems suggest an active need." },
    reach: { label: "Reachability", blurb: "A named decision-maker and verified channel shorten the cycle." },
    fit: { label: "ICP fit", blurb: "Matches your target industries and territories." },
    proof: { label: "Legitimacy", blurb: "Live website, address and public footprint." },
  },
};

export function defaultBuyBox(lens: Lens = "acquisition"): BuyBox {
  return { lens, industries: [], regions: [], minYears: null, weights: { ...DEFAULT_WEIGHTS[lens] }, profile: { name: "", pitch: "" } };
}

/** Unknown factors score at a below-average prior, so thin data can never float a lead to the top. */
const UNKNOWN_PRIOR = 0.3;
const THIS_YEAR = new Date().getFullYear();
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function tierFor(total: number): Tier {
  return total >= 70 ? "A" : total >= 55 ? "B" : total >= 40 ? "C" : "D";
}

export const TIER_LABEL: Record<Tier, string> = { A: "Priority", B: "Strong", C: "Nurture", D: "Low fit" };

function f(lens: Lens, key: FactorKey, weights: Weights, r: Omit<FactorResult, "key" | "label" | "weight">): FactorResult {
  return { key, label: FACTOR_META[lens][key].label, weight: weights[key], ...r, score: clamp(r.score) };
}

export function bestEmail(lead: Lead) {
  const e = lead.enrichment;
  const found = e?.emails.filter((m) => m.mx !== false && !m.disposable) ?? [];
  return found.find((m) => m.kind === "named") ?? found.find((m) => m.kind === "role") ?? found[0];
}

export function decisionMaker(lead: Lead) {
  const p = lead.enrichment?.people[0];
  if (p) return p;
  if (lead.imported?.owner) return { name: lead.imported.owner, role: lead.imported.title || "Owner", quote: "From SaaSquatch export" };
  return undefined;
}

export function yearsInBusiness(lead: Lead): number | undefined {
  const y = lead.enrichment?.foundedYear;
  return y ? THIS_YEAR - y : undefined;
}

export function estimateRevenue(lead: Lead): Estimate | undefined {
  const ind = matchIndustry(lead.industry);
  const hc = lead.enrichment?.headcount;
  if (hc && ind) {
    return {
      low: Math.round((hc.value * ind.rpe[0]) / 50_000) * 50_000,
      high: Math.round((hc.value * ind.rpe[1]) / 50_000) * 50_000,
      method: `${hc.value} staff (site says “${hc.quote.slice(0, 60)}”) × ${ind.label} benchmark of $${ind.rpe[0] / 1000}k–$${ind.rpe[1] / 1000}k revenue per employee`,
      confidence: "medium",
    };
  }
  const locs = lead.enrichment?.locationsCount;
  if (locs && locs > 1 && ind) {
    const staff = locs * 8;
    return {
      low: Math.round((staff * ind.rpe[0] * 0.6) / 100_000) * 100_000,
      high: Math.round((staff * ind.rpe[1] * 1.2) / 100_000) * 100_000,
      method: `${locs} locations × ~8 staff each (assumption) × ${ind.label} revenue-per-employee benchmark`,
      confidence: "low",
    };
  }
  return undefined;
}

export function formatMoney(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : `$${Math.round(n / 1000)}k`;
}

export function scoreLead(lead: Lead, box: BuyBox): ScoreResult {
  const lens = box.lens;
  const w = box.weights;
  const e = lead.enrichment?.ok ? lead.enrichment : undefined;
  const age = yearsInBusiness(lead);
  const signals: Signal[] = [];

  // 1 · Tenure / succession pressure
  const tenure = (() => {
    const evidence: string[] = [];
    const gaps: string[] = [];
    let score = 0;
    let known = false;
    if (age !== undefined) {
      known = true;
      score = lens === "acquisition" ? (age >= 30 ? 0.85 : age >= 20 ? 0.68 : age >= 10 ? 0.42 : 0.12) : age >= 10 ? 0.8 : age >= 3 ? 0.55 : 0.25;
      evidence.push(`In business ~${age} yrs (since ${e?.foundedYear})`);
      if (lens === "acquisition" && age >= 25) signals.push({ kind: "succession", label: `${age} years in business`, detail: "Founder-era owners of 25+ year businesses are the core of the retiring-owner wave." });
    } else gaps.push("Founding year not found — check state business filings");
    if (e?.familyOwned) {
      known = true;
      score = age === undefined ? 0.55 : score + 0.1;
      evidence.push("Describes itself as family / owner-operated");
      if (lens === "acquisition") signals.push({ kind: "succession", label: "Family / owner-operated", detail: `Site copy: “${e.familyOwned.slice(0, 90)}”` });
    }
    if (e?.generational.length) {
      known = true;
      score += 0.1;
      evidence.push(`Generational language: “${e.generational.join("”, “")}”`);
    }
    if (!known) return f(lens, "tenure", w, { score: UNKNOWN_PRIOR, known, evidence, gaps });
    return f(lens, "tenure", w, { score, known, evidence, gaps });
  })();

  // 2 · Upside (acquisition) / need (sales): gaps a buyer or vendor can fix
  const upside = (() => {
    const evidence: string[] = [];
    const gaps: string[] = [];
    if (!e) return f(lens, "upside", w, { score: UNKNOWN_PRIOR, known: false, evidence, gaps: ["Website not analysed yet"] });
    let score = 0.15;
    const add = (pts: number, label: string, detail: string, kind: Signal["kind"] = "digital-gap") => {
      score += pts;
      evidence.push(label);
      signals.push({ kind, label, detail });
    };
    if (!e.booking) add(0.2, "No online booking or scheduling", "Customers must call to book — an AI receptionist / booking flow is a fast revenue lever.");
    if (!e.analytics) add(0.15, "No analytics or marketing pixels", "Marketing is unmeasured; basic attribution usually reveals wasted spend.");
    if (!e.chat) add(0.08, "No website chat or messaging", "Missed after-hours leads; AI chat captures them.");
    const diy = e.tech.find((t) => DIY_BUILDERS.includes(t));
    if (diy) add(0.08, `DIY site builder (${diy})`, "Web presence built in-house — likely no dedicated marketing function.");
    if (e.copyrightYear && THIS_YEAR - e.copyrightYear >= 3) add(0.12, `Site footer last updated ${e.copyrightYear}`, "A stale website often mirrors under-invested operations.");
    if (!e.mobile) add(0.07, "Site not mobile-optimised", "Most local-service searches are mobile.");
    if (!e.https) add(0.05, "No HTTPS", "Browsers flag the site as insecure.");
    if (e.hiring) {
      score += lens === "sales" ? 0.2 : 0.05;
      evidence.push("Actively hiring");
      signals.push({ kind: "hiring", label: "Actively hiring", detail: `Growth or capacity strain: “${e.hiring.quote.slice(0, 80)}”` });
    }
    const modern = e.tech.filter((t) => ["HubSpot", "Salesforce / Pardot", "ServiceTitan", "Housecall Pro", "Jobber", "Podium"].includes(t));
    if (modern.length) gaps.push(`Already runs ${modern.join(", ")} — less greenfield upside`);
    return f(lens, "upside", w, { score: modern.length ? score - 0.15 : score, known: true, evidence, gaps });
  })();

  // 3 · Reachability
  const reach = (() => {
    const evidence: string[] = [];
    const gaps: string[] = [];
    const dm = decisionMaker(lead);
    const email = bestEmail(lead);
    const phone = e?.phones[0] ?? lead.phone;
    let score = 0;
    const hit = (pts: number, label: string) => {
      score += pts;
      evidence.push(label);
    };
    if (dm) {
      hit(0.35, `Decision-maker: ${dm.name} (${dm.role})`);
      signals.push({ kind: "reach", label: `${dm.name} (${dm.role}) is named`, detail: "Ask for them by name — skip the gatekeeper." });
    } else gaps.push("No owner named on site — check LinkedIn or the state registry");
    if (email?.kind === "named" && email.mx) hit(0.3, `Named mailbox, domain accepts mail: ${email.address}`);
    else if (email?.mx) hit(0.18, `Shared inbox (accepts mail): ${email.address}`);
    else if (lead.email) hit(0.1, `Email on public listing: ${lead.email}`);
    else gaps.push("No working email found");
    if (phone) hit(0.25, "Direct phone number");
    else gaps.push("No phone number");
    if (e?.socials.linkedin || lead.imported?.linkedin) hit(0.1, "LinkedIn presence");
    const known = !!(dm || email || phone || lead.email);
    return f(lens, "reach", w, { score: known ? score : UNKNOWN_PRIOR * 0.5, known, evidence, gaps });
  })();

  // 4 · Buy-box / ICP fit
  const fit = (() => {
    const evidence: string[] = [];
    const gaps: string[] = [];
    const parts: number[] = [];
    if (box.industries.length) {
      const hay = `${lead.industry ?? ""} ${lead.name} ${e?.title ?? ""} ${e?.description ?? ""}`.toLowerCase();
      const hit = box.industries.find((i) => {
        const ind = matchIndustry(i);
        return hay.includes(i.toLowerCase()) || (ind && ind.keywords.some((k) => hay.includes(k)));
      });
      parts.push(hit ? 1 : 0);
      if (hit) evidence.push(`Industry matches “${hit}”`);
      else gaps.push("Outside target industries");
    }
    if (box.regions.length) {
      const hay = `${lead.city ?? ""} ${lead.region ?? ""} ${lead.address ?? ""} ${e?.address ?? ""} ${e?.region ?? ""}`.toLowerCase();
      const hit = box.regions.find((r) => new RegExp(`\\b${r.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay));
      parts.push(hit ? 1 : 0);
      if (hit) evidence.push(`In target geography (${hit})`);
      else gaps.push("Outside target geography");
    }
    if (box.minYears) {
      if (age === undefined) {
        parts.push(0.4);
        gaps.push(`Years in business unknown (target ${box.minYears}+)`);
      } else {
        const ok = age >= box.minYears;
        parts.push(ok ? 1 : 0);
        (ok ? evidence : gaps).push(`${age} yrs vs ${box.minYears}+ target`);
      }
    }
    if (!parts.length) return f(lens, "fit", w, { score: 0.6, known: false, evidence: [], gaps: ["No buy box set — using a neutral score"] });
    return f(lens, "fit", w, { score: parts.reduce((a, b) => a + b, 0) / parts.length, known: true, evidence, gaps });
  })();

  // 5 · Proof the business is real and operating
  const proof = (() => {
    const evidence: string[] = [];
    const gaps: string[] = [];
    let score = 0;
    const hit = (pts: number, label: string) => {
      score += pts;
      evidence.push(label);
    };
    if (e) hit(0.35, "Website live and responding");
    else if (lead.enrichment && !lead.enrichment.ok) gaps.push(`Website: ${lead.enrichment.error ?? lead.enrichment.status}`);
    if (lead.address || e?.address) hit(0.2, "Physical address on record");
    if (lead.sources.includes("OpenStreetMap")) hit(0.15, "Listed on OpenStreetMap");
    if (lead.openingHours) hit(0.1, "Published opening hours");
    if (e && Object.keys(e.socials).length) hit(0.1, `Social: ${Object.keys(e.socials).join(", ")}`);
    if (e?.locationsCount && e.locationsCount > 1) {
      hit(0.1, `${e.locationsCount} locations`);
      signals.push({ kind: "growth", label: `${e.locationsCount} locations`, detail: "Multi-site operation — platform or add-on potential." });
    }
    const known = score > 0;
    return f(lens, "proof", w, { score: known ? score : UNKNOWN_PRIOR, known, evidence, gaps });
  })();

  if (lead.enrichment && !lead.enrichment.ok && ["captcha", "blocked", "robots"].includes(lead.enrichment.status)) {
    signals.push({ kind: "risk", label: "Website not analysed", detail: lead.enrichment.error ?? "Protected site — review manually." });
  }

  // Chains and franchise locations have no local owner to buy from: cap buy-box fit hard.
  const chain = lead.brand ? `Map data lists brand “${lead.brand}”` : e?.franchise ? `Site copy: “${e.franchise.slice(0, 90)}”` : undefined;
  if (chain) {
    signals.push({ kind: "risk", label: "Franchise / chain location", detail: chain });
    if (lens === "acquisition") {
      fit.score = Math.min(fit.score, 0.1);
      fit.known = true;
      fit.gaps.unshift("Franchise or chain location — no independent owner to acquire from");
    }
  }

  const factors = [tenure, upside, reach, fit, proof];
  const weightSum = factors.reduce((s, x) => s + x.weight, 0) || 1;
  const total = Math.round((factors.reduce((s, x) => s + x.score * x.weight, 0) / weightSum) * 100);
  const coverage = factors.filter((x) => x.known).reduce((s, x) => s + x.weight, 0) / weightSum;

  const email = bestEmail(lead);
  const dm = decisionMaker(lead);
  const fields = [lead.website, lead.phone ?? e?.phones[0], email ?? lead.email, dm, e?.foundedYear, lead.address ?? e?.address, lead.industry, e && Object.keys(e.socials).length ? 1 : undefined];
  const completeness = fields.filter(Boolean).length / fields.length;

  const tier = tierFor(total);
  const next = nextAction(lead, tier, dm?.name, !!(e?.phones[0] ?? lead.phone), email);
  const reasons = [...factors]
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .flatMap((x) => x.evidence)
    .filter((r) => r !== "Website live and responding")
    .slice(0, 3);

  return { total, tier, factors, coverage, completeness, signals: dedupeSignals(signals), next, reasons, revenue: estimateRevenue(lead) };
}

function dedupeSignals(s: Signal[]): Signal[] {
  const seen = new Set<string>();
  const order: Signal["kind"][] = ["succession", "hiring", "growth", "reach", "digital-gap", "risk"];
  return s.filter((x) => !seen.has(x.label) && seen.add(x.label)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

function nextAction(lead: Lead, tier: Tier, name: string | undefined, hasPhone: boolean, email?: { address: string; kind: string }): NextAction {
  if (tier === "D") return { kind: "skip", label: "Deprioritise — revisit if the buy box changes" };
  if (hasPhone && name) return { kind: "call", label: `Call and ask for ${name.split(" ")[0]}` };
  if (email?.kind === "named") return { kind: "email", label: `Email ${email.address}` };
  if (hasPhone) return { kind: "call", label: "Call and ask for the owner" };
  if (email) return { kind: "email", label: `Email shared inbox, ask for owner` };
  if (!lead.enrichment) return { kind: "research", label: "Enrich to find contacts" };
  return { kind: "research", label: "Find owner on LinkedIn / state registry" };
}

export function rankLeads(leads: Lead[], box: BuyBox): { lead: Lead; score: ScoreResult }[] {
  return leads.map((lead) => ({ lead, score: scoreLead(lead, box) })).sort((a, b) => b.score.total - a.score.total);
}
