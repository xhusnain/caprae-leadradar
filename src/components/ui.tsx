"use client";

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Tier } from "@/lib/types";
import { TIER_LABEL } from "@/lib/score";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-2.5 text-[13px]",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-sm",
        variant === "primary" && "bg-brand text-white shadow-[0_1px_2px_rgba(37,99,235,0.25)] hover:bg-brand-ink",
        variant === "secondary" && "border border-line-strong bg-surface text-ink shadow-card hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-3 hover:text-ink",
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

export function Badge({ tone = "neutral", className, children, title }: { tone?: "neutral" | "brand" | "warn" | "danger"; className?: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tone === "neutral" && "bg-surface-3 text-muted",
        tone === "brand" && "bg-brand-soft text-brand-ink",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}

const TIER_CLS: Record<Tier, string> = {
  A: "bg-tier-a-soft text-tier-a ring-1 ring-inset ring-brand-line",
  B: "bg-tier-b-soft text-tier-b",
  C: "bg-tier-c-soft text-tier-c ring-1 ring-inset ring-line",
  D: "bg-tier-d-soft text-tier-d ring-1 ring-inset ring-line",
};
const TIER_STROKE: Record<Tier, string> = { A: "var(--tier-a-ring)", B: "var(--tier-b-ring)", C: "var(--tier-c-ring)", D: "var(--tier-d-ring)" };

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", TIER_CLS[tier])}>{TIER_LABEL[tier]}</span>;
}

export function ScoreRing({ score, tier, size = 38, pending }: { score: number; tier: Tier; size?: number; pending?: boolean }) {
  const stroke = size >= 56 ? 4 : 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Score ${score} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pending ? "var(--border-strong)" : TIER_STROKE[tier]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <span className={cn("absolute inset-0 grid place-items-center font-semibold tabular text-ink", size >= 56 ? "text-lg" : "text-[12px]", pending && "text-faint")}>{score}</span>
    </div>
  );
}

export function Meter({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn("h-full rounded-full transition-[width] duration-300", muted ? "bg-line-strong" : "bg-brand")} style={{ width: `${Math.round(value * 100)}%` }} />
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
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors",
        active ? "border-brand-line bg-brand-soft text-brand-ink" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
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
      <span className="text-[13px] font-medium text-ink">{children}</span>
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </div>
  );
}

const fieldCls =
  "rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink shadow-card placeholder:text-faint outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)]";
export const inputCls = `h-9 w-full ${fieldCls}`;
/** Inline select that sizes to its content (for toolbars). */
export const selectCls = `h-9 w-auto ${fieldCls}`;

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-lg bg-surface-3 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-all",
            size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
            o.value === value ? "bg-surface text-ink shadow-[0_1px_2px_rgba(15,23,42,0.08)]" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underline tabs for in-panel navigation. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-5 border-b border-line" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "-mb-px border-b-2 pb-2.5 pt-1 text-[13px] font-medium transition-colors",
            o.value === value ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Favicon({ domain, name, size = 32 }: { domain?: string; name: string; size?: number }) {
  const letter = name.replace(/[^a-z0-9]/gi, "")[0]?.toUpperCase() ?? "?";
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2 text-[12px] font-semibold text-muted" style={{ width: size, height: size }}>
      {letter}
      {domain && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          width={size - 12}
          height={size - 12}
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

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/** Right-side slide-over panel. */
export function Sheet({ open, onClose, title, subtitle, children, footer, width = 440 }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-[1px]" onClick={onClose} />
      <aside role="dialog" aria-label={title} className="animate-slide-in fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]" style={{ maxWidth: width }}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close panel" className="rounded-md p-1 text-faint hover:bg-surface-3 hover:text-ink">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto scroll-thin">{children}</div>
        {footer && <footer className="border-t border-line px-6 py-4">{footer}</footer>}
      </aside>
    </>
  );
}

/** Centered dialog. */
export function Modal({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/20 p-4 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className="animate-pop-in w-full max-w-[560px] rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]">
        <header className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-faint hover:bg-surface-3 hover:text-ink">
            <X size={18} />
          </button>
        </header>
        <div className="px-6 pb-6 pt-2">{children}</div>
      </div>
    </div>
  );
}
