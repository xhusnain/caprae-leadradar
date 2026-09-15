import { describe, expect, it } from "vitest";
import { isPlatformDomain, nameKey, nameSimilarity, normalizeDomain, normalizePhone, toUrl } from "../src/lib/domain";

describe("normalizeDomain", () => {
  it.each([
    ["https://WWW.Acme-HVAC.com/about?x=1", "acme-hvac.com"],
    ["acme-hvac.com", "acme-hvac.com"],
    ["www.acme.co.uk/contact", "acme.co.uk"],
    ["shop.acme.com", "acme.com"],
    ["owner@acme.com", "acme.com"],
    ["N/A", undefined],
    ["", undefined],
    ["not a domain", undefined],
  ])("%s -> %s", (input, expected) => expect(normalizeDomain(input)).toBe(expected));

  it("flags platform pages that are not company websites", () => {
    expect(isPlatformDomain(normalizeDomain("https://facebook.com/acme"))).toBe(true);
    expect(isPlatformDomain("acme.com")).toBe(false);
  });

  it("builds URLs with protocol", () => expect(toUrl("acme.com")).toBe("https://acme.com/"));
});

describe("normalizePhone", () => {
  it.each([
    ["(512) 271-2172", "+15122712172"],
    ["+1-512-271-2172", "+15122712172"],
    ["512.271.2172 ext 4", "+15122712172"],
    ["123", undefined],
  ])("%s -> %s", (input, expected) => expect(normalizePhone(input)).toBe(expected));
});

describe("names", () => {
  it("strips legal suffixes and punctuation", () => expect(nameKey("Smith & Sons Plumbing, LLC")).toBe("smith and sons plumbing"));
  it("scores near-identical names high and different names low", () => {
    expect(nameSimilarity("Efficient AC Plumbing Inc.", "EFFICIENT AC PLUMBING")).toBe(1);
    expect(nameSimilarity("Baker Brothers Plumbing", "Baker Bros Plumbing")).toBeGreaterThan(0.8);
    expect(nameSimilarity("Baker Brothers Plumbing", "Abacus Plumbing")).toBeLessThan(0.6);
  });
});
