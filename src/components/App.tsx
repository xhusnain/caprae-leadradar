"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radar, Search, LayoutList, SquareKanban, X, Sparkles, ShieldCheck, Target, UserRound, Gauge, LoaderCircle, Trash2, RefreshCw, Share2, Check } from "lucide-react";
import type { BuyBox, Enrichment, Lead, ScoreResult, Stage, Tier } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { dedupeLeads } from "@/lib/dedupe";
import { bestEmail, decisionMaker, defaultBuyBox, rankLeads } from "@/lib/score";
import { postStream } from "@/lib/stream";
import { detectColumns, parseCsv, rowsToLeads } from "@/lib/csv";
import { industryByKey } from "@/lib/industries";
import { Button, Card, Chip, Segmented, cn, inputCls, selectCls } from "./ui";
import SourcePanel from "./SourcePanel";
import BuyBoxPanel from "./BuyBoxPanel";
import LeadsTable from "./LeadsTable";
import LeadDrawer from "./LeadDrawer";
import Pipeline from "./Pipeline";
import ExportMenu from "./ExportMenu";

export type Ranked = { lead: Lead; score: ScoreResult };

const LS_KEY = "leadradar:v1";
const WS_KEY = "leadradar:workspace";
const ENRICH_BATCH = 25;

type SortKey = "score" | "completeness" | "founded" | "name";

interface Workspace {
  leads: Lead[];
  box: BuyBox;
  dupesRemoved: number;
}

function applyEnrichment(lead: Lead, e: Enrichment): Lead {
  const next: Lead = { ...lead, enrichment: e, provenance: { ...lead.provenance } };
  if (!e.ok) return next;
  const src = { source: "Website" as const, url: e.finalUrl };
  if (!next.phone && e.phones[0]) {
    next.phone = e.phones[0];
    next.provenance.phone = src;
  }
  if (!next.address && e.address) {
    next.address = e.address;
    next.provenance.address = src;
  }
  if (!next.city && e.city) next.city = e.city;
  if (!next.region && e.region) next.region = e.region;
  return next;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [box, setBox] = useState<BuyBox>(() => defaultBuyBox("acquisition"));
  const [dupesRemoved, setDupesRemoved] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [reachableOnly, setReachableOnly] = useState(false);
  const [hideChains, setHideChains] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [activity, setActivity] = useState<{ message: string; progress?: number } | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [status, setStatus] = useState<{ ai: string; storage: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const leadsRef = useRef(leads);
  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  // Hydrate: shared link (?w=) > local workspace.
  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem(WS_KEY) ?? "";
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const ws = JSON.parse(raw) as Workspace;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage (external store) after mount avoids SSR mismatch
        setLeads(ws.leads ?? []);
        if (ws.box) setBox({ ...defaultBuyBox(ws.box.lens), ...ws.box });
        setDupesRemoved(ws.dupesRemoved ?? 0);
      }
    } catch {
      /* storage blocked */
    }
    const shared = new URLSearchParams(window.location.search).get("w");
    if (shared) {
      fetch(`/api/workspace/${shared}`)
        .then((r) => r.json())
        .then(({ workspace }: { workspace: Workspace | null }) => {
          if (workspace) {
            setLeads(workspace.leads);
            setBox(workspace.box);
            setDupesRemoved(workspace.dupesRemoved ?? 0);
            showToast("Loaded shared workspace");
          }
        })
        .catch(() => showToast("Could not load the shared workspace"));
      id = shared;
    }
    if (!id) id = newId();
    try {
      localStorage.setItem(WS_KEY, id);
    } catch {}
    setWorkspaceId(id);
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
    setHydrated(true);
  }, [showToast]);

  // Persist locally at once, and to the server (libSQL) debounced.
  useEffect(() => {
    if (!hydrated) return;
    const ws: Workspace = { leads, box, dupesRemoved };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(ws));
    } catch {}
    if (!workspaceId || !leads.length) return;
    const t = setTimeout(() => {
      setSaved("saving");
      fetch(`/api/workspace/${workspaceId}`, { method: "PUT", body: JSON.stringify(ws) })
        .then((r) => setSaved(r.ok ? "saved" : "idle"))
        .catch(() => setSaved("idle"));
    }, 1500);
    return () => clearTimeout(t);
  }, [leads, box, dupesRemoved, hydrated, workspaceId]);

  const addLeads = useCallback(
    (incoming: Lead[], label: string): Lead[] => {
      const before = leadsRef.current;
      const known = new Set(before.map((l) => l.id));
      const { leads: merged, removed } = dedupeLeads([...before, ...incoming]);
      const fresh = merged.filter((l) => !known.has(l.id));
      leadsRef.current = merged;
      setLeads(merged);
      setDupesRemoved((n) => n + removed);
      showToast(`${label}: ${fresh.length} new lead${fresh.length === 1 ? "" : "s"}${removed ? ` · ${removed} duplicate${removed === 1 ? "" : "s"} merged` : ""}`);
      return fresh;
    },
    [showToast],
  );

  const enrich = useCallback(
    async (ids: string[], force = false) => {
      const unique = [...new Set(ids)];
      if (!unique.length) return;
      setEnriching((s) => new Set([...s, ...unique]));
      let done = 0;
      setActivity({ message: `Analysing websites · 0/${unique.length}`, progress: 0 });
      try {
        for (let i = 0; i < unique.length; i += ENRICH_BATCH) {
          const chunk = new Set(unique.slice(i, i + ENRICH_BATCH));
          const items = leadsRef.current.filter((l) => chunk.has(l.id)).map((l) => ({ id: l.id, website: l.website }));
          if (!items.length) continue;
          await postStream("/api/enrich", { items, force }, (e) => {
            if (e.type === "enriched") {
              done++;
              setLeads((ls) => {
                const next = ls.map((l) => (l.id === e.id ? applyEnrichment(l, e.enrichment) : l));
                leadsRef.current = next;
                return next;
              });
              setEnriching((s) => {
                const n = new Set(s);
                n.delete(e.id);
                return n;
              });
              setActivity({ message: `Analysing websites · ${done}/${unique.length}`, progress: done / unique.length });
            } else if (e.type === "error") showToast(e.message);
          });
        }
        showToast(`Enriched ${done} lead${done === 1 ? "" : "s"} — scores updated`);
      } catch (err) {
        showToast(`Enrichment stopped: ${(err as Error).message}`);
      } finally {
        setEnriching((s) => new Set([...s].filter((id) => !unique.includes(id))));
        setActivity(null);
      }
    },
    [showToast],
  );

  const runDiscover = useCallback(
    async (industries: string[], location: string, limit: number) => {
      setDiscovering(true);
      setActivity({ message: `Searching OpenStreetMap for ${industries.map((k) => industryByKey(k)?.label).join(", ")} near ${location}…` });
      const found: Lead[] = [];
      try {
        await postStream("/api/discover", { industries, location, limit }, (e) => {
          if (e.type === "lead") found.push(e.lead);
          else if (e.type === "status") setActivity({ message: e.message, progress: e.progress });
          else if (e.type === "error") throw new Error(e.message);
        });
        if (!found.length) {
          showToast(`No mapped ${industries.join("/")} businesses found near ${location}. Try a nearby city or another industry.`);
          return;
        }
        const fresh = addLeads(found, `Discovered near ${location}`);
        setBox((b) => (b.industries.length ? b : { ...b, industries: industries.map((k) => industryByKey(k)?.label ?? k) }));
        if (autoEnrich) void enrich(fresh.map((l) => l.id));
      } catch (err) {
        showToast((err as Error).message);
      } finally {
        setDiscovering(false);
        setActivity((a) => (a?.progress !== undefined && a.progress < 1 ? a : null));
      }
    },
    [addLeads, autoEnrich, enrich, showToast],
  );

  const importLeads = useCallback(
    (incoming: Lead[], label: string) => {
      const fresh = addLeads(incoming, label);
      if (autoEnrich) void enrich(fresh.map((l) => l.id));
    },
    [addLeads, autoEnrich, enrich],
  );

  const loadSample = useCallback(async () => {
    const text = await fetch("/sample-saasquatch-export.csv").then((r) => r.text());
    const { headers, rows } = parseCsv(text);
    importLeads(rowsToLeads(rows, detectColumns(headers), "SaaSquatch export"), "SaaSquatch sample export");
  }, [importLeads]);

  const updateLead = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const ranked = useMemo(() => rankLeads(leads, box), [leads, box]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ranked.filter(({ lead, score }) => {
      if (tier !== "all" && score.tier !== tier) return false;
      if (hideChains && score.signals.some((s) => s.label === "Franchise / chain location")) return false;
      if (reachableOnly && !(decisionMaker(lead) || bestEmail(lead)?.kind === "named")) return false;
      if (!q) return true;
      return [lead.name, lead.domain, lead.city, lead.region, lead.industry, decisionMaker(lead)?.name].some((v) => v?.toLowerCase().includes(q));
    });
    const by: Record<SortKey, (a: Ranked, b: Ranked) => number> = {
      score: (a, b) => b.score.total - a.score.total,
      completeness: (a, b) => b.score.completeness - a.score.completeness,
      founded: (a, b) => (a.lead.enrichment?.foundedYear ?? 9999) - (b.lead.enrichment?.foundedYear ?? 9999),
      name: (a, b) => a.lead.name.localeCompare(b.lead.name),
    };
    return rows.sort(by[sort]);
  }, [ranked, query, tier, hideChains, reachableOnly, sort]);

  const stats = useMemo(() => {
    const enriched = ranked.filter((r) => r.lead.enrichment);
    const tiers = { A: 0, B: 0, C: 0, D: 0 } as Record<Tier, number>;
    ranked.forEach((r) => tiers[r.score.tier]++);
    const avg = (f: (r: Ranked) => number) => (ranked.length ? ranked.reduce((s, r) => s + f(r), 0) / ranked.length : 0);
    return {
      total: ranked.length,
      tiers,
      enriched: enriched.length,
      owners: ranked.filter((r) => decisionMaker(r.lead)).length,
      verified: ranked.filter((r) => bestEmail(r.lead)?.mx).length,
      completeness: avg((r) => r.score.completeness),
      coverage: avg((r) => r.score.coverage),
    };
  }, [ranked]);

  const openIndex = filtered.findIndex((r) => r.lead.id === openId);
  const openItem = openIndex >= 0 ? filtered[openIndex] : ranked.find((r) => r.lead.id === openId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "Escape") setOpenId(null);
      if ((e.key === "j" || e.key === "k") && filtered.length) {
        const i = openIndex < 0 ? 0 : Math.max(0, Math.min(filtered.length - 1, openIndex + (e.key === "j" ? 1 : -1)));
        setOpenId(filtered[i].lead.id);
      }
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("lead-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, openIndex]);

  const setStage = useCallback((id: string, stage: Stage) => updateLead(id, { stage }), [updateLead]);

  const toggle = (id: string) =>
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const removeSelected = () => {
    setLeads((ls) => ls.filter((l) => !selection.has(l.id)));
    showToast(`Removed ${selection.size} lead${selection.size === 1 ? "" : "s"}`);
    setSelection(new Set());
  };

  const share = async () => {
    const url = `${window.location.origin}/?w=${workspaceId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied — teammates see this workspace");
    } catch {
      showToast(url);
    }
  };

  const step = !leads.length ? 1 : stats.enriched < leads.length || enriching.size ? 2 : leads.some((l) => l.stage !== "new") ? 4 : 3;
  const selectedRows = selection.size ? ranked.filter((r) => selection.has(r.lead.id)) : filtered;
  const pendingNoEnrich = leads.filter((l) => !l.enrichment && !enriching.has(l.id));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-brand">
              <Radar size={18} strokeWidth={2.2} className="text-[#5fd3a0]" />
            </span>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">
                LeadRadar <span className="font-normal text-muted">for SaaSquatch</span>
              </div>
              <div className="hidden text-[11px] text-faint sm:block">Find, verify and prioritise the owners worth calling</div>
            </div>
          </div>

          <ol className="hidden items-center gap-1 text-[12px] lg:flex" aria-label="Workflow">
            {["Find", "Enrich & verify", "Prioritise", "Reach out"].map((label, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "current" : "todo";
              return (
                <li key={label} className="flex items-center gap-1">
                  {i > 0 && <span className="mx-1 h-px w-5 bg-line-strong" />}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
                      state === "current" && "bg-brand-soft text-brand-ink",
                      state === "done" && "text-brand",
                      state === "todo" && "text-faint",
                    )}
                  >
                    <span className={cn("grid h-4 w-4 place-items-center rounded-full text-[10px]", state === "done" ? "bg-brand text-white" : state === "current" ? "bg-brand text-white" : "border border-line-strong")}>
                      {state === "done" ? <Check size={10} strokeWidth={3} /> : n}
                    </span>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="ml-auto flex items-center gap-2">
            {status && (
              <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted md:inline-flex" title="Outreach engine · storage backend">
                <span className={cn("h-1.5 w-1.5 rounded-full", status.ai === "Claude" ? "bg-brand" : "bg-tier-b")} />
                {status.ai === "Claude" ? "Claude outreach" : "Template outreach"} · {status.storage}
                {saved === "saving" && <LoaderCircle size={11} className="animate-spin" />}
                {saved === "saved" && <Check size={11} className="text-brand" />}
              </span>
            )}
            {leads.length > 0 && (
              <Button size="sm" variant="ghost" onClick={share} icon={<Share2 size={14} />} className="hidden sm:inline-flex">
                Share
              </Button>
            )}
            <ExportMenu rows={selectedRows} box={box} scope={selection.size ? `${selection.size} selected` : `${filtered.length} in view`} stats={stats} dupesRemoved={dupesRemoved} onDone={showToast} />
          </div>
        </div>
        {activity && (
          <div className="border-t border-line bg-surface">
            <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-1.5 text-[12px] text-muted sm:px-6">
              <LoaderCircle size={13} className="animate-spin text-brand" />
              <span className="truncate">{activity.message}</span>
              {activity.progress !== undefined && (
                <div className="ml-auto h-1 w-40 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${Math.round(activity.progress * 100)}%` }} />
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className={cn(leads.length > 0 && "order-2 lg:order-none", "space-y-4 scroll-thin lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto lg:pb-4")}>
          <SourcePanel onDiscover={runDiscover} onImport={importLeads} onSample={loadSample} busy={discovering} autoEnrich={autoEnrich} setAutoEnrich={setAutoEnrich} />
          <BuyBoxPanel box={box} onChange={setBox} />
        </aside>

        <section className={cn(leads.length > 0 && "order-1 lg:order-none", "min-w-0 space-y-4")}>
          {!leads.length ? (
            <EmptyHero onSample={loadSample} onDiscover={() => runDiscover(["hvac"], "Austin, TX", 30)} busy={discovering} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Kpi icon={<Target size={15} />} label="Leads in play" value={stats.total} sub={`${dupesRemoved} duplicate${dupesRemoved === 1 ? "" : "s"} merged · ${stats.enriched} enriched`} />
                <Kpi icon={<Sparkles size={15} />} label="Priority (tier A)" value={stats.tiers.A} sub={`${stats.tiers.B} strong · call these first`} highlight onClick={() => setTier(tier === "A" ? "all" : "A")} active={tier === "A"} />
                <Kpi icon={<UserRound size={15} />} label="Decision-makers named" value={stats.owners} sub={`${stats.verified} with mail-verified email`} onClick={() => setReachableOnly((v) => !v)} active={reachableOnly} />
                <Kpi icon={<Gauge size={15} />} label="Data completeness" value={`${Math.round(stats.completeness * 100)}%`} sub={`${Math.round(stats.coverage * 100)}% of score backed by evidence`} />
              </div>

              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
                  <Segmented
                    value={view}
                    onChange={setView}
                    size="sm"
                    options={[
                      { value: "list", label: <><LayoutList size={14} /> Ranked</> },
                      { value: "pipeline", label: <><SquareKanban size={14} /> Pipeline</> },
                    ]}
                  />
                  <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                    <input id="lead-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, owner, city…  ( / )" className={cn(inputCls, "h-8 pl-8 text-[13px]")} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["all", "A", "B", "C", "D"] as const).map((t) => (
                      <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
                        {t === "all" ? "All" : t}
                        <span className="tabular text-faint">{t === "all" ? stats.total : stats.tiers[t]}</span>
                      </Chip>
                    ))}
                    <Chip active={reachableOnly} onClick={() => setReachableOnly((v) => !v)}>Reachable owner</Chip>
                    <Chip active={hideChains} onClick={() => setHideChains((v) => !v)}>Hide chains</Chip>
                  </div>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={cn(selectCls, "ml-auto h-8 text-[13px]")} aria-label="Sort">
                    <option value="score">Sort: Score</option>
                    <option value="founded">Sort: Oldest first</option>
                    <option value="completeness">Sort: Most complete</option>
                    <option value="name">Sort: Name</option>
                  </select>
                </div>

                {(selection.size > 0 || pendingNoEnrich.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-[13px]">
                    {selection.size > 0 ? (
                      <>
                        <span className="font-medium">{selection.size} selected</span>
                        <Button size="sm" variant="primary" icon={<RefreshCw size={13} />} onClick={() => enrich([...selection], true)}>
                          Re-enrich
                        </Button>
                        <select className={cn(selectCls, "h-8 text-[13px]")} defaultValue="" onChange={(e) => { const st = e.target.value as Stage; if (st) { selection.forEach((id) => setStage(id, st)); showToast(`Moved ${selection.size} to ${STAGES.find((s) => s.key === st)?.label}`); } e.target.value = ""; }}>
                          <option value="">Move to stage…</option>
                          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={removeSelected}>Remove</Button>
                        <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setSelection(new Set())}>Clear</Button>
                      </>
                    ) : (
                      <>
                        <span className="text-muted">{pendingNoEnrich.length} lead{pendingNoEnrich.length === 1 ? "" : "s"} not analysed yet — scores are provisional.</span>
                        <Button size="sm" variant="primary" icon={<ShieldCheck size={13} />} onClick={() => enrich(pendingNoEnrich.map((l) => l.id))}>
                          Enrich & verify {pendingNoEnrich.length}
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {view === "list" ? (
                  <LeadsTable
                    rows={filtered}
                    openId={openId}
                    onOpen={setOpenId}
                    selection={selection}
                    onToggle={toggle}
                    onToggleAll={(ids) => setSelection((s) => (ids.every((id) => s.has(id)) ? new Set() : new Set(ids)))}
                    onStage={setStage}
                    enriching={enriching}
                    lens={box.lens}
                  />
                ) : (
                  <Pipeline rows={filtered} onOpen={setOpenId} onStage={setStage} />
                )}
                {filtered.length === 0 && (
                  <div className="px-6 py-12 text-center text-sm text-muted">
                    No leads match these filters.{" "}
                    <button className="font-medium text-brand" onClick={() => { setTier("all"); setQuery(""); setReachableOnly(false); setHideChains(false); }}>
                      Clear filters
                    </button>
                  </div>
                )}
              </Card>
              <p className="px-1 text-[11px] text-faint">
                Keyboard: <kbd>/</kbd> search · <kbd>j</kbd>/<kbd>k</kbd> step through leads · <kbd>Esc</kbd> close. Data: OpenStreetMap contributors (ODbL), public company websites (robots.txt respected), DNS.
              </p>
            </>
          )}
        </section>
      </main>

      {openItem && (
        <LeadDrawer
          key={openItem.lead.id}
          item={openItem}
          box={box}
          onClose={() => setOpenId(null)}
          onUpdate={updateLead}
          onEnrich={(id) => enrich([id], true)}
          enriching={enriching.has(openItem.lead.id)}
          onPrev={openIndex > 0 ? () => setOpenId(filtered[openIndex - 1].lead.id) : undefined}
          onNext={openIndex >= 0 && openIndex < filtered.length - 1 ? () => setOpenId(filtered[openIndex + 1].lead.id) : undefined}
          position={openIndex >= 0 ? `${openIndex + 1} of ${filtered.length}` : undefined}
          toast={showToast}
        />
      )}

      {toast && (
        <div role="status" className="animate-fade-up fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-accent px-4 py-2.5 text-[13px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, highlight, onClick, active }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; highlight?: boolean; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-surface p-3.5 text-left shadow-card transition-colors",
        active ? "border-brand ring-2 ring-[var(--ring)]" : highlight ? "border-tier-a/40" : "border-line",
        onClick && "hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <span className={highlight ? "text-tier-a" : "text-muted"}>{icon}</span>
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular tracking-tight", highlight && "text-tier-a")}>{value}</div>
      <div className="mt-0.5 truncate text-[12px] text-muted">{sub}</div>
    </Tag>
  );
}

function EmptyHero({ onSample, onDiscover, busy }: { onSample: () => void; onDiscover: () => void; busy: boolean }) {
  const steps = [
    { title: "Find real businesses", body: "Search any industry + city on live OpenStreetMap data, or drop in a SaaSquatch CSV export." },
    { title: "Enrich & verify", body: "We read each company website (politely), pull owner, founding year, tech stack, and MX-check every email." },
    { title: "Prioritise with evidence", body: "Explainable acquisition or sales scores. Every point links to a quote or source — no black-box “low confidence”." },
    { title: "Reach out in one click", body: "Outreach written from the verified signals, CRM-ready exports, and a pipeline to track conversations." },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-[radial-gradient(circle_at_20%_0%,var(--brand-soft),transparent_55%)] px-6 py-10 sm:px-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-muted">
          <Sparkles size={12} className="text-brand" /> Built on top of SaaSquatch&apos;s lead lists
        </span>
        <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">From a raw list to the 10 owners worth calling today.</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Lead lists are easy to get. Knowing <em>who</em> to call, <em>why now</em>, and <em>what to say</em> is the hard part. LeadRadar turns businesses into ranked, verified, ready-to-contact targets — in about a minute.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onDiscover} disabled={busy} icon={busy ? <LoaderCircle size={15} className="animate-spin" /> : <Radar size={15} />}>
            Try it: HVAC companies in Austin, TX
          </Button>
          <Button onClick={onSample} icon={<Sparkles size={15} />}>
            Load a sample SaaSquatch export
          </Button>
        </div>
      </div>
      <ol className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="bg-surface p-5">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-ink">{i + 1}</span>
            <div className="mt-3 text-sm font-semibold">{s.title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
