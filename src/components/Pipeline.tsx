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
    <div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3 overflow-x-auto p-3 scroll-thin">
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
            className={cn("flex min-h-[320px] flex-col rounded-lg border bg-surface-2 transition-colors", over === stage.key ? "border-brand" : "border-line")}
          >
            <div className="flex items-center justify-between px-3 py-2 text-[12px] font-semibold">
              {stage.label}
              <span className="tabular rounded-full bg-surface px-1.5 text-faint">{items.length}</span>
            </div>
            <div className="flex-1 space-y-2 px-2 pb-2">
              {items.map(({ lead, score }) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                  onClick={() => onOpen(lead.id)}
                  className="cursor-grab rounded-lg border border-line bg-surface p-2.5 shadow-card hover:border-line-strong active:cursor-grabbing"
                >
                  <div className="flex items-start gap-2">
                    <ScoreRing score={score.total} tier={score.tier} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{lead.name}</div>
                      <div className="truncate text-[11px] text-muted">{decisionMaker(lead)?.name ?? lead.city ?? lead.domain}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 truncate text-[11px] text-brand-ink">{score.next.label}</div>
                  <select
                    value={lead.stage}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onStage(lead.id, e.target.value as Stage)}
                    className="mt-1.5 h-6 w-full rounded border border-line bg-surface text-[11px] sm:hidden"
                    aria-label="Move stage"
                  >
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              ))}
              {!items.length && <div className="rounded-lg border border-dashed border-line-strong px-2 py-6 text-center text-[11px] text-faint">Drag leads here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
