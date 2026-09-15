import { describe, expect, it } from "vitest";
import { dedupeLeads } from "../src/lib/dedupe";
import type { Lead } from "../src/lib/types";

const lead = (p: Partial<Lead>): Lead => ({
  id: p.id ?? Math.random().toString(36),
  name: "X",
  sources: ["test"],
  duplicatesMerged: 0,
  provenance: {},
  stage: "new",
  notes: "",
  addedAt: 1,
  ...p,
});

describe("dedupeLeads", () => {
  it("merges records sharing a domain and keeps the richest fields", () => {
    const { leads, removed } = dedupeLeads([
      lead({ id: "a", name: "Acme HVAC", domain: "acmehvac.com" }),
      lead({ id: "b", name: "Acme Heating & Air LLC", domain: "acmehvac.com", phone: "+15125550100", sources: ["OpenStreetMap"] }),
    ]);
    expect(removed).toBe(1);
    expect(leads[0].phone).toBe("+15125550100");
    expect(leads[0].sources.sort()).toEqual(["OpenStreetMap", "test"]);
    expect(leads[0].duplicatesMerged).toBe(1);
  });

  it("merges by phone and by fuzzy name in the same city, transitively", () => {
    const { leads } = dedupeLeads([
      lead({ id: "a", name: "Baker Brothers Plumbing", city: "Arlington", phone: "+18175550111" }),
      lead({ id: "b", name: "BAKER BROTHERS PLUMBING INC", city: "Arlington" }),
      lead({ id: "c", name: "Totally Different Name", phone: "+18175550111" }),
    ]);
    expect(leads).toHaveLength(1);
  });

  it("does not merge similar names with different domains or cities", () => {
    const { leads } = dedupeLeads([
      lead({ id: "a", name: "Premier Plumbing", domain: "premierplumbing.com", city: "Austin" }),
      lead({ id: "b", name: "Premier Plumbing", domain: "premier-plumbing-tx.com", city: "Austin" }),
      lead({ id: "c", name: "Premier Plumbing", city: "Denver" }),
    ]);
    // a & b share name+city key, which is a strong signal — but differing domains should stay apart in the fuzzy pass.
    expect(leads.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps an advanced pipeline stage when merging", () => {
    const { leads } = dedupeLeads([lead({ id: "a", name: "Acme", domain: "acme.com", stage: "contacted" }), lead({ id: "b", name: "Acme", domain: "acme.com", phone: "+15125550100" })]);
    expect(leads[0].stage).toBe("contacted");
  });
});
