"use client";

import { Phone, Mail, MailCheck, Store, Layers, CircleAlert, PhoneCall, Send, SearchCheck, Ban } from "lucide-react";
import type { Lens, Stage } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { bestEmail, decisionMaker, formatMoney } from "@/lib/score";
import type { Ranked } from "./App";
import { Badge, Favicon, ScoreRing, TierBadge, cn } from "./ui";

const NEXT_ICON = { call: PhoneCall, email: Send, research: SearchCheck, skip: Ban };

export default function LeadsTable({
  rows,
  openId,
  onOpen,
  selection,
  onToggle,
  onToggleAll,
  onStage,
  enriching,
  lens,
}: {
  rows: Ranked[];
  openId: string | null;
  onOpen: (id: string) => void;
  selection: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onStage: (id: string, stage: Stage) => void;
  enriching: Set<string>;
  lens: Lens;
}) {
  const ids = rows.map((r) => r.lead.id);
  const allSelected = ids.length > 0 && ids.every((id) => selection.has(id));

  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[1000px] table-fixed border-collapse text-left text-[13px]">
        <colgroup>
          <col className="w-10" />
          <col className="w-[25%]" />
          <col className="w-[150px]" />
          <col className="w-[25%]" />
          <col className="w-[22%]" />
          <col className="w-[92px]" />
          <col className="w-[128px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-faint">
            <th className="w-10 px-3 py-2.5">
              <input type="checkbox" checked={allSelected} onChange={() => onToggleAll(ids)} aria-label="Select all" className="accent-[var(--brand)]" />
            </th>
            <th className="px-2 py-2.5">Company</th>
            <th className="px-2 py-2.5">{lens === "acquisition" ? "Seller readiness" : "Fit score"}</th>
            <th className="px-2 py-2.5">Why it ranks</th>
            <th className="px-2 py-2.5">Decision-maker · next step</th>
            <th className="px-2 py-2.5">Founded</th>
            <th className="px-3 py-2.5">Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lead, score }, i) => {
            const pending = enriching.has(lead.id) && !lead.enrichment;
            const dm = decisionMaker(lead);
            const email = bestEmail(lead);
            const phone = lead.enrichment?.phones[0] ?? lead.phone;
            const chain = score.signals.some((s) => s.label === "Franchise / chain location");
            const NextIcon = NEXT_ICON[score.next.kind];
            const e = lead.enrichment;
            return (
              <tr
                key={lead.id}
                onClick={() => onOpen(lead.id)}
                className={cn(
                  "animate-fade-up cursor-pointer border-b border-line align-top transition-colors last:border-0 hover:bg-surface-2",
                  openId === lead.id && "bg-brand-soft/60 hover:bg-brand-soft/60",
                )}
                style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
              >
                <td className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <input type="checkbox" checked={selection.has(lead.id)} onChange={() => onToggle(lead.id)} aria-label={`Select ${lead.name}`} className="accent-[var(--brand)]" />
                </td>
                <td className="px-2 py-3">
                  <div className="flex gap-2.5">
                    <Favicon domain={lead.domain} name={lead.name} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{lead.name}</div>
                      <div className="truncate text-[12px] text-muted">
                        {[lead.domain, [lead.city ?? e?.city, lead.region ?? e?.region].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No website"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {lead.industry && <Badge>{lead.industry}</Badge>}
                        {chain && <Badge tone="danger" title="Franchise or chain location"><Store size={10} /> Chain</Badge>}
                        {lead.duplicatesMerged > 0 && <Badge tone="info" title={`Merged from: ${lead.sources.join(", ")}`}><Layers size={10} /> {lead.duplicatesMerged + 1} records merged</Badge>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <ScoreRing score={score.total} tier={score.tier} pending={pending} />
                    <div className="space-y-1">
                      <TierBadge tier={score.tier} />
                      <div className="text-[11px] text-faint" title="Share of the score backed by real evidence">{Math.round(score.coverage * 100)}% evidence</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-3">
                  {pending ? (
                    <div className="space-y-1.5 pt-1">
                      <div className="skeleton h-3 w-52 rounded" />
                      <div className="skeleton h-3 w-40 rounded" />
                    </div>
                  ) : score.reasons.length ? (
                    <ul className="space-y-0.5 text-[12px] text-ink">
                      {score.reasons.slice(0, 2).map((r) => (
                        <li key={r} className="flex gap-1.5">
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                          <span className="line-clamp-1">{r}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[12px] text-faint">
                      <CircleAlert size={12} /> {e && !e.ok ? e.error ?? "Website not analysed" : "Not enriched yet"}
                    </span>
                  )}
                </td>
                <td className="min-w-0 px-2 py-3">
                  <div className={cn("truncate", dm ? "font-medium" : "text-faint")} title={dm ? `${dm.name} · ${dm.role}` : undefined}>
                    {dm ? dm.name : "Owner not found"}
                    {dm && <span className="ml-1.5 text-[11px] font-normal text-muted">{dm.role}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-faint">
                    {email?.mx ? <MailCheck size={13} className="text-brand" aria-label="Email domain accepts mail" /> : <Mail size={13} className={lead.email ? "text-muted" : ""} aria-label="Email" />}
                    <Phone size={13} className={phone ? "text-brand" : ""} aria-label={phone ? "Phone found" : "No phone"} />
                    {(e?.socials.linkedin || lead.imported?.linkedin) && <span className="rounded bg-tier-c-soft px-1 text-[10px] font-bold text-tier-c">in</span>}
                  </div>
                  <div className={cn("mt-1 flex items-center gap-1 text-[12px] font-medium", score.next.kind === "skip" ? "text-faint" : "text-brand-ink")}>
                    <NextIcon size={12} /> <span className="truncate">{score.next.label}</span>
                  </div>
                </td>
                <td className="px-2 py-3 tabular">
                  <div>{e?.foundedYear ?? <span className="text-faint">—</span>}</div>
                  <div className="text-[12px] text-muted" title={score.revenue?.method ?? (lead.imported?.revenue ? "SaaSquatch estimate (no method given)" : undefined)}>
                    {score.revenue ? `${formatMoney(score.revenue.low)}–${formatMoney(score.revenue.high)}` : lead.imported?.revenue ? `${lead.imported.revenue} (SaaSquatch)` : ""}
                  </div>
                </td>
                <td className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <select
                    value={lead.stage}
                    onChange={(ev) => onStage(lead.id, ev.target.value as Stage)}
                    className="h-7 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink outline-none focus:border-brand"
                    aria-label="Pipeline stage"
                  >
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
