"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radar, Search, X, Trash2, RefreshCw, Share2, Check, SlidersHorizontal, LoaderCircle, Handshake, BriefcaseBusiness, ShieldCheck, Sparkles, ListChecks, Send } from "lucide-react";
import type { BuyBox, Enrichment, Lead, Lens, ScoreResult, Stage, Tier } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { dedupeLeads } from "@/lib/dedupe";
import { DEFAULT_WEIGHTS, bestEmail, decisionMaker, defaultBuyBox, rankLeads } from "@/lib/score";
import { postStream } from "@/lib/stream";
import { detectColumns, parseCsv, rowsToLeads } from "@/lib/csv";
import { industryByKey } from "@/lib/industries";
import { Button, Card, Chip, Segmented, Sheet, cn, inputCls, selectCls } from "./ui";
import SearchBar from "./SearchBar";
import ImportDialog from "./ImportDialog";
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
  const [boxOpen, setBoxOpen] = useState(false);
  const [importTab, setImportTab] = useState<"csv" | "paste" | null>(null);
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
      setActivity({ message: `Analysing websites · 0 of ${unique.length}`, progress: 0 });
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
              setActivity({ message: `Analysing websites · ${done} of ${unique.length}`, progress: done / unique.length });
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
          showToast(`No mapped businesses found near ${location}. Try a nearby city or another industry.`);
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
    const tiers = { A: 0, B: 0, C: 0, D: 0 } as Record<Tier, number>;
    ranked.forEach((r) => tiers[r.score.tier]++);
    const avg = (f: (r: Ranked) => number) => (ranked.length ? ranked.reduce((s, r) => s + f(r), 0) / ranked.length : 0);
    return {
      total: ranked.length,
      tiers,
      enriched: ranked.filter((r) => r.lead.enrichment).length,
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
  const setLens = (lens: Lens) => setBox((b) => ({ ...b, lens, weights: { ...DEFAULT_WEIGHTS[lens] } }));

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
  const boxCount = box.industries.length + box.regions.length + (box.minYears ? 1 : 0);
  const hasLeads = leads.length > 0;

  const stat = [
    { label: "Leads", value: stats.total, sub: `${stats.enriched} enriched · ${dupesRemoved} duplicate${dupesRemoved === 1 ? "" : "s"} merged` },
    { label: "Priority", value: stats.tiers.A, sub: `${stats.tiers.B} strong · call these first`, onClick: () => setTier(tier === "A" ? "all" : "A"), active: tier === "A" },
    { label: "Owners named", value: stats.owners, sub: `${stats.verified} with verified email domain`, onClick: () => setReachableOnly((v) => !v), active: reachableOnly },
    { label: "Data completeness", value: `${Math.round(stats.completeness * 100)}%`, sub: `${Math.round(stats.coverage * 100)}% of scoring backed by evidence` },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white">
              <Radar size={15} strokeWidth={2.4} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">LeadRadar</span>
            <span className="hidden text-[13px] text-faint sm:inline">for SaaSquatch</span>
          </div>

          <ol className="hidden items-center gap-5 text-[13px] lg:flex" aria-label="Workflow">
            {["Find", "Enrich & verify", "Prioritise", "Reach out"].map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const current = n === step;
              return (
                <li key={label} className={cn("flex items-center gap-1.5", current ? "font-medium text-ink" : done ? "text-muted" : "text-faint")}>
                  <span className={cn("grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-semibold", done ? "bg-brand-soft text-brand" : current ? "bg-brand text-white" : "bg-surface-3 text-faint")}>
                    {done ? <Check size={11} strokeWidth={3} /> : n}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>

          <div className="ml-auto flex items-center gap-2">
            {status && (
              <span className="hidden items-center gap-1.5 text-[12px] text-faint md:inline-flex" title="Outreach engine · storage backend">
                {saved === "saving" ? <LoaderCircle size={12} className="animate-spin" /> : <span className={cn("h-1.5 w-1.5 rounded-full", status.ai === "Claude" ? "bg-brand" : "bg-line-strong")} />}
                {status.ai === "Claude" ? "Claude outreach" : "Template outreach"} · {status.storage}
              </span>
            )}
            {hasLeads && (
              <Button size="sm" variant="ghost" onClick={share} icon={<Share2 size={14} />} className="hidden sm:inline-flex">
                Share
              </Button>
            )}
            <ExportMenu rows={selectedRows} box={box} scope={selection.size ? `${selection.size} selected` : `${filtered.length} in view`} stats={stats} dupesRemoved={dupesRemoved} onDone={showToast} />
          </div>
        </div>
        {activity && (
          <div className="relative h-0.5 bg-surface-3">
            <div className={cn("absolute inset-y-0 left-0 bg-brand transition-[width] duration-300", activity.progress === undefined && "w-1/3 animate-pulse")} style={activity.progress !== undefined ? { width: `${Math.max(4, Math.round(activity.progress * 100))}%` } : undefined} />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pb-16 sm:px-8">
        {/* Title row */}
        <div className={cn("flex flex-wrap items-end justify-between gap-4", hasLeads ? "pt-8" : "pt-16 sm:pt-20")}>
          <div className={cn(!hasLeads && "max-w-2xl")}>
            {!hasLeads && <p className="mb-3 text-[13px] font-medium text-brand">Lead intelligence for SaaSquatch</p>}
            <h1 className={cn("font-semibold tracking-tight text-ink", hasLeads ? "text-[22px]" : "text-[36px] leading-[1.1] sm:text-[44px]")}>
              {hasLeads ? "Lead workspace" : "Find the owners worth calling."}
            </h1>
            <p className={cn("text-muted", hasLeads ? "mt-1 text-sm" : "mt-4 text-[16px] leading-relaxed")}>
              {hasLeads
                ? "Ranked by evidence. Open any lead to see why it scores, who to contact and what to say."
                : "Search real businesses by industry and city. LeadRadar verifies each one, ranks them with explainable scores, and drafts the first message."}
            </p>
          </div>
          {hasLeads && (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<Lens>
                value={box.lens}
                onChange={setLens}
                options={[
                  { value: "acquisition", label: <><Handshake size={14} /> Businesses to buy</> },
                  { value: "sales", label: <><BriefcaseBusiness size={14} /> Customers</> },
                ]}
              />
              <Button onClick={() => setBoxOpen(true)} icon={<SlidersHorizontal size={14} />}>
                Buy box
                {boxCount > 0 && <span className="ml-0.5 rounded-full bg-brand-soft px-1.5 text-[11px] font-semibold text-brand-ink">{boxCount}</span>}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <SearchBar onDiscover={runDiscover} busy={discovering} onOpenImport={setImportTab} onSample={loadSample} autoEnrich={autoEnrich} setAutoEnrich={setAutoEnrich} />
        </div>

        {activity && (
          <div className="mt-4 flex items-center gap-2 text-[13px] text-muted" role="status" aria-live="polite">
            <LoaderCircle size={14} className="animate-spin text-brand" />
            {activity.message}
          </div>
        )}

        {!hasLeads ? (
          <EmptyState onTry={() => runDiscover(["hvac"], "Austin, TX", 30)} busy={discovering} />
        ) : (
          <>
            <Card className="mt-8 grid grid-cols-2 overflow-hidden lg:grid-cols-4">
              {stat.map((s, i) => {
                const Tag = s.onClick ? "button" : "div";
                return (
                  <Tag
                    key={s.label}
                    onClick={s.onClick}
                    className={cn(
                      "px-5 py-4 text-left transition-colors",
                      i % 2 === 1 && "border-l border-line",
                      i >= 2 && "border-t border-line lg:border-t-0",
                      i === 2 && "lg:border-l",
                      s.onClick && "hover:bg-surface-2",
                      s.active && "bg-brand-soft/60 hover:bg-brand-soft/60",
                    )}
                  >
                    <div className={cn("flex items-center gap-1.5 text-[13px]", s.active ? "font-medium text-brand-ink" : "text-muted")}>
                      {s.label}
                      {s.active && <span className="text-[11px] font-normal">· filtered</span>}
                    </div>
                    <div className="mt-1 text-[26px] font-semibold tabular tracking-tight text-ink">{s.value}</div>
                    <div className="truncate text-[12px] text-faint">{s.sub}</div>
                  </Tag>
                );
              })}
            </Card>

            <Card className="mt-5 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                <Segmented
                  value={view}
                  onChange={setView}
                  size="sm"
                  options={[
                    { value: "list", label: "Ranked" },
                    { value: "pipeline", label: "Pipeline" },
                  ]}
                />
                <div className="relative w-full min-w-[200px] sm:w-64">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                  <input id="lead-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads" className={cn(inputCls, "h-8 pl-8 text-[13px]")} />
                  <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1 text-[10px] text-faint sm:block">/</kbd>
                </div>
                <Segmented<Tier | "all">
                  value={tier}
                  onChange={setTier}
                  size="sm"
                  options={(["all", "A", "B", "C", "D"] as const).map((t) => ({
                    value: t,
                    label: (
                      <>
                        {t === "all" ? "All" : t}
                        <span className="tabular font-normal text-faint">{t === "all" ? stats.total : stats.tiers[t]}</span>
                      </>
                    ),
                  }))}
                />
                <Chip active={reachableOnly} onClick={() => setReachableOnly((v) => !v)}>Owner reachable</Chip>
                <Chip active={hideChains} onClick={() => setHideChains((v) => !v)}>Hide chains</Chip>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={cn(selectCls, "ml-auto h-8 text-[13px]")} aria-label="Sort">
                  <option value="score">Sort by score</option>
                  <option value="founded">Oldest first</option>
                  <option value="completeness">Most complete</option>
                  <option value="name">Name</option>
                </select>
              </div>

              {(selection.size > 0 || pendingNoEnrich.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-4 py-2 text-[13px]">
                  {selection.size > 0 ? (
                    <>
                      <span className="font-medium text-ink">{selection.size} selected</span>
                      <span className="mx-1 h-4 w-px bg-line-strong" />
                      <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={() => enrich([...selection], true)}>Re-enrich</Button>
                      <select className={cn(selectCls, "h-8 text-[13px]")} defaultValue="" onChange={(e) => { const st = e.target.value as Stage; if (st) { selection.forEach((id) => setStage(id, st)); showToast(`Moved ${selection.size} to ${STAGES.find((s) => s.key === st)?.label}`); } e.target.value = ""; }}>
                        <option value="">Move to stage…</option>
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={removeSelected}>Remove</Button>
                      <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setSelection(new Set())} className="ml-auto">Clear selection</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-muted">{pendingNoEnrich.length} lead{pendingNoEnrich.length === 1 ? " hasn't" : "s haven't"} been analysed yet, so scores are provisional.</span>
                      <Button size="sm" variant="primary" icon={<ShieldCheck size={13} />} onClick={() => enrich(pendingNoEnrich.map((l) => l.id))} className="ml-auto">
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
                <div className="border-t border-line px-6 py-14 text-center text-sm text-muted">
                  No leads match these filters.{" "}
                  <button className="font-medium text-brand hover:underline" onClick={() => { setTier("all"); setQuery(""); setReachableOnly(false); setHideChains(false); }}>
                    Clear filters
                  </button>
                </div>
              )}
            </Card>
            <p className="mt-4 text-[12px] text-faint">
              Shortcuts: <kbd className="font-sans">/</kbd> search · <kbd className="font-sans">j</kbd> <kbd className="font-sans">k</kbd> move between leads · <kbd className="font-sans">Esc</kbd> close. Sources: OpenStreetMap contributors (ODbL), public company websites (robots.txt respected), DNS.
            </p>
          </>
        )}
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

      <Sheet
        open={boxOpen}
        onClose={() => setBoxOpen(false)}
        title="Buy box & scoring"
        subtitle={box.lens === "acquisition" ? "Define the businesses you want to acquire." : "Define your ideal customer."}
        footer={<Button variant="primary" className="w-full" onClick={() => setBoxOpen(false)}>Apply — rankings update instantly</Button>}
      >
        <BuyBoxPanel box={box} onChange={setBox} />
      </Sheet>

      {importTab && <ImportDialog open initialTab={importTab} onClose={() => setImportTab(null)} onImport={importLeads} onSample={loadSample} />}

      {toast && (
        <div role="status" data-toast className="animate-fade-up fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-[13px] text-white shadow-[var(--shadow-pop)]">
          {toast}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onTry, busy }: { onTry: () => void; busy: boolean }) {
  const steps = [
    { icon: Search, title: "Find real businesses", body: "Live OpenStreetMap data by industry and city, or your SaaSquatch CSV export." },
    { icon: ShieldCheck, title: "Enrich & verify", body: "Each website is read politely for owners, founding year and tech stack. Emails are MX-checked." },
    { icon: ListChecks, title: "Prioritise with evidence", body: "Explainable scores where every point links to a quote or source. No black-box confidence labels." },
    { icon: Send, title: "Reach out", body: "Outreach written from verified signals, CRM-ready exports and a pipeline to track conversations." },
  ];
  return (
    <div className="mt-10">
      <Button onClick={onTry} disabled={busy} icon={busy ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} className="text-brand" />}>
        Try it: HVAC companies in Austin, TX
      </Button>
      <div className="mt-16 grid gap-x-10 gap-y-8 border-t border-line pt-10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-muted"><s.icon size={15} /></span>
              <span className="text-[12px] font-medium text-faint">Step {i + 1}</span>
            </div>
            <div className="mt-3 text-[15px] font-semibold text-ink">{s.title}</div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
