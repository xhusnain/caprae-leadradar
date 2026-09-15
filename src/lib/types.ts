/** Where a data point came from. Every field a user sees can be traced back to one of these. */
export interface Provenance {
  source: "OpenStreetMap" | "Website" | "JSON-LD" | "CSV import" | "DNS" | "Estimate" | "Manual";
  url?: string;
  quote?: string;
}

export type Stage = "new" | "researching" | "contacted" | "conversation" | "nda" | "passed";

export const STAGES: { key: Stage; label: string }[] = [
  { key: "new", label: "New" },
  { key: "researching", label: "Researching" },
  { key: "contacted", label: "Contacted" },
  { key: "conversation", label: "In conversation" },
  { key: "nda", label: "NDA / LOI" },
  { key: "passed", label: "Passed" },
];

export type EmailKind = "named" | "role" | "freemail";

export interface EmailFinding {
  address: string;
  kind: EmailKind;
  /** true = domain accepts mail (MX/A record), false = no mail server, null = not checked */
  mx: boolean | null;
  disposable: boolean;
  onOwnDomain: boolean;
  url?: string;
}

export interface Person {
  name: string;
  role: string;
  url?: string;
  quote?: string;
}

export interface Socials {
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  yelp?: string;
}

export type CrawlStatus = "ok" | "no-website" | "robots" | "blocked" | "captcha" | "unreachable";

export interface Enrichment {
  ok: boolean;
  status: CrawlStatus;
  error?: string;
  fetchedAt: number;
  cached: boolean;
  ms: number;
  finalUrl?: string;
  pages: string[];
  title?: string;
  description?: string;
  emails: EmailFinding[];
  phones: string[];
  socials: Socials;
  people: Person[];
  foundedYear?: number;
  foundedQuote?: string;
  foundedUrl?: string;
  headcount?: { value: number; quote: string; url?: string };
  familyOwned?: string;
  generational: string[];
  hiring?: { quote: string; url?: string };
  locationsCount?: number;
  /** Quote showing the site is a franchise / chain location rather than an independent owner. */
  franchise?: string;
  tech: string[];
  booking: boolean;
  ecommerce: boolean;
  chat: boolean;
  analytics: boolean;
  https: boolean;
  mobile: boolean;
  copyrightYear?: number;
  address?: string;
  city?: string;
  region?: string;
  textSample: string;
}

export interface Lead {
  id: string;
  name: string;
  domain?: string;
  website?: string;
  phone?: string;
  email?: string;
  industry?: string;
  address?: string;
  city?: string;
  region?: string;
  postcode?: string;
  country?: string;
  lat?: number;
  lon?: number;
  openingHours?: string;
  /** Brand / operator from map data: a strong hint the location belongs to a chain. */
  brand?: string;
  /** Raw values carried from a SaaSquatch export, kept for side-by-side comparison. */
  imported?: { revenue?: string; bbb?: string; employees?: string; owner?: string; title?: string; linkedin?: string };
  sources: string[];
  duplicatesMerged: number;
  provenance: Record<string, Provenance>;
  enrichment?: Enrichment;
  stage: Stage;
  notes: string;
  addedAt: number;
}

export type Lens = "acquisition" | "sales";

export type FactorKey = "tenure" | "upside" | "reach" | "fit" | "proof";

export type Weights = Record<FactorKey, number>;

export interface BuyBox {
  lens: Lens;
  industries: string[];
  regions: string[];
  minYears: number | null;
  weights: Weights;
  /** Short line about the user, used to personalise outreach. */
  profile: { name: string; pitch: string };
}

export interface FactorResult {
  key: FactorKey;
  label: string;
  weight: number;
  score: number; // 0..1
  known: boolean;
  evidence: string[];
  gaps: string[];
}

export type Tier = "A" | "B" | "C" | "D";

export interface Signal {
  kind: "succession" | "hiring" | "digital-gap" | "growth" | "reach" | "risk";
  label: string;
  detail: string;
}

export interface NextAction {
  kind: "call" | "email" | "research" | "skip";
  label: string;
}

export interface Estimate {
  low: number;
  high: number;
  method: string;
  confidence: "medium" | "low";
}

export interface ScoreResult {
  total: number;
  tier: Tier;
  factors: FactorResult[];
  coverage: number; // share of weight backed by real data (0..1)
  completeness: number; // share of key fields filled (0..1)
  signals: Signal[];
  next: NextAction;
  reasons: string[];
  revenue?: Estimate;
}

export interface OutreachDraft {
  subject: string;
  email: string;
  callOpener: string;
  linkedin: string;
  followUps: { day: number; body: string }[];
  whyNow: string;
  talkingPoints: string[];
  engine: "claude" | "template";
}

export type Tone = "warm" | "direct" | "formal";

/** NDJSON events streamed by the discovery and enrichment endpoints. */
export type StreamEvent =
  | { type: "status"; message: string; progress?: number }
  | { type: "lead"; lead: Lead }
  | { type: "enriched"; id: string; enrichment: Enrichment }
  | { type: "done"; stats: Record<string, number | string> }
  | { type: "error"; message: string };
