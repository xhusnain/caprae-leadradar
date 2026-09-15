"use client";

import { useState } from "react";
import {
  X, ChevronUp, ChevronDown, ExternalLink, RefreshCw, LoaderCircle, PhoneCall, Send, SearchCheck, Ban, Check, TriangleAlert, Copy,
  Hourglass, TrendingUp, Wrench, UserRound, ShieldAlert, Store, Globe, MapPin, Clock, Sparkles, Quote, Database,
} from "lucide-react";
import type { BuyBox, Lead, OutreachDraft, Signal, Tone } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { bestEmail, formatMoney } from "@/lib/score";
import { formatPhone } from "@/lib/domain";
import type { Ranked } from "./App";
import { Badge, Button, Favicon, Meter, ScoreRing, Segmented, TierBadge, cn, inputCls, selectCls } from "./ui";

type Tab = "why" | "contacts" | "outreach" | "notes";

const SIGNAL_ICON: Record<Signal["kind"], typeof Hourglass> = {
  succession: Hourglass,
  hiring: TrendingUp,
  growth: TrendingUp,
  "digital-gap": Wrench,
  reach: UserRound,
  risk: ShieldAlert,
};

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
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] lg:hidden" onClick={onClose} />
      <aside className="animate-slide-in fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-2xl sm:w-[580px]" aria-label={`${lead.name} details`}>
        <div className="flex items-center gap-1 border-b border-line px-3 py-2 text-[12px] text-muted">
          <Button size="sm" variant="ghost" onClick={onPrev} disabled={!onPrev} aria-label="Previous lead"><ChevronUp size={15} /></Button>
          <Button size="sm" variant="ghost" onClick={onNext} disabled={!onNext} aria-label="Next lead"><ChevronDown size={15} /></Button>
          {position && <span className="tabular">{position}</span>}
          <Button size="sm" variant="ghost" onClick={() => onEnrich(lead.id)} disabled={enriching} icon={enriching ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} className="ml-auto">
            {enriching ? "Analysing" : "Re-enrich"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X size={16} /></Button>
        </div>

        <div className="overflow-y-auto scroll-thin">
          <div className="px-5 pb-4 pt-4">
            <div className="flex items-start gap-3">
              <Favicon domain={lead.domain} name={lead.name} size={40} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-tight tracking-tight">{lead.name}</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
                  {lead.website && (
                    <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand">
                      <Globe size={12} /> {lead.domain} <ExternalLink size={10} />
                    </a>
                  )}
                  {place && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {place}</span>}
                  {lead.industry && <span>{lead.industry}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {lead.sources.map((s) => <Badge key={s}><Database size={10} /> {s}</Badge>)}
                  {e?.cached && <Badge tone="info" title="Served from the libSQL cache">Cached</Badge>}
                  {e && !e.ok && <Badge tone="warn"><TriangleAlert size={10} /> {e.status}</Badge>}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ScoreRing score={score.total} tier={score.tier} size={60} />
                <TierBadge tier={score.tier} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a href={nextHref} target={score.next.kind === "research" ? "_blank" : undefined} rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-medium text-white shadow-sm hover:bg-brand-ink">
                <NextIcon size={15} /> {score.next.label}
              </a>
              <Button onClick={() => generate(false)} disabled={loading} icon={loading ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}>
                Draft outreach
              </Button>
              <select value={lead.stage} onChange={(ev) => onUpdate(lead.id, { stage: ev.target.value as Lead["stage"] })} className={selectCls} aria-label="Stage">
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="sticky top-0 z-10 border-y border-line bg-surface px-5 py-2">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              size="sm"
              options={[
                { value: "why", label: "Why it ranks" },
                { value: "contacts", label: "Contacts & data" },
                { value: "outreach", label: "Outreach" },
                { value: "notes", label: "Notes" },
              ]}
            />
          </div>

          <div className="space-y-5 px-5 py-4">
            {tab === "why" && (
              <>
                {score.signals.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Why now</h3>
                    <ul className="space-y-1.5">
                      {score.signals.map((s) => {
                        const Icon = SIGNAL_ICON[s.kind];
                        return (
                          <li key={s.label} className={cn("flex gap-2.5 rounded-lg border px-3 py-2", s.kind === "risk" ? "border-danger/30 bg-danger-soft" : "border-line bg-surface-2")}>
                            <Icon size={15} className={cn("mt-0.5 shrink-0", s.kind === "risk" ? "text-danger" : "text-brand")} />
                            <div className="text-[13px]">
                              <div className="font-medium">{s.label}</div>
                              <div className="text-[12px] text-muted">{s.detail}</div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                <section>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">Score breakdown</h3>
                    <span className="text-[11px] text-faint">{Math.round(score.coverage * 100)}% backed by evidence</span>
                  </div>
                  <div className="divide-y divide-line rounded-lg border border-line">
                    {score.factors.map((f) => (
                      <div key={f.key} className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="font-medium">{f.label}</span>
                          <span className="tabular text-[12px] text-muted">
                            +{Math.round((f.score * f.weight * 100) / weightSum)} <span className="text-faint">/ {Math.round((f.weight * 100) / weightSum)}</span>
                          </span>
                        </div>
                        <div className="mt-1.5"><Meter value={f.score} tone={f.known ? "brand" : "muted"} /></div>
                        <ul className="mt-1.5 space-y-0.5 text-[12px]">
                          {f.evidence.map((x) => <li key={x} className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0 text-brand" /> {x}</li>)}
                          {f.gaps.map((x) => <li key={x} className="flex gap-1.5 text-muted"><TriangleAlert size={12} className="mt-0.5 shrink-0 text-tier-b" /> {x}</li>)}
                          {!f.known && <li className="text-[11px] text-faint">No data — scored conservatively so thin leads can&apos;t rank high.</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Company facts</h3>
                  <dl className="grid grid-cols-2 gap-2 text-[13px]">
                    <Fact label="Founded" value={e?.foundedYear} quote={e?.foundedQuote} url={e?.foundedUrl} />
                    <Fact label="Team size" value={e?.headcount?.value ?? lead.imported?.employees} quote={e?.headcount?.quote} url={e?.headcount?.url} />
                    <Fact
                      label="Est. revenue"
                      value={score.revenue ? `${formatMoney(score.revenue.low)}–${formatMoney(score.revenue.high)}` : undefined}
                      quote={score.revenue ? `${score.revenue.method} · ${score.revenue.confidence} confidence` : lead.imported?.revenue ? `SaaSquatch export says ${lead.imported.revenue}, no method given` : "Needs a headcount or locations signal — we don't guess"}
                    />
                    <Fact label="Locations" value={e?.locationsCount} />
                  </dl>
                  {e?.ok && (
                    <div className="mt-3 rounded-lg border border-line p-3">
                      <div className="mb-1.5 text-[12px] font-medium">Digital footprint</div>
                      <div className="flex flex-wrap gap-1">
                        <Flag ok={e.booking} label="Online booking" />
                        <Flag ok={e.analytics} label="Analytics" />
                        <Flag ok={e.chat} label="Web chat" />
                        <Flag ok={e.mobile} label="Mobile-ready" />
                        <Flag ok={e.https} label="HTTPS" />
                        {e.copyrightYear && <Badge tone={new Date().getFullYear() - e.copyrightYear >= 3 ? "warn" : "neutral"}>© {e.copyrightYear}</Badge>}
                      </div>
                      {e.tech.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {e.tech.map((t) => <Badge key={t} tone="info">{t}</Badge>)}
                        </div>
                      )}
                      <div className="mt-2 text-[11px] text-faint">
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
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Decision-makers</h3>
                  {e?.people.length || lead.imported?.owner ? (
                    <ul className="space-y-2">
                      {(e?.people ?? []).map((p) => (
                        <li key={p.name} className="rounded-lg border border-line px-3 py-2">
                          <div className="text-[13px] font-medium">{p.name} <span className="font-normal text-muted">· {p.role}</span></div>
                          {p.quote && <div className="mt-0.5 text-[12px] text-muted">“{p.quote}”</div>}
                          <div className="mt-1 flex gap-3 text-[12px]">
                            <a className="text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${p.name} ${lead.name}`)}`}>Find on LinkedIn</a>
                            {p.url && <a className="text-muted hover:underline" target="_blank" rel="noreferrer" href={p.url}>Source page</a>}
                          </div>
                        </li>
                      ))}
                      {!e?.people.length && lead.imported?.owner && (
                        <li className="rounded-lg border border-line px-3 py-2 text-[13px]">{lead.imported.owner} <span className="text-muted">· {lead.imported.title ?? "Contact"} (from import)</span></li>
                      )}
                    </ul>
                  ) : (
                    <div className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-[12px] text-muted">
                      No owner named on the website.
                      <div className="mt-1.5 flex flex-wrap gap-3">
                        <a className="text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`owner ${lead.name}`)}`}>LinkedIn search</a>
                        <a className="text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://opencorporates.com/companies?q=${encodeURIComponent(lead.name)}`}>Business registry (officers)</a>
                        <a className="text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(`"${lead.name}" owner OR founder OR president ${place}`)}`}>Web search</a>
                      </div>
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Emails</h3>
                  <ul className="space-y-1.5">
                    {(e?.emails ?? []).map((m) => (
                      <li key={m.address} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{m.address}</span>
                        <Badge tone={m.kind === "named" ? "brand" : "neutral"}>{m.kind === "named" ? "Named" : m.kind === "role" ? "Shared inbox" : "Personal"}</Badge>
                        {m.mx === true && <Badge tone="brand" title="Domain has a working mail server (MX)"><Check size={10} /> MX</Badge>}
                        {m.mx === false && <Badge tone="danger">No mail server</Badge>}
                        {!m.onOwnDomain && m.kind !== "freemail" && <Badge tone="warn" title="Email is on a different domain than the website">Other domain</Badge>}
                        <button onClick={() => copy(m.address, "Email")} className="text-faint hover:text-ink" aria-label="Copy email"><Copy size={13} /></button>
                      </li>
                    ))}
                    {lead.email && !e?.emails.some((m) => m.address === lead.email) && (
                      <li className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
                        <span className="flex-1 truncate font-mono text-[12px]">{lead.email}</span>
                        <Badge>{lead.provenance.email?.source ?? "Listing"}</Badge>
                      </li>
                    )}
                    {!e?.emails.length && !lead.email && <li className="text-[12px] text-muted">No email found{e ? "" : " — enrich to search the website"}.</li>}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-faint">We check syntax, disposable domains and MX records. We never probe mailboxes over SMTP.</p>
                </section>

                <section className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Phones</h3>
                    {[...new Set([...(e?.phones ?? []), ...(lead.phone ? [lead.phone] : [])])].map((p) => (
                      <a key={p} href={`tel:${p}`} className="block tabular text-brand hover:underline">{formatPhone(p)}</a>
                    ))}
                    {!phone && <span className="text-muted">—</span>}
                  </div>
                  <div>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Social</h3>
                    {e && Object.entries(e.socials).map(([k, v]) => (
                      <a key={k} href={v} target="_blank" rel="noreferrer" className="block capitalize text-brand hover:underline">{k === "x" ? "X / Twitter" : k}</a>
                    ))}
                    {(!e || !Object.keys(e.socials).length) && <span className="text-muted">—</span>}
                  </div>
                  <div className="col-span-2">
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Address</h3>
                    <div>{[lead.address ?? e?.address, place, lead.postcode].filter(Boolean).join(", ") || "—"}</div>
                    {lead.openingHours && <div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted"><Clock size={12} /> {lead.openingHours}</div>}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Data lineage</h3>
                  <table className="w-full text-[12px]">
                    <tbody className="divide-y divide-line">
                      {Object.entries(lead.provenance).map(([field, p]) => (
                        <tr key={field}>
                          <td className="py-1.5 capitalize text-muted">{field}</td>
                          <td className="py-1.5">{p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{p.source}</a> : p.source}</td>
                        </tr>
                      ))}
                      {lead.duplicatesMerged > 0 && (
                        <tr><td className="py-1.5 text-muted">Merged</td><td className="py-1.5">{lead.duplicatesMerged + 1} records unified (domain / phone / fuzzy name match)</td></tr>
                      )}
                      {e?.pages.map((p) => (
                        <tr key={p}><td className="py-1.5 text-muted">Page read</td><td className="truncate py-1.5"><a href={p} target="_blank" rel="noreferrer" className="text-brand hover:underline">{p.replace(/^https?:\/\//, "")}</a></td></tr>
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
                  {draft && <Badge tone={draft.engine === "claude" ? "brand" : "neutral"}>{draft.engine === "claude" ? "Written by Claude" : "Signal template"}</Badge>}
                </div>
                <p className="text-[12px] text-muted">
                  No manual context needed: the draft is built from this lead&apos;s verified signals ({score.signals.length}) and your profile. {!box.profile.name && "Add your name in “About you” to sign it."}
                </p>
                {draftNote && <p className="rounded-md bg-tier-b-soft px-2.5 py-1.5 text-[12px] text-tier-b">{draftNote}</p>}
                {loading && !draft && <div className="space-y-2">{[80, 95, 60].map((w) => <div key={w} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />)}</div>}
                {draft && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-[13px]"><span className="font-medium text-brand-ink">Why now: </span>{draft.whyNow}</div>
                    <Block title="Subject" text={draft.subject} onCopy={copy} />
                    <Block title="Email" text={draft.email} onCopy={copy} multiline>
                      {(email?.address ?? lead.email) && (
                        <a
                          href={`mailto:${email?.address ?? lead.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.email)}`}
                          onClick={() => markContacted("Email sent")}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
                        >
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
                      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">First-call talking points</h3>
                      <ul className="list-disc space-y-1 pl-5 text-[13px]">{draft.talkingPoints.map((t) => <li key={t}>{t}</li>)}</ul>
                    </section>
                  </div>
                )}
              </>
            )}

            {tab === "notes" && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {["Left voicemail", "Spoke to gatekeeper", "Owner interested — send NDA", "Not now — follow up in 6 months", "Not a fit"].map((n) => (
                    <button key={n} onClick={() => markContacted(n)} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:border-line-strong hover:text-ink">+ {n}</button>
                  ))}
                </div>
                <textarea
                  value={lead.notes}
                  onChange={(ev) => onUpdate(lead.id, { notes: ev.target.value })}
                  rows={10}
                  placeholder="Call notes, objections, owner's goals…"
                  className={cn(inputCls, "h-auto py-2 text-[13px] leading-relaxed")}
                />
                <p className="text-[11px] text-faint">Notes and stages save automatically to this workspace.</p>
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
    <div className="rounded-lg border border-line px-3 py-2">
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd className="text-[15px] font-semibold tabular">{value ?? <span className="text-faint">Unknown</span>}</dd>
      {quote && (
        <dd className="mt-0.5 flex gap-1 text-[11px] leading-snug text-muted">
          <Quote size={10} className="mt-0.5 shrink-0" />
          <span className="line-clamp-3">{quote}{url && <> · <a href={url} target="_blank" rel="noreferrer" className="text-brand hover:underline">source</a></>}</span>
        </dd>
      )}
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return <Badge tone={ok ? "brand" : "warn"}>{ok ? <Check size={10} /> : <Store size={10} className="hidden" />}{ok ? label : `No ${label.toLowerCase()}`}</Badge>;
}

function Block({ title, text, onCopy, multiline, children }: { title: string; text: string; onCopy: (t: string, w: string) => void; multiline?: boolean; children?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">{title}</h3>
        <div className="flex items-center gap-3">
          {children}
          <button onClick={() => onCopy(text, title.split(" ·")[0])} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink"><Copy size={12} /> Copy</button>
        </div>
      </div>
      <div className={cn("rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]", multiline && "whitespace-pre-wrap leading-relaxed")}>{text}</div>
    </section>
  );
}
