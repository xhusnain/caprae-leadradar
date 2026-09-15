"use client";

import { useState } from "react";
import {
  X, ChevronUp, ChevronDown, ExternalLink, RefreshCw, LoaderCircle, PhoneCall, Send, SearchCheck, Ban, Check, Copy,
  Hourglass, TrendingUp, Wrench, UserRound, ShieldAlert, Globe, MapPin, Clock, Sparkles, Minus,
} from "lucide-react";
import type { BuyBox, Lead, OutreachDraft, Signal, Tone } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { bestEmail, formatMoney } from "@/lib/score";
import { formatPhone } from "@/lib/domain";
import type { Ranked } from "./App";
import { Badge, Button, Favicon, Meter, ScoreRing, Segmented, Tabs, TierBadge, cn, inputCls, selectCls } from "./ui";

type Tab = "why" | "contacts" | "outreach" | "notes";

const SIGNAL_ICON: Record<Signal["kind"], typeof Hourglass> = {
  succession: Hourglass,
  hiring: TrendingUp,
  growth: TrendingUp,
  "digital-gap": Wrench,
  reach: UserRound,
  risk: ShieldAlert,
};

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-[13px] font-semibold text-ink">{children}</h3>
      {aside && <span className="text-[12px] text-faint">{aside}</span>}
    </div>
  );
}

export default function LeadDrawer({
  item,
  box,
  onClose,
  onUpdate,
  onEnrich,
  enriching,
  onPrev,
  onNext,
  position,
  toast,
}: {
  item: Ranked;
  box: BuyBox;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Lead>) => void;
  onEnrich: (id: string) => void;
  enriching: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  position?: string;
  toast: (m: string) => void;
}) {
  const { lead, score } = item;
  const e = lead.enrichment;
  const [tab, setTab] = useState<Tab>("why");
  const [tone, setTone] = useState<Tone>("warm");
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const email = bestEmail(lead);
  const phone = e?.phones[0] ?? lead.phone;
  const place = [lead.city ?? e?.city, lead.region ?? e?.region].filter(Boolean).join(", ");
  const weightSum = score.factors.reduce((s, f) => s + f.weight, 0) || 1;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast("Clipboard blocked by the browser");
    }
  };

  const generate = async (regenerate = false) => {
    setLoading(true);
    setTab("outreach");
    try {
      const res = await fetch("/api/outreach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead, box, tone, regenerate }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setDraft(json.draft);
      setDraftNote(json.note ?? null);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const markContacted = (channel: string) => {
    const stamp = new Date().toLocaleDateString();
    onUpdate(lead.id, { stage: lead.stage === "new" || lead.stage === "researching" ? "contacted" : lead.stage, notes: `${lead.notes ? lead.notes + "\n" : ""}${stamp} · ${channel}` });
    toast(`Logged: ${channel}`);
  };

  const NextIcon = { call: PhoneCall, email: Send, research: SearchCheck, skip: Ban }[score.next.kind];
  const nextHref =
    score.next.kind === "call" && phone ? `tel:${phone}` :
    score.next.kind === "email" && (email?.address ?? lead.email) ? `mailto:${email?.address ?? lead.email}${draft ? `?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.email)}` : ""}` :
    `https://www.google.com/search?q=${encodeURIComponent(`"${lead.name}" owner ${place}`)}`;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/10 lg:hidden" onClick={onClose} />
      <aside className="animate-slide-in fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)] sm:w-[600px]" aria-label={`${lead.name} details`}>
        <div className="flex h-12 items-center gap-1 border-b border-line px-3 text-[12px] text-faint">
          <Button size="sm" variant="ghost" onClick={onPrev} disabled={!onPrev} aria-label="Previous lead"><ChevronUp size={16} /></Button>
          <Button size="sm" variant="ghost" onClick={onNext} disabled={!onNext} aria-label="Next lead"><ChevronDown size={16} /></Button>
          {position && <span className="ml-1 tabular">{position}</span>}
          <Button size="sm" variant="ghost" onClick={() => onEnrich(lead.id)} disabled={enriching} icon={enriching ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} className="ml-auto">
            {enriching ? "Analysing" : "Re-enrich"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X size={17} /></Button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin">
          <div className="px-7 pb-5 pt-6">
            <div className="flex items-start gap-4">
              <Favicon domain={lead.domain} name={lead.name} size={44} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] font-semibold leading-tight tracking-tight text-ink">{lead.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                  {lead.website && (
                    <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand">
                      <Globe size={13} className="text-faint" /> {lead.domain} <ExternalLink size={11} className="text-faint" />
                    </a>
                  )}
                  {place && <span className="inline-flex items-center gap-1"><MapPin size={13} className="text-faint" /> {place}</span>}
                  {lead.industry && <span>{lead.industry}</span>}
                </div>
                <div className="mt-2 text-[12px] text-faint">
                  Source: {lead.sources.join(" + ")}
                  {e?.cached && " · cached"}
                  {e && !e.ok && <span className="text-warn"> · website {e.status}</span>}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <ScoreRing score={score.total} tier={score.tier} size={58} />
                <TierBadge tier={score.tier} />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <a href={nextHref} target={score.next.kind === "research" ? "_blank" : undefined} rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-[0_1px_2px_rgba(37,99,235,0.25)] hover:bg-brand-ink">
                <NextIcon size={15} /> {score.next.label}
              </a>
              <Button onClick={() => generate(false)} disabled={loading} icon={loading ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} className="text-brand" />}>
                Draft outreach
              </Button>
              <select value={lead.stage} onChange={(ev) => onUpdate(lead.id, { stage: ev.target.value as Lead["stage"] })} className={cn(selectCls, "ml-auto text-[13px]")} aria-label="Stage">
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="sticky top-0 z-10 bg-surface px-7">
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "why", label: "Why it ranks" },
                { value: "contacts", label: "Contacts & data" },
                { value: "outreach", label: "Outreach" },
                { value: "notes", label: "Notes" },
              ]}
            />
          </div>

          <div className="space-y-8 px-7 py-6">
            {tab === "why" && (
              <>
                {score.signals.length > 0 && (
                  <section>
                    <SectionTitle>Why now</SectionTitle>
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {score.signals.map((s) => {
                        const Icon = SIGNAL_ICON[s.kind];
                        const risk = s.kind === "risk";
                        return (
                          <li key={s.label} className="flex gap-3 px-4 py-3">
                            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", risk ? "bg-danger-soft text-danger" : "bg-surface-3 text-muted")}>
                              <Icon size={14} />
                            </span>
                            <div className="min-w-0 text-[13px]">
                              <div className={cn("font-medium", risk ? "text-danger" : "text-ink")}>{s.label}</div>
                              <div className="mt-0.5 leading-relaxed text-muted">{s.detail}</div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                <section>
                  <SectionTitle aside={`${Math.round(score.coverage * 100)}% backed by evidence`}>Score breakdown</SectionTitle>
                  <div className="space-y-5">
                    {score.factors.map((f) => (
                      <div key={f.key}>
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="font-medium text-ink">{f.label}</span>
                          <span className="tabular text-[12px] text-muted">
                            {Math.round((f.score * f.weight * 100) / weightSum)} <span className="text-faint">of {Math.round((f.weight * 100) / weightSum)}</span>
                          </span>
                        </div>
                        <div className="mt-2"><Meter value={f.score} muted={!f.known} /></div>
                        <ul className="mt-2 space-y-1 text-[12.5px]">
                          {f.evidence.map((x) => <li key={x} className="flex gap-2 text-muted"><Check size={13} className="mt-0.5 shrink-0 text-brand" /> {x}</li>)}
                          {f.gaps.map((x) => <li key={x} className="flex gap-2 text-faint"><Minus size={13} className="mt-0.5 shrink-0" /> {x}</li>)}
                          {!f.known && <li className="pl-5 text-[12px] text-faint">No data yet, scored cautiously so thin leads can&apos;t rank high.</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle>Company facts</SectionTitle>
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-[13px]">
                    <Fact label="Founded" value={e?.foundedYear} quote={e?.foundedQuote} url={e?.foundedUrl} />
                    <Fact label="Team size" value={e?.headcount?.value ?? lead.imported?.employees} quote={e?.headcount?.quote} url={e?.headcount?.url} />
                    <Fact
                      label="Estimated revenue"
                      value={score.revenue ? `${formatMoney(score.revenue.low)}–${formatMoney(score.revenue.high)}` : undefined}
                      quote={score.revenue ? `${score.revenue.method} (${score.revenue.confidence} confidence)` : "Needs a staff-count or locations signal. We don't guess."}
                    />
                    <Fact label="Locations" value={e?.locationsCount} />
                  </dl>
                  {e?.ok && (
                    <div className="mt-4">
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
                        <Flag ok={e.booking} label="Online booking" />
                        <Flag ok={e.analytics} label="Analytics" />
                        <Flag ok={e.chat} label="Web chat" />
                        <Flag ok={e.mobile} label="Mobile-ready" />
                        <Flag ok={e.https} label="HTTPS" />
                        {e.copyrightYear && <span className="text-muted">Site updated {e.copyrightYear}</span>}
                      </div>
                      {e.tech.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {e.tech.map((t) => <Badge key={t}>{t}</Badge>)}
                        </div>
                      )}
                      <div className="mt-3 text-[12px] text-faint">
                        Read {e.pages.length} page{e.pages.length === 1 ? "" : "s"} in {(e.ms / 1000).toFixed(1)}s · {new Date(e.fetchedAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {tab === "contacts" && (
              <>
                <section>
                  <SectionTitle>Decision-makers</SectionTitle>
                  {e?.people.length || lead.imported?.owner ? (
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {(e?.people ?? []).map((p) => (
                        <li key={p.name} className="px-4 py-3">
                          <div className="text-[13px] font-medium text-ink">{p.name} <span className="font-normal text-muted">· {p.role}</span></div>
                          {p.quote && <div className="mt-0.5 text-[12px] text-faint">“{p.quote}”</div>}
                          <div className="mt-1.5 flex gap-4 text-[12px]">
                            <a className="font-medium text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${p.name} ${lead.name}`)}`}>Find on LinkedIn</a>
                            {p.url && <a className="text-muted hover:underline" target="_blank" rel="noreferrer" href={p.url}>Source page</a>}
                          </div>
                        </li>
                      ))}
                      {!e?.people.length && lead.imported?.owner && (
                        <li className="px-4 py-3 text-[13px]">{lead.imported.owner} <span className="text-muted">· {lead.imported.title ?? "Contact"} (from import)</span></li>
                      )}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-[13px] text-muted">
                      No owner is named on the website. Try:
                      <div className="mt-2 flex flex-wrap gap-4 text-[12px]">
                        <a className="font-medium text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`owner ${lead.name}`)}`}>LinkedIn search</a>
                        <a className="font-medium text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://opencorporates.com/companies?q=${encodeURIComponent(lead.name)}`}>Business registry</a>
                        <a className="font-medium text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(`"${lead.name}" owner OR founder OR president ${place}`)}`}>Web search</a>
                      </div>
                    </div>
                  )}
                </section>

                <section>
                  <SectionTitle aside="Syntax + MX checked · no mailbox probing">Emails</SectionTitle>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {(e?.emails ?? []).map((m) => (
                      <li key={m.address} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                        <span className="min-w-0 flex-1 truncate text-ink">{m.address}</span>
                        <span className="text-[12px] text-faint">{m.kind === "named" ? "Named" : m.kind === "role" ? "Shared inbox" : "Personal"}</span>
                        {m.mx === true && <Badge tone="brand" title="The domain has a working mail server"><Check size={10} /> Verified domain</Badge>}
                        {m.mx === false && <Badge tone="danger">No mail server</Badge>}
                        <button onClick={() => copy(m.address, "Email")} className="rounded p-1 text-faint hover:bg-surface-3 hover:text-ink" aria-label="Copy email"><Copy size={13} /></button>
                      </li>
                    ))}
                    {lead.email && !e?.emails.some((m) => m.address === lead.email) && (
                      <li className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                        <span className="flex-1 truncate">{lead.email}</span>
                        <span className="text-[12px] text-faint">{lead.provenance.email?.source ?? "Listing"}</span>
                      </li>
                    )}
                    {!e?.emails.length && !lead.email && <li className="px-4 py-3 text-[13px] text-muted">No email found{e ? "" : " yet. Enrich to search the website"}.</li>}
                  </ul>
                </section>

                <section className="grid grid-cols-2 gap-6 text-[13px]">
                  <div>
                    <SectionTitle>Phone</SectionTitle>
                    {[...new Set([...(e?.phones ?? []), ...(lead.phone ? [lead.phone] : [])])].map((p) => (
                      <a key={p} href={`tel:${p}`} className="block py-0.5 tabular text-ink hover:text-brand">{formatPhone(p)}</a>
                    ))}
                    {!phone && <span className="text-faint">Not found</span>}
                  </div>
                  <div>
                    <SectionTitle>Social</SectionTitle>
                    {e && Object.entries(e.socials).map(([k, v]) => (
                      <a key={k} href={v} target="_blank" rel="noreferrer" className="block py-0.5 capitalize text-ink hover:text-brand">{k === "x" ? "X / Twitter" : k}</a>
                    ))}
                    {(!e || !Object.keys(e.socials).length) && <span className="text-faint">Not found</span>}
                  </div>
                  <div className="col-span-2">
                    <SectionTitle>Address</SectionTitle>
                    <div className="text-ink">{[lead.address ?? e?.address, place, lead.postcode].filter(Boolean).join(", ") || "Not found"}</div>
                    {lead.openingHours && <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted"><Clock size={12} /> {lead.openingHours}</div>}
                  </div>
                </section>

                <section>
                  <SectionTitle>Data lineage</SectionTitle>
                  <table className="w-full text-[12.5px]">
                    <tbody className="divide-y divide-line">
                      {Object.entries(lead.provenance).map(([field, p]) => (
                        <tr key={field}>
                          <td className="w-28 py-2 capitalize text-muted">{field}</td>
                          <td className="py-2">{p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{p.source}</a> : p.source}</td>
                        </tr>
                      ))}
                      {lead.duplicatesMerged > 0 && (
                        <tr><td className="py-2 text-muted">Merged</td><td className="py-2">{lead.duplicatesMerged + 1} records unified by domain, phone or name match</td></tr>
                      )}
                      {e?.pages.map((p) => (
                        <tr key={p}><td className="py-2 text-muted">Page read</td><td className="truncate py-2"><a href={p} target="_blank" rel="noreferrer" className="text-brand hover:underline">{p.replace(/^https?:\/\//, "")}</a></td></tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}

            {tab === "outreach" && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented<Tone> value={tone} onChange={setTone} size="sm" options={[{ value: "warm", label: "Warm" }, { value: "direct", label: "Direct" }, { value: "formal", label: "Formal" }]} />
                  <Button size="sm" variant="primary" onClick={() => generate(!!draft)} disabled={loading} icon={loading ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}>
                    {draft ? "Regenerate" : "Generate"}
                  </Button>
                  {draft && <span className="ml-auto text-[12px] text-faint">{draft.engine === "claude" ? "Written by Claude" : "Built from signals"}</span>}
                </div>
                <p className="-mt-4 text-[13px] leading-relaxed text-muted">
                  No context to type. Drafts use this lead&apos;s {score.signals.length} verified signals and your profile.{!box.profile.name && " Add your name under Buy box → About you to sign them."}
                </p>
                {draftNote && <p className="-mt-4 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted">{draftNote}</p>}
                {loading && !draft && <div className="space-y-2">{[80, 95, 60].map((w) => <div key={w} className="skeleton h-3 rounded" style={{ width: `${w}%` }} />)}</div>}
                {draft && (
                  <div className="space-y-6">
                    <div className="rounded-xl bg-brand-soft px-4 py-3 text-[13px] text-ink"><span className="font-medium text-brand-ink">Why now: </span>{draft.whyNow}</div>
                    <Block title="Subject" text={draft.subject} onCopy={copy} />
                    <Block title="Email" text={draft.email} onCopy={copy} multiline>
                      {(email?.address ?? lead.email) && (
                        <a href={`mailto:${email?.address ?? lead.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.email)}`} onClick={() => markContacted("Email sent")} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
                          <Send size={12} /> Open in mail app
                        </a>
                      )}
                    </Block>
                    <Block title="Cold-call opener" text={draft.callOpener} onCopy={copy} multiline>
                      {phone && <a href={`tel:${phone}`} onClick={() => markContacted("Called")} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"><PhoneCall size={12} /> Call {formatPhone(phone)}</a>}
                    </Block>
                    <Block title={`LinkedIn note · ${draft.linkedin.length}/300`} text={draft.linkedin} onCopy={copy} multiline />
                    {draft.followUps.map((f) => <Block key={f.day} title={`Follow-up · day ${f.day}`} text={f.body} onCopy={copy} multiline />)}
                    <section>
                      <SectionTitle>First-call talking points</SectionTitle>
                      <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted marker:text-line-strong">{draft.talkingPoints.map((t) => <li key={t}>{t}</li>)}</ul>
                    </section>
                  </div>
                )}
              </>
            )}

            {tab === "notes" && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {["Left voicemail", "Spoke to gatekeeper", "Owner interested — send NDA", "Follow up in 6 months", "Not a fit"].map((n) => (
                    <button key={n} onClick={() => markContacted(n)} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:border-line-strong hover:text-ink">{n}</button>
                  ))}
                </div>
                <textarea value={lead.notes} onChange={(ev) => onUpdate(lead.id, { notes: ev.target.value })} rows={10} placeholder="Call notes, objections, the owner's goals…" className={cn(inputCls, "-mt-4 h-auto py-2.5 text-[13px] leading-relaxed")} />
                <p className="-mt-6 text-[12px] text-faint">Notes and stages save automatically.</p>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function Fact({ label, value, quote, url }: { label: string; value?: React.ReactNode; quote?: string; url?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-[16px] font-semibold tabular", value ? "text-ink" : "text-faint")}>{value ?? "Unknown"}</dd>
      {quote && (
        <dd className="mt-1 line-clamp-3 text-[12px] leading-snug text-faint">
          {quote}
          {url && <> · <a href={url} target="_blank" rel="noreferrer" className="text-brand hover:underline">source</a></>}
        </dd>
      )}
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", ok ? "text-muted" : "text-faint")}>
      {ok ? <Check size={13} className="text-brand" /> : <Minus size={13} />}
      {ok ? label : `No ${label.toLowerCase()}`}
    </span>
  );
}

function Block({ title, text, onCopy, multiline, children }: { title: string; text: string; onCopy: (t: string, w: string) => void; multiline?: boolean; children?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[12px] font-medium text-muted">{title}</h3>
        <div className="flex items-center gap-3">
          {children}
          <button onClick={() => onCopy(text, title.split(" ·")[0])} className="inline-flex items-center gap-1 text-[12px] text-faint hover:text-ink"><Copy size={12} /> Copy</button>
        </div>
      </div>
      <div className={cn("rounded-xl border border-line px-4 py-3 text-[13px] text-ink", multiline && "whitespace-pre-wrap leading-relaxed")}>{text}</div>
    </section>
  );
}
