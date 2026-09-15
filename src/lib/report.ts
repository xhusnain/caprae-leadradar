import type { BuyBox, Lead, ScoreResult } from "./types";
import { bestEmail, decisionMaker, formatMoney, TIER_LABEL } from "./score";
import { formatPhone } from "./domain";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Self-contained, printable HTML brief for a partner / deal team. No external assets. */
export function buildBriefHtml(rows: { lead: Lead; score: ScoreResult }[], box: BuyBox, meta: { dupesRemoved: number }): string {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const top = rows.filter((r) => r.score.tier === "A" || r.score.tier === "B").slice(0, 15);
  const tiers = { A: 0, B: 0, C: 0, D: 0 };
  rows.forEach((r) => tiers[r.score.tier]++);
  const owners = rows.filter((r) => decisionMaker(r.lead)).length;
  const lensLabel = box.lens === "acquisition" ? "Acquisition sourcing brief" : "Sales prospecting brief";

  const cards = top
    .map(({ lead, score }, i) => {
      const dm = decisionMaker(lead);
      const email = bestEmail(lead);
      const e = lead.enrichment;
      return `<article class="card">
  <div class="head"><span class="rank">${i + 1}</span><div><h3>${esc(lead.name)}</h3><p class="muted">${esc([lead.domain, lead.city, lead.region, lead.industry].filter(Boolean).join(" · "))}</p></div>
  <div class="score t${score.tier}">${score.total}<small>${score.tier} · ${TIER_LABEL[score.tier]}</small></div></div>
  <div class="grid">
    <div><h4>Why now</h4><ul>${score.signals.slice(0, 4).map((s) => `<li><b>${esc(s.label)}</b> — ${esc(s.detail)}</li>`).join("") || "<li>Fits buy box</li>"}</ul></div>
    <div><h4>Contact</h4><p>${dm ? `<b>${esc(dm.name)}</b>, ${esc(dm.role)}<br>` : "Owner not identified<br>"}${email ? `${esc(email.address)} ${email.mx ? "(domain accepts mail)" : ""}<br>` : ""}${esc(formatPhone(e?.phones[0] ?? lead.phone))}</p>
    <h4>Facts</h4><p>${e?.foundedYear ? `Founded ${e.foundedYear}` : "Founding year unknown"}${score.revenue ? ` · est. ${formatMoney(score.revenue.low)}–${formatMoney(score.revenue.high)} revenue` : ""}${e?.tech.length ? `<br>Tech: ${esc(e.tech.slice(0, 5).join(", "))}` : ""}</p></div>
  </div>
  <p class="next">Next step: ${esc(score.next.label)}</p>
</article>`;
    })
    .join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(lensLabel)} — ${esc(date)}</title>
<style>
:root{--ink:#12211b;--muted:#5d6c65;--line:#e2e6df;--brand:#1f8a5b;--a:#059669;--b:#b7791f;--c:#0369a1;--d:#6b7280}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#f5f6f3}
main{max-width:920px;margin:0 auto;padding:40px 20px}header h1{margin:0;font-size:28px;letter-spacing:-.02em}.muted{color:var(--muted);margin:2px 0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:24px 0}.kpi{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px}.kpi b{display:block;font-size:22px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0;break-inside:avoid}
.head{display:flex;gap:12px;align-items:flex-start}.head h3{margin:0;font-size:16px}.rank{width:26px;height:26px;border-radius:50%;background:#e3f3ea;color:#0f5c3b;display:grid;place-items:center;font-weight:600;font-size:12px;flex:none}
.score{margin-left:auto;font-size:24px;font-weight:700;text-align:right;line-height:1}.score small{display:block;font-size:11px;font-weight:600;margin-top:4px}
.tA{color:var(--a)}.tB{color:var(--b)}.tC{color:var(--c)}.tD{color:var(--d)}
.grid{display:grid;grid-template-columns:1.4fr 1fr;gap:18px;margin-top:10px}h4{margin:8px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}ul{margin:0;padding-left:18px}p{margin:0}
.next{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);color:var(--brand);font-weight:600}
footer{margin-top:28px;font-size:12px;color:var(--muted)}
@media (max-width:640px){.kpis{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}}
@media print{body{background:#fff}main{padding:0}}
</style></head><body><main>
<header><p class="muted">LeadRadar for SaaSquatch · ${esc(date)}</p><h1>${esc(lensLabel)}</h1>
<p class="muted">Buy box: ${esc(box.industries.join(", ") || "any industry")} · ${esc(box.regions.join(", ") || "any geography")}${box.minYears ? ` · ${box.minYears}+ years` : ""}</p></header>
<section class="kpis"><div class="kpi"><b>${rows.length}</b>leads analysed</div><div class="kpi"><b class="tA">${tiers.A}</b>priority (A)</div><div class="kpi"><b>${tiers.B}</b>strong (B)</div><div class="kpi"><b>${owners}</b>owners named</div></section>
<h2>Top targets</h2>
${cards || '<p class="muted">No A/B leads yet — enrich more leads or widen the buy box.</p>'}
<footer>${meta.dupesRemoved} duplicate records merged. Scores are explainable: each factor is backed by quotes from company websites, OpenStreetMap listings and DNS checks. Unknown data is scored conservatively.</footer>
</main></body></html>`;
}
