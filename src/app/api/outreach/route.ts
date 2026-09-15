import type { BuyBox, Lead, Tone } from "@/lib/types";
import { scoreLead } from "@/lib/score";
import { aiAvailable, claudeDraft, templateDraft } from "@/lib/outreach";
import { cacheGet, cacheSet } from "@/lib/db";
import { hashId } from "@/lib/domain";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { lead?: Lead; box?: BuyBox; tone?: Tone; regenerate?: boolean } | null;
  if (!body?.lead?.name || !body.box) return Response.json({ error: "lead and box are required" }, { status: 400 });
  const { lead, box } = body;
  const tone: Tone = ["warm", "direct", "formal"].includes(body.tone ?? "") ? body.tone! : "warm";
  const score = scoreLead(lead, box);

  if (!aiAvailable()) return Response.json({ draft: templateDraft(lead, score, box, tone), note: "Template mode — set ANTHROPIC_API_KEY for Claude-written drafts." });

  const key = hashId(JSON.stringify([lead.id, lead.enrichment?.fetchedAt, box.lens, box.profile, tone, score.signals.map((s) => s.label)]));
  if (!body.regenerate) {
    const hit = await cacheGet("outreach", key);
    if (hit) return Response.json({ draft: hit, cached: true });
  }
  try {
    const draft = await claudeDraft(lead, score, box, tone);
    await cacheSet("outreach", key, draft, 7 * 24 * 3600_000);
    return Response.json({ draft });
  } catch (e) {
    console.warn("[outreach] Claude failed, using template:", (e as Error).message);
    return Response.json({ draft: templateDraft(lead, score, box, tone), note: "AI unavailable right now — showing the signal-based template." });
  }
}
