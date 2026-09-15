"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, X } from "lucide-react";
import type { Lead } from "@/lib/types";
import { detectColumns, linesToLeads, parseCsv, rowsToLeads, type ColumnMap } from "@/lib/csv";
import { Button, Modal, Segmented, cn, inputCls } from "./ui";

const FIELD_LABELS: Record<string, string> = { name: "Company", website: "Website", phone: "Phone", email: "Email", industry: "Industry", address: "Address", city: "City", region: "State", revenue: "Est. revenue", owner: "Contact name", title: "Title", linkedin: "LinkedIn" };

export default function ImportDialog({
  open,
  initialTab,
  onClose,
  onImport,
  onSample,
}: {
  open: boolean;
  initialTab: "csv" | "paste";
  onClose: () => void;
  onImport: (leads: Lead[], label: string) => void;
  onSample: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [csv, setCsv] = useState<{ file: string; headers: string[]; rows: Record<string, string>[]; map: ColumnMap } | null>(null);
  const [paste, setPaste] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasted = linesToLeads(paste);

  const readFile = async (file: File) => {
    const { headers, rows } = parseCsv(await file.text());
    setCsv({ file: file.name, headers, rows, map: detectColumns(headers) });
  };

  return (
    <Modal open={open} onClose={onClose} title="Add leads" subtitle="Bring a SaaSquatch export, any CSV, or a list of domains.">
      <Segmented value={tab} onChange={setTab} size="sm" options={[{ value: "csv", label: "CSV file" }, { value: "paste", label: "Paste domains" }]} />

      {tab === "csv" && (
        <div className="mt-4 space-y-4">
          {!csv ? (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void readFile(f);
                }}
                className={cn("flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors", drag ? "border-brand bg-brand-soft" : "border-line-strong hover:bg-surface-2")}
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-muted"><FileSpreadsheet size={18} /></span>
                <span className="text-sm font-medium text-ink">Drop a CSV here, or click to browse</span>
                <span className="text-[13px] text-muted">Columns from SaaSquatch, Apollo or HubSpot are mapped automatically.</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
              <p className="text-center text-[13px] text-muted">
                No file handy?{" "}
                <button className="font-medium text-brand hover:underline" onClick={() => { onSample(); onClose(); }}>
                  Use the sample SaaSquatch export
                </button>
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                <span className="truncate font-medium">{csv.file} <span className="font-normal text-muted">· {csv.rows.length} rows</span></span>
                <button className="text-faint hover:text-ink" onClick={() => setCsv(null)} aria-label="Remove file"><X size={15} /></button>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-medium">Check the column mapping</div>
                <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 scroll-thin sm:grid-cols-2">
                  {Object.entries(FIELD_LABELS).map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[12px] text-muted">{label}</span>
                      <select
                        className={cn(inputCls, "h-8 text-[12px]", !csv.map[field as keyof ColumnMap] && "text-faint")}
                        value={csv.map[field as keyof ColumnMap] ?? ""}
                        onChange={(e) => setCsv({ ...csv, map: { ...csv.map, [field]: e.target.value || undefined } })}
                      >
                        <option value="">Not mapped</option>
                        {csv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCsv(null)}>Back</Button>
                <Button
                  variant="primary"
                  disabled={!csv.map.name && !csv.map.website}
                  onClick={() => {
                    onImport(rowsToLeads(csv.rows, csv.map), `Imported ${csv.file}`);
                    setCsv(null);
                    onClose();
                  }}
                >
                  Import {csv.rows.length} rows
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "paste" && (
        <div className="mt-4 space-y-4">
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={7} placeholder={"acmeplumbing.com\nhttps://www.smithhvac.com\nowner@joesroofing.com"} className={cn(inputCls, "h-auto py-2.5 font-mono text-[12px] leading-relaxed")} />
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted">{pasted.length ? `${pasted.length} unique domain${pasted.length === 1 ? "" : "s"} detected` : "One per line, or comma-separated"}</span>
            <Button
              variant="primary"
              disabled={!pasted.length}
              onClick={() => {
                onImport(pasted, "Pasted domains");
                setPaste("");
                onClose();
              }}
            >
              Add domains
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
