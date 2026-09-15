"use client";

import { useState } from "react";
import { RotateCcw, X, Plus } from "lucide-react";
import type { BuyBox, FactorKey } from "@/lib/types";
import { DEFAULT_WEIGHTS, FACTOR_META } from "@/lib/score";
import { INDUSTRIES } from "@/lib/industries";
import { cn, inputCls } from "./ui";

const REGION_SUGGESTIONS = ["TX", "FL", "OH", "NC", "AZ", "CO", "GA", "TN"];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-6 py-5 last:border-0">
      <div className="mb-3">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Tag({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border border-brand-line bg-brand-soft pl-2.5 pr-1 text-[12px] font-medium text-brand-ink">
      {children}
      <button onClick={onRemove} className="rounded p-0.5 hover:bg-white/60" aria-label={`Remove ${children}`}><X size={12} /></button>
    </span>
  );
}

function Suggest({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-[12px] text-muted hover:border-line-strong hover:text-ink">
      <Plus size={11} /> {children}
    </button>
  );
}

/** Buy-box and scoring controls, rendered inside a slide-over sheet. */
export default function BuyBoxPanel({ box, onChange }: { box: BuyBox; onChange: (b: BuyBox) => void }) {
  const [regionDraft, setRegionDraft] = useState("");
  const meta = FACTOR_META[box.lens];
  const set = (patch: Partial<BuyBox>) => onChange({ ...box, ...patch });
  const addRegion = (r: string) => {
    const v = r.trim();
    if (v && !box.regions.includes(v)) set({ regions: [...box.regions, v] });
    setRegionDraft("");
  };
  const weightSum = Object.values(box.weights).reduce((a, b) => a + b, 0) || 1;

  return (
    <div>
      <Section title="Target industries" hint="Leads outside these industries score lower on fit.">
        <div className="flex flex-wrap gap-1.5">
          {box.industries.map((i) => (
            <Tag key={i} onRemove={() => set({ industries: box.industries.filter((x) => x !== i) })}>{i}</Tag>
          ))}
          {INDUSTRIES.filter((i) => !box.industries.includes(i.label)).slice(0, 6).map((i) => (
            <Suggest key={i.key} onClick={() => set({ industries: [...box.industries, i.label] })}>{i.label}</Suggest>
          ))}
        </div>
      </Section>

      <Section title="Target geography" hint="State codes or city names.">
        <input
          value={regionDraft}
          onChange={(e) => setRegionDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addRegion(regionDraft);
            }
          }}
          onBlur={() => regionDraft && addRegion(regionDraft)}
          placeholder="Type and press Enter"
          className={inputCls}
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {box.regions.map((r) => <Tag key={r} onRemove={() => set({ regions: box.regions.filter((x) => x !== r) })}>{r}</Tag>)}
          {REGION_SUGGESTIONS.filter((r) => !box.regions.includes(r)).slice(0, 6).map((r) => <Suggest key={r} onClick={() => addRegion(r)}>{r}</Suggest>)}
        </div>
      </Section>

      <Section title="Minimum years in business" hint="Optional. Unknown founding years are scored cautiously.">
        <input type="number" min={0} max={100} value={box.minYears ?? ""} onChange={(e) => set({ minYears: e.target.value ? Number(e.target.value) : null })} placeholder={box.lens === "acquisition" ? "e.g. 15" : "e.g. 3"} className={cn(inputCls, "max-w-[140px]")} />
      </Section>

      <Section title="Scoring weights" hint="How much each factor counts toward the 0–100 score.">
        <div className="space-y-4">
          {(Object.keys(meta) as FactorKey[]).map((k) => (
            <div key={k}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-medium text-ink">{meta[k].label}</span>
                <span className="tabular text-[12px] text-muted">{Math.round((box.weights[k] / weightSum) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={box.weights[k]}
                onChange={(e) => set({ weights: { ...box.weights, [k]: Number(e.target.value) } })}
                className="mt-1 w-full accent-[var(--brand)]"
                aria-label={meta[k].label}
              />
              <p className="text-[12px] leading-snug text-faint">{meta[k].blurb}</p>
            </div>
          ))}
          <button className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink" onClick={() => set({ weights: { ...DEFAULT_WEIGHTS[box.lens] } })}>
            <RotateCcw size={13} /> Reset to defaults
          </button>
        </div>
      </Section>

      <Section title="About you" hint="Used to sign and personalise outreach drafts.">
        <input value={box.profile.name} onChange={(e) => set({ profile: { ...box.profile, name: e.target.value } })} placeholder="Your name" className={inputCls} />
        <textarea
          value={box.profile.pitch}
          onChange={(e) => set({ profile: { ...box.profile, pitch: e.target.value } })}
          rows={3}
          placeholder={box.lens === "acquisition" ? "an operator looking to acquire and grow one local business long-term" : "helping home-service companies book more jobs with AI"}
          className={cn(inputCls, "mt-2 h-auto py-2 text-[13px] leading-relaxed")}
        />
      </Section>
    </div>
  );
}
