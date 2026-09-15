import { z } from "zod";
import { discover } from "@/lib/discover";
import { ndjsonStream } from "@/lib/ndjson";

export const maxDuration = 60;

const Body = z.object({
  industries: z.array(z.string()).min(1).max(6),
  location: z.string().min(2).max(120),
  limit: z.number().int().min(5).max(120).default(40),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Choose at least one industry and a location." }, { status: 400 });
  const { industries, location, limit } = parsed.data;

  return ndjsonStream(async (send) => {
    send({ type: "status", message: `Locating “${location}”…`, progress: 0.1 });
    const started = Date.now();
    const result = await discover(industries, location, limit);
    send({
      type: "status",
      message: `${result.cached ? "Loaded cached" : "Found"} ${result.leads.length} businesses in ${result.place.label.split(",").slice(0, 2).join(",")}${result.place.clipped ? " (metro area)" : ""}`,
      progress: 0.9,
    });
    for (const lead of result.leads) send({ type: "lead", lead });
    send({
      type: "done",
      stats: { found: result.leads.length, raw: result.raw, withWebsite: result.withWebsite, place: result.place.label, cached: String(result.cached), ms: Date.now() - started },
    });
  }, req);
}
