import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "../src/lib/robots";

const txt = `
User-agent: *
Disallow: /private
Allow: /private/about
Disallow: /*.pdf$

User-agent: LeadRadarBot
Disallow: /no-bots
`;

describe("robots.txt", () => {
  it("uses the most specific user-agent group", () => {
    const rules = parseRobots(txt, "LeadRadarBot");
    expect(isAllowed(rules, "/no-bots")).toBe(false);
    expect(isAllowed(rules, "/private")).toBe(true); // specific group replaces "*"
  });

  it("applies longest-match between allow and disallow, with wildcards", () => {
    const rules = parseRobots(txt, "SomeOtherBot");
    expect(isAllowed(rules, "/private/team")).toBe(false);
    expect(isAllowed(rules, "/private/about")).toBe(true);
    expect(isAllowed(rules, "/files/brochure.pdf")).toBe(false);
    expect(isAllowed(rules, "/about")).toBe(true);
  });

  it("allows everything when robots.txt is empty", () => {
    expect(isAllowed(parseRobots("", "LeadRadarBot"), "/anything")).toBe(true);
  });
});
