import { z } from "zod";
import { enrichWebsite } from "@/lib/crawler";
import { mapPool } from "@/lib/concurrency";
import { ndjsonStream } from "@/lib/ndjson";

export const maxDuration = 60;

const MAX_PER_REQUEST = 25;
const CONCURRENCY = 6;

const Body = z.object({
  items: z.array(z.object({ id: z.string(), website: z.string().optional() })).min(1).max(MAX_PER_REQUEST),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: `Send 1–${MAX_PER_REQUEST} leads per request.` }, { status: 400 });
  const { items, force } = parsed.data;

  return ndjsonStream(async (send, signal) => {
    let done = 0;
    let cached = 0;
    let ok = 0;
    const started = Date.now();
    for await (const r of mapPool(items, CONCURRENCY, async (item) => ({ id: item.id, enrichment: await enrichWebsite(item.website, { force }) }))) {
      if (signal.aborted) break;
      done++;
      if (r.enrichment.cached) cached++;
      if (r.enrichment.ok) ok++;
      send({ type: "enriched", id: r.id, enrichment: r.enrichment });
      send({ type: "status", message: `Analysed ${done}/${items.length} websites`, progress: done / items.length });
    }
    send({ type: "done", stats: { done, ok, cached, ms: Date.now() - started } });
  }, req);
}
