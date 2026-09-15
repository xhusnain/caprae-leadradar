import { db, storageLabel } from "@/lib/db";
import { aiAvailable } from "@/lib/outreach";

export async function GET() {
  await db().catch(() => null);
  return Response.json({ ai: aiAvailable() ? "Claude" : "Template", storage: storageLabel });
}
