"use client";

import { Phone, Mail, MailCheck, CircleAlert, ArrowRight } from "lucide-react";
import type { Lens, Stage } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { bestEmail, decisionMaker, formatMoney } from "@/lib/score";
import type { Ranked } from "./App";
import { Favicon, ScoreRing, TierBadge, cn } from "./ui";

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
    <div className="overflow-x-auto border-t border-line scroll-thin">
      <table className="w-full min-w-[1000px] table-fixed border-collapse text-left text-[13px]">
        <colgroup>
          <col className="w-11" />
          <col className="w-[26%]" />
          <col className="w-[132px]" />
          <col className="w-[27%]" />
          <col className="w-[22%]" />
          <col className="w-[96px]" />
          <col className="w-[132px]" />
        </colgroup>
        <thead>
          <tr className="bg-surface-2 text-[12px] font-medium text-muted">
            <th className="px-4 py-2.5">
              <input type="checkbox" checked={allSelected} onChange={() => onToggleAll(ids)} aria-label="Select all" className="accent-[var(--brand)]" />
            </th>
            <th className="px-2 py-2.5 font-medium">Company</th>
            <th className="px-2 py-2.5 font-medium">{lens === "acquisition" ? "Seller readiness" : "Fit score"}</th>
            <th className="px-2 py-2.5 font-medium">Why it ranks</th>
            <th className="px-2 py-2.5 font-medium">Contact & next step</th>
            <th className="px-2 py-2.5 font-medium">Founded</th>
            <th className="px-4 py-2.5 font-medium">Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lead, score }, i) => {
            const pending = enriching.has(lead.id) && !lead.enrichment;
            const dm = decisionMaker(lead);
            const email = bestEmail(lead);
            const phone = lead.enrichment?.phones[0] ?? lead.phone;
            const chain = score.signals.some((s) => s.label === "Franchise / chain location");
            const e = lead.enrichment;
            const place = [lead.city ?? e?.city, lead.region ?? e?.region].filter(Boolean).join(", ");
            const meta = [lead.industry, lead.duplicatesMerged > 0 ? `${lead.duplicatesMerged + 1} records merged` : null].filter(Boolean).join(" · ");
            const open = openId === lead.id;
            return (
              <tr
                key={lead.id}
                onClick={() => onOpen(lead.id)}
                className={cn(
                  "animate-fade-up group cursor-pointer border-t border-line align-top transition-colors",
                  open ? "bg-brand-soft/50" : "hover:bg-surface-2",
                )}
                style={{ animationDelay: `${Math.min(i, 12) * 15}ms` }}
              >
                <td className={cn("px-4 py-3.5", open && "shadow-[inset_2px_0_0_var(--brand)]")} onClick={(ev) => ev.stopPropagation()}>
                  <input type="checkbox" checked={selection.has(lead.id)} onChange={() => onToggle(lead.id)} aria-label={`Select ${lead.name}`} className="accent-[var(--brand)]" />
                </td>
                <td className="px-2 py-3.5">
                  <div className="flex gap-3">
                    <Favicon domain={lead.domain} name={lead.name} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{lead.name}</div>
                      <div className="truncate text-[12px] text-muted">{[lead.domain, place].filter(Boolean).join(" · ") || "No website on record"}</div>
                      {(meta || chain) && (
                        <div className="mt-0.5 truncate text-[12px] text-faint">
                          {meta}
                          {chain && <span className="text-danger">{meta ? " · " : ""}Franchise / chain</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-3.5">
                  <div className="flex items-center gap-2.5" title={`${Math.round(score.coverage * 100)}% of this score is backed by evidence`}>
                    <ScoreRing score={score.total} tier={score.tier} pending={pending} />
                    <TierBadge tier={score.tier} />
                  </div>
                </td>
                <td className="px-2 py-3.5">
                  {pending ? (
                    <div className="space-y-2 pt-1">
                      <div className="skeleton h-2.5 w-48 rounded" />
                      <div className="skeleton h-2.5 w-36 rounded" />
                    </div>
                  ) : score.reasons.length ? (
                    <ul className="space-y-1 text-[12.5px] text-muted">
                      {score.reasons.slice(0, 2).map((r) => (
                        <li key={r} className="flex gap-2">
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                          <span className="line-clamp-1">{r}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-faint">
                      <CircleAlert size={13} /> {e && !e.ok ? e.error ?? "Website not analysed" : "Not enriched yet"}
                    </span>
                  )}
                </td>
                <td className="px-2 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("truncate", dm ? "font-medium text-ink" : "text-faint")} title={dm ? `${dm.name} · ${dm.role}` : undefined}>
                      {dm ? dm.name : "Owner not found"}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-line-strong">
                      {email?.mx ? <MailCheck size={13} className="text-brand" aria-label="Email domain verified" /> : <Mail size={13} className={lead.email ? "text-faint" : ""} aria-label="Email" />}
                      <Phone size={13} className={phone ? "text-faint" : ""} aria-label={phone ? "Phone found" : "No phone"} />
                    </span>
                  </div>
                  <div className={cn("mt-1 flex items-center gap-1 truncate text-[12px]", score.next.kind === "skip" ? "text-faint" : "font-medium text-brand")}>
                    <span className="truncate">{score.next.label}</span>
                    {score.next.kind !== "skip" && <ArrowRight size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />}
                  </div>
                </td>
                <td className="px-2 py-3.5 tabular">
                  <div className={e?.foundedYear ? "text-ink" : "text-faint"}>{e?.foundedYear ?? "—"}</div>
                  <div className="text-[12px] text-faint" title={score.revenue?.method ?? (lead.imported?.revenue ? "SaaSquatch estimate (no method given)" : undefined)}>
                    {score.revenue ? `${formatMoney(score.revenue.low)}–${formatMoney(score.revenue.high)}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3.5" onClick={(ev) => ev.stopPropagation()}>
                  <select
                    value={lead.stage}
                    onChange={(ev) => onStage(lead.id, ev.target.value as Stage)}
                    className="h-7 w-full rounded-md border border-line bg-surface px-2 text-[12px] text-muted outline-none hover:border-line-strong focus:border-brand"
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
