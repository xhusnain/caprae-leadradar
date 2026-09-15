"use client";

import { useRef, useState } from "react";
import { Radar, Upload, ClipboardPaste, LoaderCircle, FileSpreadsheet, MapPin, X } from "lucide-react";
import type { Lead } from "@/lib/types";
import { INDUSTRIES, industryByKey } from "@/lib/industries";
import { detectColumns, linesToLeads, parseCsv, rowsToLeads, type ColumnMap } from "@/lib/csv";
import { Button, Card, Chip, Label, Segmented, cn, inputCls } from "./ui";

const CITY_SUGGESTIONS = ["Austin, TX", "Dallas, TX", "Houston, TX", "Phoenix, AZ", "Denver, CO", "Columbus, OH", "Charlotte, NC", "Nashville, TN", "Tampa, FL", "Minneapolis, MN", "Portland, OR", "Pittsburgh, PA"];
const FIELD_LABELS: Record<string, string> = { name: "Company", website: "Website", phone: "Phone", email: "Email", industry: "Industry", address: "Address", city: "City", region: "State", revenue: "Est. revenue", owner: "Contact name", title: "Title", linkedin: "LinkedIn" };

export default function SourcePanel({
  onDiscover,
  onImport,
  onSample,
  busy,
  autoEnrich,
  setAutoEnrich,
}: {
  onDiscover: (industries: string[], location: string, limit: number) => void;
  onImport: (leads: Lead[], label: string) => void;
  onSample: () => void;
  busy: boolean;
  autoEnrich: boolean;
  setAutoEnrich: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<"discover" | "import" | "paste">("discover");
  const [industries, setIndustries] = useState<string[]>(["hvac"]);
  const [location, setLocation] = useState("Austin, TX");
  const [limit, setLimit] = useState(30);
  const [csv, setCsv] = useState<{ file: string; headers: string[]; rows: Record<string, string>[]; map: ColumnMap } | null>(null);
  const [paste, setPaste] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleIndustry = (key: string) =>
    setIndustries((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= 3 ? [...cur.slice(1), key] : [...cur, key]));

  const readFile = async (file: File) => {
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    setCsv({ file: file.name, headers, rows, map: detectColumns(headers) });
  };

  const groups = [...new Set(INDUSTRIES.map((i) => i.group))];

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="text-sm font-semibold">1 · Build your list</div>
          <div className="text-[12px] text-muted">Live discovery or bring your SaaSquatch export</div>
        </div>
      </div>
      <div className="px-4 pt-3">
        <Segmented
          value={tab}
          onChange={setTab}
          size="sm"
          options={[
            { value: "discover", label: <><Radar size={13} /> Discover</> },
            { value: "import", label: <><Upload size={13} /> CSV</> },
            { value: "paste", label: <><ClipboardPaste size={13} /> Paste</> },
          ]}
        />
      </div>

      {tab === "discover" && (
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (industries.length && location.trim()) onDiscover(industries, location.trim(), limit);
          }}
        >
          <div>
            <Label hint={`${industries.length}/3`}>Industry</Label>
            <div className="flex flex-wrap gap-1.5">
              {industries.map((k) => (
                <Chip key={k} active onClick={() => toggleIndustry(k)}>
                  {industryByKey(k)?.label} <X size={11} />
                </Chip>
              ))}
            </div>
            <select
              className={cn(inputCls, "mt-2")}
              value=""
              onChange={(e) => e.target.value && toggleIndustry(e.target.value)}
              aria-label="Add industry"
            >
              <option value="">+ Add industry…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {INDUSTRIES.filter((i) => i.group === g).map((i) => (
                    <option key={i.key} value={i.key} disabled={industries.includes(i.key)}>
                      {i.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <Label>Location</Label>
            <div className="relative">
              <MapPin size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input list="city-suggestions" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" className={cn(inputCls, "pl-8")} />
              <datalist id="city-suggestions">
                {CITY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Max results</Label>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={inputCls}>
                {[15, 30, 60, 100].map((n) => <option key={n} value={n}>{n} businesses</option>)}
              </select>
            </div>
            <Button type="submit" variant="primary" disabled={busy || !industries.length || !location.trim()} icon={busy ? <LoaderCircle size={15} className="animate-spin" /> : <Radar size={15} />} className="h-9">
              {busy ? "Searching" : "Find"}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-faint">Real, currently-mapped businesses from OpenStreetMap — free, no credits, cached 24h. Businesses with a website are listed first.</p>
        </form>
      )}

      {tab === "import" && (
        <div className="space-y-3 p-4">
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
                className={cn("flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-7 text-center transition-colors", drag ? "border-brand bg-brand-soft" : "border-line-strong hover:bg-surface-2")}
              >
                <FileSpreadsheet size={22} className="text-brand" />
                <span className="text-sm font-medium">Drop a CSV or click to browse</span>
                <span className="text-[12px] text-muted">SaaSquatch, Apollo, HubSpot or any list — columns are auto-mapped</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
              <Button className="w-full" onClick={onSample}>Use sample SaaSquatch export</Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-[13px]">
                <span className="truncate font-medium">{csv.file}</span>
                <button className="text-muted hover:text-ink" onClick={() => setCsv(null)} aria-label="Remove file"><X size={14} /></button>
              </div>
              <div className="rounded-lg border border-line">
                <div className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Column mapping · {csv.rows.length} rows</div>
                <div className="max-h-56 divide-y divide-line overflow-y-auto scroll-thin">
                  {Object.entries(FIELD_LABELS).map(([field, label]) => (
                    <div key={field} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="w-24 shrink-0 text-[12px] text-muted">{label}</span>
                      <select
                        className={cn(inputCls, "h-7 text-[12px]", !csv.map[field as keyof ColumnMap] && "text-faint")}
                        value={csv.map[field as keyof ColumnMap] ?? ""}
                        onChange={(e) => setCsv({ ...csv, map: { ...csv.map, [field]: e.target.value || undefined } })}
                      >
                        <option value="">— not mapped —</option>
                        {csv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                variant="primary"
                className="w-full"
                disabled={!csv.map.name && !csv.map.website}
                onClick={() => {
                  onImport(rowsToLeads(csv.rows, csv.map), `Imported ${csv.file}`);
                  setCsv(null);
                }}
              >
                Import {csv.rows.length} rows
              </Button>
            </>
          )}
        </div>
      )}

      {tab === "paste" && (
        <div className="space-y-3 p-4">
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder={"acmeplumbing.com\nhttps://www.smithhvac.com\nowner@joesroofing.com"} className={cn(inputCls, "h-auto py-2 font-mono text-[12px]")} />
          <Button
            variant="primary"
            className="w-full"
            disabled={!paste.trim()}
            onClick={() => {
              const leads = linesToLeads(paste);
              onImport(leads, "Pasted domains");
              if (leads.length) setPaste("");
            }}
          >
            Add {linesToLeads(paste).length || ""} domains
          </Button>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 border-t border-line px-4 py-2.5 text-[12px] text-muted">
        <input type="checkbox" checked={autoEnrich} onChange={(e) => setAutoEnrich(e.target.checked)} className="accent-[var(--brand)]" />
        Auto-enrich & verify new leads
      </label>
    </Card>
  );
}
