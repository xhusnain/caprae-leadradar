/*
 * Builds public/sample-saasquatch-export.csv from live OpenStreetMap data, in the exact column layout of
 * SaaSquatch's Company Search table (Company, Industry, Address, BBB Rating, Company Phone, Website,
 * Estimated Revenue). Two duplicates are planted on purpose (URL variant + phone match) to demo dedupe.
 * Run: npx tsx scripts/make-sample.ts
 */
import { writeFileSync } from "node:fs";
import Papa from "papaparse";
import { discover } from "../src/lib/discover";
import { formatPhone } from "../src/lib/domain";
import type { Lead } from "../src/lib/types";

const PLAN: [string, string, number][] = [
  ["hvac", "Austin, TX", 6],
  ["plumbing", "Dallas, TX", 4],
  ["roofing", "Houston, TX", 3],
  ["electrical", "San Antonio, TX", 3],
];

const row = (l: Lead) => ({
  Company: l.name,
  Industry: l.industry ?? "",
  Address: [l.address, l.city && `${l.city} ${l.region ?? ""}`.trim()].filter(Boolean).join(", ") || "N/A",
  "BBB Rating": "N/A",
  "Company Phone": l.phone ? formatPhone(l.phone) : "N/A",
  Website: l.website ? l.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : "N/A",
  // No revenue data source is available, so this column is left empty rather than invented.
  "Estimated Revenue": "N/A",
});

async function main() {
  const rows: ReturnType<typeof row>[] = [];
  for (const [ind, loc, n] of PLAN) {
    const res = await discover([ind], loc, 30);
    const picked = res.leads.filter((l) => l.website && l.phone && !l.brand).slice(0, n);
    console.log(`${ind} / ${loc}: ${picked.length}`);
    rows.push(...picked.map(row));
  }
  if (rows.length >= 3) {
    const a = rows[0];
    rows.push({ ...a, Company: `${a.Company} LLC`, Website: `https://www.${a.Website}/`, "Estimated Revenue": "N/A" });
    const b = rows[2];
    rows.push({ ...b, Company: b.Company.toUpperCase(), Website: "N/A", Address: "N/A" });
  }
  writeFileSync("public/sample-saasquatch-export.csv", Papa.unparse(rows));
  console.log(`wrote ${rows.length} rows`);
}
main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
