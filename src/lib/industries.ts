/**
 * Industry catalog. Each entry maps a human label to OpenStreetMap tags (for discovery),
 * matching keywords (for buy-box fit on imported leads), a revenue-per-employee benchmark
 * (for transparent revenue ranges), and the post-acquisition AI playbook that the
 * outreach and "value-creation" signals draw on.
 */
export interface Industry {
  key: string;
  label: string;
  group: "Home services" | "Health" | "Professional" | "Auto" | "Food & retail" | "Industrial";
  osm: [string, string][];
  keywords: string[];
  /** USD revenue per employee, rough SMB benchmark used only for ranges. */
  rpe: [number, number];
  aiPlays: string[];
}

export const INDUSTRIES: Industry[] = [
  { key: "hvac", label: "HVAC", group: "Home services", osm: [["craft", "hvac"], ["shop", "hvac"]], keywords: ["hvac", "heating", "air conditioning", "cooling", "furnace"], rpe: [150_000, 230_000], aiPlays: ["AI call answering and 24/7 dispatch", "Maintenance-plan renewal automation", "Dynamic scheduling to cut drive time"] },
  { key: "plumbing", label: "Plumbing", group: "Home services", osm: [["craft", "plumber"]], keywords: ["plumb", "drain", "water heater", "sewer"], rpe: [140_000, 210_000], aiPlays: ["After-hours AI booking", "Quote follow-up sequences", "Review generation after each job"] },
  { key: "electrical", label: "Electrical", group: "Home services", osm: [["craft", "electrician"]], keywords: ["electric", "electrician", "wiring", "generator"], rpe: [140_000, 220_000], aiPlays: ["Estimate drafting from photos", "Lead routing and callback automation", "Permit-paperwork automation"] },
  { key: "roofing", label: "Roofing", group: "Home services", osm: [["craft", "roofer"]], keywords: ["roof", "gutter", "siding"], rpe: [160_000, 260_000], aiPlays: ["Storm-event lead targeting", "Satellite-measurement quoting", "Insurance-claim document prep"] },
  { key: "landscaping", label: "Landscaping", group: "Home services", osm: [["craft", "gardener"], ["shop", "garden_centre"]], keywords: ["landscap", "lawn", "garden", "tree service", "irrigation"], rpe: [80_000, 140_000], aiPlays: ["Route optimisation", "Seasonal upsell campaigns", "Crew scheduling"] },
  { key: "cleaning", label: "Cleaning & janitorial", group: "Home services", osm: [["shop", "dry_cleaning"], ["craft", "cleaning"], ["office", "cleaning"]], keywords: ["cleaning", "janitorial", "maid", "pressure wash"], rpe: [45_000, 80_000], aiPlays: ["Instant online quoting", "Recurring-contract retention alerts", "Staff scheduling"] },
  { key: "pest", label: "Pest control", group: "Home services", osm: [["craft", "pest_control"], ["office", "pest_control"]], keywords: ["pest", "termite", "exterminat"], rpe: [110_000, 170_000], aiPlays: ["Recurring-service renewal nudges", "Route density optimisation", "AI phone intake"] },
  { key: "construction", label: "Construction & builders", group: "Industrial", osm: [["craft", "builder"], ["office", "construction_company"], ["craft", "carpenter"]], keywords: ["construction", "builder", "contractor", "remodel", "carpent"], rpe: [180_000, 320_000], aiPlays: ["Bid/estimate automation", "Sub-contractor coordination", "Change-order documentation"] },
  { key: "manufacturing", label: "Manufacturing & machining", group: "Industrial", osm: [["craft", "metal_construction"], ["man_made", "works"], ["craft", "welder"], ["industrial", "factory"]], keywords: ["manufactur", "machining", "fabricat", "welding", "cnc", "metal"], rpe: [180_000, 300_000], aiPlays: ["Quote-to-order automation", "Predictive maintenance", "Inventory forecasting"] },
  { key: "printing", label: "Printing & signs", group: "Industrial", osm: [["craft", "printer"], ["shop", "copyshop"], ["craft", "signmaker"]], keywords: ["print", "sign", "graphics", "embroider"], rpe: [110_000, 180_000], aiPlays: ["Online proofing and ordering", "Reorder reminders", "Design-request automation"] },
  { key: "auto-repair", label: "Auto repair", group: "Auto", osm: [["shop", "car_repair"], ["shop", "tyres"]], keywords: ["auto repair", "mechanic", "collision", "tire", "brake", "transmission"], rpe: [120_000, 190_000], aiPlays: ["Service-due reminders", "AI phone booking", "Parts-price quoting"] },
  { key: "dental", label: "Dental practices", group: "Health", osm: [["amenity", "dentist"], ["healthcare", "dentist"]], keywords: ["dental", "dentist", "orthodont"], rpe: [120_000, 200_000], aiPlays: ["Recall and no-show reduction", "Insurance verification automation", "Treatment-plan follow-ups"] },
  { key: "veterinary", label: "Veterinary clinics", group: "Health", osm: [["amenity", "veterinary"]], keywords: ["veterinar", "animal hospital", "pet clinic"], rpe: [130_000, 200_000], aiPlays: ["Vaccine-reminder automation", "Online booking", "Clinical note transcription"] },
  { key: "physio", label: "Physical therapy & chiro", group: "Health", osm: [["healthcare", "physiotherapist"], ["healthcare", "chiropractor"]], keywords: ["physical therapy", "physiotherap", "chiropract", "rehab"], rpe: [90_000, 150_000], aiPlays: ["Visit-plan adherence nudges", "Automated intake forms", "Documentation assist"] },
  { key: "pharmacy", label: "Independent pharmacies", group: "Health", osm: [["amenity", "pharmacy"], ["healthcare", "pharmacy"]], keywords: ["pharmacy", "drugstore", "compounding"], rpe: [250_000, 450_000], aiPlays: ["Refill automation", "Inventory optimisation", "Adherence outreach"] },
  { key: "accounting", label: "Accounting & bookkeeping", group: "Professional", osm: [["office", "accountant"], ["office", "tax_advisor"]], keywords: ["accounting", "cpa", "bookkeep", "tax"], rpe: [110_000, 180_000], aiPlays: ["Document collection and categorisation", "Tax-season client intake", "Recurring advisory upsell"] },
  { key: "insurance", label: "Insurance agencies", group: "Professional", osm: [["office", "insurance"]], keywords: ["insurance", "agency", "benefits"], rpe: [120_000, 220_000], aiPlays: ["Renewal and cross-sell automation", "Quote comparison", "Claims intake"] },
  { key: "legal", label: "Law firms", group: "Professional", osm: [["office", "lawyer"]], keywords: ["law", "attorney", "legal"], rpe: [150_000, 280_000], aiPlays: ["Intake qualification", "Document drafting", "Billing capture"] },
  { key: "it-services", label: "IT & managed services", group: "Professional", osm: [["office", "it"], ["shop", "computer"], ["craft", "electronics_repair"]], keywords: ["it services", "managed service", "msp", "computer repair", "cyber"], rpe: [120_000, 200_000], aiPlays: ["Ticket triage", "Proactive monitoring upsell", "Contract renewal alerts"] },
  { key: "real-estate", label: "Real estate & property mgmt", group: "Professional", osm: [["office", "estate_agent"], ["office", "property_management"]], keywords: ["real estate", "realty", "property management"], rpe: [150_000, 300_000], aiPlays: ["Tenant communication automation", "Listing copy generation", "Maintenance request routing"] },
  { key: "logistics", label: "Logistics & moving", group: "Industrial", osm: [["office", "logistics"], ["office", "moving_company"], ["shop", "storage_rental"]], keywords: ["logistics", "trucking", "freight", "moving", "storage"], rpe: [150_000, 260_000], aiPlays: ["Route and load optimisation", "Instant move quotes", "Dispatch automation"] },
  { key: "bakery", label: "Bakeries & specialty food", group: "Food & retail", osm: [["shop", "bakery"], ["shop", "deli"], ["craft", "confectionery"]], keywords: ["bakery", "deli", "cafe", "confection"], rpe: [60_000, 110_000], aiPlays: ["Demand forecasting to cut waste", "Wholesale order portal", "Loyalty campaigns"] },
  { key: "brewery", label: "Breweries & wineries", group: "Food & retail", osm: [["craft", "brewery"], ["craft", "winery"], ["craft", "distillery"]], keywords: ["brew", "winery", "distill"], rpe: [120_000, 220_000], aiPlays: ["Distributor order automation", "Taproom CRM", "Production planning"] },
  { key: "hardware", label: "Hardware & supply stores", group: "Food & retail", osm: [["shop", "hardware"], ["shop", "doityourself"], ["shop", "trade"]], keywords: ["hardware", "supply", "lumber"], rpe: [150_000, 260_000], aiPlays: ["Inventory reorder automation", "B2B contractor portal", "Local SEO"] },
];

export function industryByKey(key?: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.key === key);
}

export function matchIndustry(text?: string): Industry | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  return INDUSTRIES.find((i) => i.key === t || i.label.toLowerCase() === t) ?? INDUSTRIES.find((i) => i.keywords.some((k) => t.includes(k)));
}

export function industryFromOsmTags(tags: Record<string, string>): Industry | undefined {
  return INDUSTRIES.find((i) => i.osm.some(([k, v]) => tags[k] === v));
}
