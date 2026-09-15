"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Tier } from "@/lib/types";
import { TIER_LABEL } from "@/lib/score";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "dark";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-brand text-white hover:bg-brand-ink shadow-sm",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-ink",
        variant === "dark" && "bg-accent text-white hover:opacity-90",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-line bg-surface shadow-card", className)}>{children}</section>;
}

export function Badge({ tone = "neutral", className, children, title }: { tone?: "neutral" | "brand" | "warn" | "danger" | "info"; className?: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "brand" && "bg-brand-soft text-brand-ink",
        tone === "warn" && "bg-tier-b-soft text-tier-b",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "info" && "bg-tier-c-soft text-tier-c",
        className,
      )}
    >
      {children}
    </span>
  );
}

const TIER_CLS: Record<Tier, string> = {
  A: "bg-tier-a-soft text-tier-a",
  B: "bg-tier-b-soft text-tier-b",
  C: "bg-tier-c-soft text-tier-c",
  D: "bg-tier-d-soft text-tier-d",
};
const TIER_STROKE: Record<Tier, string> = { A: "var(--tier-a)", B: "var(--tier-b)", C: "var(--tier-c)", D: "var(--tier-d)" };

export function TierBadge({ tier, compact }: { tier: Tier; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold", TIER_CLS[tier])}>
      {tier}
      {!compact && <span className="ml-1 font-medium">{TIER_LABEL[tier]}</span>}
    </span>
  );
}

export function ScoreRing({ score, tier, size = 40, pending }: { score: number; tier: Tier; size?: number; pending?: boolean }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Score ${score} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pending ? "var(--faint)" : TIER_STROKE[tier]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <span className={cn("absolute inset-0 grid place-items-center font-semibold tabular", size >= 56 ? "text-lg" : "text-[13px]", pending && "text-faint")}>{score}</span>
    </div>
  );
}

export function Meter({ value, tone = "brand" }: { value: number; tone?: "brand" | "muted" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn("h-full rounded-full transition-[width] duration-300", tone === "brand" ? "bg-brand" : "bg-faint")} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
        active ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">{children}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </div>
  );
}

const fieldCls =
  "rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint outline-none transition focus:border-brand focus:ring-2 focus:ring-[var(--ring)]";
export const inputCls = `h-9 w-full ${fieldCls}`;
/** Inline select that sizes to its content (for toolbars). */
export const selectCls = `h-9 w-auto ${fieldCls}`;

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors",
            size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
            o.value === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Favicon({ domain, name, size = 28 }: { domain?: string; name: string; size?: number }) {
  const letter = name.replace(/[^a-z0-9]/gi, "")[0]?.toUpperCase() ?? "?";
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface-2 text-[12px] font-semibold text-muted" style={{ width: size, height: size }}>
      {letter}
      {domain && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          width={size - 10}
          height={size - 10}
          loading="lazy"
          className="absolute inset-0 m-auto hidden bg-surface-2"
          // The service returns a tiny generic globe when a site has no icon: keep the letter tile instead.
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth >= 32) e.currentTarget.classList.remove("hidden");
          }}
        />
      )}
    </span>
  );
}
