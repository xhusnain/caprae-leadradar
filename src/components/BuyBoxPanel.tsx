"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw, X, Handshake, BriefcaseBusiness } from "lucide-react";
import type { BuyBox, FactorKey, Lens } from "@/lib/types";
import { DEFAULT_WEIGHTS, FACTOR_META } from "@/lib/score";
import { INDUSTRIES } from "@/lib/industries";
import { Card, Chip, Label, Segmented, cn, inputCls } from "./ui";

const REGION_SUGGESTIONS = ["TX", "FL", "OH", "NC", "AZ", "CO", "GA", "TN"];

export default function BuyBoxPanel({ box, onChange }: { box: BuyBox; onChange: (b: BuyBox) => void }) {
  const [regionDraft, setRegionDraft] = useState("");
  const [showWeights, setShowWeights] = useState(false);
  const meta = FACTOR_META[box.lens];
  const set = (patch: Partial<BuyBox>) => onChange({ ...box, ...patch });
  const addRegion = (r: string) => {
    const v = r.trim();
    if (v && !box.regions.includes(v)) set({ regions: [...box.regions, v] });
    setRegionDraft("");
  };

  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <div className="text-sm font-semibold">2 · Your buy box</div>
        <div className="text-[12px] text-muted">Scores re-rank instantly as you tune</div>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <Label>I&apos;m looking for</Label>
          <Segmented<Lens>
            value={box.lens}
            onChange={(lens) => set({ lens, weights: { ...DEFAULT_WEIGHTS[lens] } })}
            size="sm"
            options={[
              { value: "acquisition", label: <><Handshake size={13} /> Businesses to buy</> },
              { value: "sales", label: <><BriefcaseBusiness size={13} /> Customers</> },
            ]}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            {box.lens === "acquisition"
              ? "Acquisition lens: succession pressure, owner reachability and post-deal AI upside."
              : "Sales lens: buying signals, reachability and ICP fit."}
          </p>
        </div>

        <div>
          <Label>Target industries</Label>
          <div className="flex flex-wrap gap-1.5">
            {box.industries.map((i) => (
              <Chip key={i} active onClick={() => set({ industries: box.industries.filter((x) => x !== i) })}>
                {i} <X size={11} />
              </Chip>
            ))}
            {INDUSTRIES.filter((i) => !box.industries.includes(i.label))
              .slice(0, box.industries.length ? 4 : 6)
              .map((i) => (
                <Chip key={i.key} onClick={() => set({ industries: [...box.industries, i.label] })}>
                  + {i.label}
                </Chip>
              ))}
          </div>
        </div>

        <div>
          <Label>Target geography</Label>
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
            placeholder="State code or city, press Enter"
            className={inputCls}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {box.regions.map((r) => (
              <Chip key={r} active onClick={() => set({ regions: box.regions.filter((x) => x !== r) })}>
                {r} <X size={11} />
              </Chip>
            ))}
            {REGION_SUGGESTIONS.filter((r) => !box.regions.includes(r)).slice(0, 5).map((r) => (
              <Chip key={r} onClick={() => addRegion(r)}>+ {r}</Chip>
            ))}
          </div>
        </div>

        <div>
          <Label hint="optional">Minimum years in business</Label>
          <input
            type="number"
            min={0}
            max={100}
            value={box.minYears ?? ""}
            onChange={(e) => set({ minYears: e.target.value ? Number(e.target.value) : null })}
            placeholder={box.lens === "acquisition" ? "e.g. 15" : "e.g. 3"}
            className={inputCls}
          />
        </div>

        <div className="rounded-lg border border-line">
          <button className="flex w-full items-center justify-between px-3 py-2 text-[13px] font-medium" onClick={() => setShowWeights((v) => !v)} aria-expanded={showWeights}>
            Scoring weights
            <span className="flex items-center gap-1 text-[12px] font-normal text-muted">
              Tune <ChevronDown size={14} className={cn("transition-transform", showWeights && "rotate-180")} />
            </span>
          </button>
          {showWeights && (
            <div className="space-y-3 border-t border-line px-3 py-3">
              {(Object.keys(meta) as FactorKey[]).map((k) => (
                <div key={k}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium" title={meta[k].blurb}>{meta[k].label}</span>
                    <span className="tabular text-muted">{box.weights[k]}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={5}
                    value={box.weights[k]}
                    onChange={(e) => set({ weights: { ...box.weights, [k]: Number(e.target.value) } })}
                    className="w-full accent-[var(--brand)]"
                    aria-label={meta[k].label}
                  />
                  <p className="text-[11px] leading-snug text-faint">{meta[k].blurb}</p>
                </div>
              ))}
              <button className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink" onClick={() => set({ weights: { ...DEFAULT_WEIGHTS[box.lens] } })}>
                <RotateCcw size={12} /> Reset weights
              </button>
            </div>
          )}
        </div>

        <div>
          <Label hint="personalises outreach">About you</Label>
          <input value={box.profile.name} onChange={(e) => set({ profile: { ...box.profile, name: e.target.value } })} placeholder="Your name" className={inputCls} />
          <textarea
            value={box.profile.pitch}
            onChange={(e) => set({ profile: { ...box.profile, pitch: e.target.value } })}
            rows={2}
            placeholder={box.lens === "acquisition" ? "an operator looking to acquire and grow one local business long-term" : "helping home-service companies book more jobs with AI"}
            className={cn(inputCls, "mt-2 h-auto py-2 text-[13px]")}
          />
        </div>
      </div>
    </Card>
  );
}
