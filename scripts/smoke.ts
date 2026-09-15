/* End-to-end smoke test against live sources: discover -> dedupe -> enrich -> score. Run: npm run smoke */
import { discover } from "../src/lib/discover";
import { enrichWebsite } from "../src/lib/crawler";
import { dedupeLeads } from "../src/lib/dedupe";
import { mapPool } from "../src/lib/concurrency";
import { defaultBuyBox, rankLeads } from "../src/lib/score";

const [industry = "hvac", location = "Austin, TX", n = "12"] = process.argv.slice(2);

async function main() {
  let t = Date.now();
  const res = await discover([industry], location, 40);
  console.log(`discover: ${res.leads.length} leads (${res.withWebsite} with website, raw ${res.raw}) in ${Date.now() - t}ms cached=${res.cached}`);
  const { leads, removed } = dedupeLeads(res.leads);
  console.log(`dedupe: removed ${removed}`);
  const targets = leads.filter((l) => l.website).slice(0, Number(n));
  t = Date.now();
  for await (const r of mapPool(targets, 6, async (l) => ({ l, e: await enrichWebsite(l.website) }))) {
    r.l.enrichment = r.e;
    const e = r.e;
    console.log(`  ${e.status.padEnd(11)} ${String(e.ms).padStart(5)}ms ${r.l.name.slice(0, 32).padEnd(32)} founded=${e.foundedYear ?? "-"} people=${e.people.map((p) => p.name).join("/") || "-"} emails=${e.emails.map((m) => `${m.address}[${m.kind},mx=${m.mx}]`).join(" ") || "-"} tech=${e.tech.slice(0, 4).join(",")}`);
  }
  console.log(`enrich: ${Date.now() - t}ms`);
  const box = defaultBuyBox("acquisition");
  for (const { lead, score } of rankLeads(targets, box).slice(0, 8)) {
    console.log(`${String(score.total).padStart(3)} ${score.tier} ${lead.name.slice(0, 30).padEnd(30)} cov=${Math.round(score.coverage * 100)}% next="${score.next.label}" | ${score.reasons.join(" | ")}`);
  }
}
main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
