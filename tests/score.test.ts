import { describe, expect, it } from "vitest";
import { defaultBuyBox, scoreLead, tierFor } from "../src/lib/score";
import type { Enrichment, Lead } from "../src/lib/types";

const base: Lead = { id: "1", name: "Acme Plumbing", industry: "Plumbing", sources: ["CSV import"], duplicatesMerged: 0, provenance: {}, stage: "new", notes: "", addedAt: 1 };

const enrichment = (p: Partial<Enrichment>): Enrichment => ({
  ok: true, status: "ok", fetchedAt: 1, cached: false, ms: 1, pages: ["https://acme.com"], emails: [], phones: [], socials: {}, people: [],
  generational: [], tech: [], booking: false, ecommerce: false, chat: false, analytics: false, https: true, mobile: true, textSample: "", ...p,
});

describe("scoreLead", () => {
  it("keeps thin, unenriched leads out of the top tiers", () => {
    const s = scoreLead(base, defaultBuyBox("acquisition"));
    expect(["C", "D"]).toContain(s.tier);
    expect(s.coverage).toBeLessThan(0.5);
  });

  it("ranks an old, family-owned, reachable business as priority with evidence", () => {
    const lead: Lead = {
      ...base,
      phone: "+15125550100",
      address: "1 Main St",
      enrichment: enrichment({
        foundedYear: 1978,
        foundedQuote: "since 1978",
        familyOwned: "family-owned and operated",
        people: [{ name: "Mike Thompson", role: "Owner" }],
        emails: [{ address: "mike@acme.com", kind: "named", mx: true, disposable: false, onOwnDomain: true }],
        phones: ["+15125550100"],
        copyrightYear: 2018,
        headcount: { value: 12, quote: "team of 12 technicians" },
      }),
    };
    const box = { ...defaultBuyBox("acquisition"), industries: ["Plumbing"], minYears: 20 };
    const s = scoreLead(lead, box);
    expect(s.tier).toBe("A");
    expect(s.next).toMatchObject({ kind: "call", label: "Call and ask for Mike" });
    expect(s.signals.map((x) => x.kind)).toContain("succession");
    expect(s.revenue?.low).toBeGreaterThan(1_000_000);
    expect(s.factors.find((f) => f.key === "tenure")?.evidence[0]).toContain("since 1978");
  });

  it("penalises franchise / chain locations under the acquisition lens only", () => {
    const lead: Lead = { ...base, brand: "One Hour Heating & Air", enrichment: enrichment({ foundedYear: 1990, phones: ["+15125550100"] }) };
    const acq = scoreLead(lead, defaultBuyBox("acquisition"));
    const sales = scoreLead(lead, defaultBuyBox("sales"));
    expect(acq.factors.find((f) => f.key === "fit")!.score).toBeLessThanOrEqual(0.1);
    expect(sales.factors.find((f) => f.key === "fit")!.score).toBeGreaterThan(0.1);
    expect(acq.signals.some((x) => x.kind === "risk")).toBe(true);
  });

  it("maps totals to tiers", () => {
    expect([tierFor(80), tierFor(60), tierFor(45), tierFor(10)]).toEqual(["A", "B", "C", "D"]);
  });
});
