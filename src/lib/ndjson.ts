import type { StreamEvent } from "./types";

/** Stream NDJSON so the UI renders each result the moment it is ready (time-to-first-lead = fastest site, not slowest). */
export function ndjsonStream(run: (send: (e: StreamEvent) => void, signal: AbortSignal) => Promise<void>, req: Request): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (e: StreamEvent) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        await run(send, req.signal);
      } catch (err) {
        send({ type: "error", message: (err as Error).message || "Unexpected error" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
