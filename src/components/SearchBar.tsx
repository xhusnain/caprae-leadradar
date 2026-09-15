"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Search, Check, Upload, ClipboardPaste, FileSpreadsheet } from "lucide-react";
import { INDUSTRIES, industryByKey } from "@/lib/industries";
import { cn } from "./ui";

const CITY_SUGGESTIONS = ["Austin, TX", "Dallas, TX", "Houston, TX", "Denver, CO", "Phoenix, AZ", "Columbus, OH", "Charlotte, NC", "Nashville, TN", "Tampa, FL", "Minneapolis, MN", "Portland, OR", "Pittsburgh, PA"];

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex min-w-0 flex-col justify-center rounded-lg px-4 py-2 transition-colors focus-within:bg-surface-2 hover:bg-surface-2", className)}>
      <span className="text-[11px] font-medium text-faint">{label}</span>
      {children}
    </div>
  );
}

export default function SearchBar({
  onDiscover,
  busy,
  onOpenImport,
  onSample,
  autoEnrich,
  setAutoEnrich,
}: {
  onDiscover: (industries: string[], location: string, limit: number) => void;
  busy: boolean;
  onOpenImport: (tab: "csv" | "paste") => void;
  onSample: () => void;
  autoEnrich: boolean;
  setAutoEnrich: (v: boolean) => void;
}) {
  const [industries, setIndustries] = useState<string[]>(["hvac"]);
  const [location, setLocation] = useState("Austin, TX");
  const [limit, setLimit] = useState(30);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !pickerRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggle = (key: string) => setIndustries((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= 3 ? [...cur.slice(1), key] : [...cur, key]));
  const groups = [...new Set(INDUSTRIES.map((i) => i.group))];
  const visible = INDUSTRIES.filter((i) => i.label.toLowerCase().includes(filter.toLowerCase()));
  const summary = industries.length ? industries.map((k) => industryByKey(k)?.label).join(", ") : "Choose up to 3";

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (industries.length && location.trim()) onDiscover(industries, location.trim(), limit);
        }}
        className="grid gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_24px_-12px_rgba(15,23,42,0.12)] md:grid-cols-[minmax(0,1.25fr)_1px_minmax(0,1fr)_1px_150px_auto] md:items-center"
      >
        <div ref={pickerRef} className="relative">
          <Field label="Industry">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left text-sm text-ink outline-none">
              <span className={cn("truncate", !industries.length && "text-faint")}>{summary}</span>
              <ChevronDown size={15} className={cn("shrink-0 text-faint transition-transform", open && "rotate-180")} />
            </button>
          </Field>
          {open && (
            <div className="animate-pop-in absolute left-0 top-full z-30 mt-2 w-[320px] overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]">
              <div className="border-b border-line p-2">
                <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search industries" className="h-8 w-full rounded-md bg-surface-2 px-2.5 text-[13px] outline-none placeholder:text-faint" />
              </div>
              <div className="max-h-72 overflow-y-auto p-1 scroll-thin">
                {groups.map((g) => {
                  const items = visible.filter((i) => i.group === g);
                  if (!items.length) return null;
                  return (
                    <div key={g} className="py-1">
                      <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-faint">{g}</div>
                      {items.map((i) => {
                        const on = industries.includes(i.key);
                        return (
                          <button type="button" key={i.key} onClick={() => toggle(i.key)} className={cn("flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2", on ? "text-brand-ink" : "text-ink")}>
                            {i.label}
                            {on && <Check size={14} className="text-brand" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-faint">
                {industries.length}/3 selected
                <button type="button" onClick={() => setOpen(false)} className="font-medium text-brand">Done</button>
              </div>
            </div>
          )}
        </div>
        <span className="hidden h-8 bg-line md:block" />
        <Field label="Location">
          <input list="city-suggestions" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint" />
          <datalist id="city-suggestions">
            {CITY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <span className="hidden h-8 bg-line md:block" />
        <Field label="Results">
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="-ml-1 w-full bg-transparent text-sm text-ink outline-none">
            {[15, 30, 60, 100].map((n) => <option key={n} value={n}>Up to {n}</option>)}
          </select>
        </Field>
        <button
          type="submit"
          disabled={busy || !industries.length || !location.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-medium text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-colors hover:bg-brand-ink disabled:opacity-50"
        >
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
          {busy ? "Searching…" : "Find leads"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-2 text-[13px] text-muted">
        <button onClick={() => onOpenImport("csv")} className="inline-flex items-center gap-1.5 hover:text-ink"><Upload size={14} className="text-faint" /> Import CSV</button>
        <button onClick={() => onOpenImport("paste")} className="inline-flex items-center gap-1.5 hover:text-ink"><ClipboardPaste size={14} className="text-faint" /> Paste domains</button>
        <button onClick={onSample} className="inline-flex items-center gap-1.5 hover:text-ink"><FileSpreadsheet size={14} className="text-faint" /> Load a sample SaaSquatch export</button>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2">
          <span className="text-faint">Auto-enrich & verify</span>
          <button
            type="button"
            role="switch"
            aria-checked={autoEnrich}
            onClick={() => setAutoEnrich(!autoEnrich)}
            className={cn("relative h-5 w-9 rounded-full transition-colors", autoEnrich ? "bg-brand" : "bg-line-strong")}
          >
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", autoEnrich ? "left-[18px]" : "left-0.5")} />
          </button>
        </label>
      </div>
    </div>
  );
}
