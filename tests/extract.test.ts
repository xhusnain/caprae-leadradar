import { describe, expect, it } from "vitest";
import { extractPage, pickSubpages } from "../src/lib/extract";

const page = (body: string, head = "") => `<html><head><title>Acme</title>${head}</head><body>${body}</body></html>`;
const cfEncode = (email: string, key = 0x42) => key.toString(16).padStart(2, "0") + [...email].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");

describe("extractPage", () => {
  it("finds founding year with a source quote", () => {
    const f = extractPage(page("<p>Proudly serving Travis County families since 1976 with honest service.</p>"), "https://acme.com");
    expect(f.founded?.year).toBe(1976);
    expect(f.founded?.quote).toContain("since 1976");
  });

  it("derives founding year from 'years in business'", () => {
    const f = extractPage(page("<p>With over 40 years in business we know HVAC.</p>"), "https://acme.com");
    expect(f.founded?.year).toBe(new Date().getFullYear() - 40);
  });

  it("prefers JSON-LD structured data", () => {
    const ld = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"HVACBusiness","foundingDate":"1988-04-01","founder":{"@type":"Person","name":"Jane Rivera"},"telephone":"(512) 555-0100","address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Austin","addressRegion":"TX"}}</script>`;
    const f = extractPage(page("<p>Welcome</p>", ld), "https://acme.com");
    expect(f.founded?.year).toBe(1988);
    expect(f.people[0]).toMatchObject({ name: "Jane Rivera", role: "Founder" });
    expect(f.city).toBe("Austin");
    expect(f.phones).toContain("+15125550100");
  });

  it("decodes Cloudflare-obfuscated and mailto emails and tel links", () => {
    const html = page(`<a href="mailto:owner@acme.com">Email</a><span class="__cf_email__" data-cfemail="${cfEncode("jane@acme.com")}">[email protected]</span><a href="tel:+1-512-555-0199">Call</a>`);
    const f = extractPage(html, "https://acme.com");
    expect(f.emails.map((e) => e.address)).toEqual(expect.arrayContaining(["owner@acme.com", "jane@acme.com"]));
    expect(f.phones).toContain("+15125550199");
  });

  it("identifies owners by role, family ownership, generations, franchise and hiring", () => {
    const f = extractPage(
      page("<p>Mike Thompson, Owner, started the company. We are a family-owned and operated, third-generation business. Now hiring technicians! Each franchise is independently owned and operated.</p>"),
      "https://acme.com",
    );
    expect(f.people[0]).toMatchObject({ name: "Mike Thompson", role: "Owner" });
    expect(f.familyOwned).toBeTruthy();
    expect(f.generational[0]).toMatch(/third-generation/i);
    expect(f.hiring).toBeTruthy();
    expect(f.franchise).toBeTruthy();
  });

  it("fingerprints tech and detects stale copyright + mobile", () => {
    const f = extractPage(
      page('<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script><img src="https://static.wixstatic.com/x.png"><footer>© 2017 Acme Plumbing</footer>', '<meta name="viewport" content="width=device-width">'),
      "https://acme.com",
    );
    expect(f.tech).toEqual(expect.arrayContaining(["Google Tag Manager", "Wix"]));
    expect(f.copyrightYear).toBe(2017);
    expect(f.mobile).toBe(true);
  });

  it("detects bot challenges instead of parsing them", () => {
    const f = extractPage("<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>", "https://acme.com");
    expect(f.captcha).toBe(true);
  });
});

describe("pickSubpages", () => {
  it("picks about/team/contact pages on the same site, skipping files and home", () => {
    const picked = pickSubpages(
      [
        { href: "https://acme.com/", text: "Home" },
        { href: "https://acme.com/about-us", text: "About" },
        { href: "https://acme.com/contact", text: "Contact" },
        { href: "https://acme.com/brochure.pdf", text: "About PDF" },
        { href: "https://acme.com/services/ac-repair", text: "AC repair" },
        { href: "https://acme.com/careers", text: "Careers" },
      ],
      "https://acme.com/",
    );
    expect(picked).toContain("https://acme.com/about-us");
    expect(picked).not.toContain("https://acme.com/brochure.pdf");
    expect(picked.length).toBeLessThanOrEqual(3);
  });
});
