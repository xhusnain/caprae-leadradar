"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, FileText, Copy } from "lucide-react";
import type { BuyBox } from "@/lib/types";
import { EXPORT_PRESETS, exportLeads, type ExportPreset } from "@/lib/csv";
import { buildBriefHtml } from "@/lib/report";
import { bestEmail } from "@/lib/score";
import type { Ranked } from "./App";
import { Button } from "./ui";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportMenu({ rows, box, scope, dupesRemoved, onDone }: { rows: Ranked[]; box: BuyBox; scope: string; stats: unknown; dupesRemoved: number; onDone: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const stamp = new Date().toISOString().slice(0, 10);

  const run = (preset: ExportPreset) => {
    download(`leadradar-${preset}-${stamp}.csv`, exportLeads(rows, preset), "text/csv;charset=utf-8");
    onDone(`Exported ${preset === "call-list" ? "A/B leads from " : ""}${scope}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} disabled={!rows.length} icon={<Download size={14} />} aria-expanded={open}>
        Export <ChevronDown size={13} />
      </Button>
      {open && (
        <div className="animate-fade-up absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="border-b border-line px-3 py-2 text-[11px] text-faint">Exporting {scope}</div>
          {EXPORT_PRESETS.map((p) => (
            <button key={p.key} onClick={() => run(p.key)} className="flex w-full flex-col px-3 py-2 text-left hover:bg-surface-2">
              <span className="text-[13px] font-medium">{p.label}</span>
              <span className="text-[11px] text-muted">{p.hint}</span>
            </button>
          ))}
          <div className="border-t border-line" />
          <button
            onClick={() => {
              download(`leadradar-brief-${stamp}.html`, buildBriefHtml(rows, box, { dupesRemoved }), "text/html;charset=utf-8");
              onDone("Pipeline brief downloaded — open it and print to PDF");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
          >
            <FileText size={15} className="text-brand" />
            <span className="flex flex-col">
              <span className="text-[13px] font-medium">Pipeline brief (HTML/PDF)</span>
              <span className="text-[11px] text-muted">Shareable one-pager of top targets</span>
            </span>
          </button>
          <button
            onClick={async () => {
              const emails = [...new Set(rows.map((r) => bestEmail(r.lead)).filter((e) => e?.mx).map((e) => e!.address))];
              await navigator.clipboard.writeText(emails.join(", ")).catch(() => {});
              onDone(`Copied ${emails.length} mail-verified email${emails.length === 1 ? "" : "s"}`);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
          >
            <Copy size={15} className="text-brand" />
            <span className="text-[13px] font-medium">Copy verified emails</span>
          </button>
        </div>
      )}
    </div>
  );
}
