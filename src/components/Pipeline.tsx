"use client";

import { useState } from "react";
import type { Stage } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { decisionMaker } from "@/lib/score";
import type { Ranked } from "./App";
import { ScoreRing, cn } from "./ui";

export default function Pipeline({ rows, onOpen, onStage }: { rows: Ranked[]; onOpen: (id: string) => void; onStage: (id: string, s: Stage) => void }) {
  const [over, setOver] = useState<Stage | null>(null);
  return (
    <div className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto border-t border-line bg-surface-2 p-4 scroll-thin">
      {STAGES.map((stage) => {
        const items = rows.filter((r) => r.lead.stage === stage.key);
        return (
          <div
            key={stage.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(stage.key);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) onStage(id, stage.key);
              setOver(null);
            }}
            className={cn("flex min-h-[340px] flex-col rounded-xl transition-colors", over === stage.key && "bg-brand-soft/70 ring-1 ring-brand-line")}
          >
            <div className="flex items-center justify-between px-1 pb-2.5 text-[13px] font-medium text-ink">
              {stage.label}
              <span className="tabular text-[12px] font-normal text-faint">{items.length}</span>
            </div>
            <div className="flex-1 space-y-2">
              {items.map(({ lead, score }) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                  onClick={() => onOpen(lead.id)}
                  className="cursor-grab rounded-xl border border-line bg-surface p-3 shadow-card transition-shadow hover:shadow-[var(--shadow-pop)] active:cursor-grabbing"
                >
                  <div className="flex items-start gap-2.5">
                    <ScoreRing score={score.total} tier={score.tier} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-ink">{lead.name}</div>
                      <div className="truncate text-[12px] text-muted">{decisionMaker(lead)?.name ?? lead.city ?? lead.domain}</div>
                    </div>
                  </div>
                  <div className="mt-2 truncate text-[12px] font-medium text-brand">{score.next.label}</div>
                  <select
                    value={lead.stage}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onStage(lead.id, e.target.value as Stage)}
                    className="mt-2 h-7 w-full rounded-md border border-line bg-surface text-[12px] sm:hidden"
                    aria-label="Move stage"
                  >
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              ))}
              {!items.length && <div className="rounded-xl border border-dashed border-line-strong px-3 py-8 text-center text-[12px] text-faint">Drop leads here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
