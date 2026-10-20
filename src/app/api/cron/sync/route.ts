import { db } from "@/db";
import { env } from "@/lib/env";
import { runDueSyncs } from "@/sources/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Alternative trigger for hosts with HTTP cron (e.g. Vercel Cron, which sends
 * "Authorization: Bearer $CRON_SECRET"). The default scheduler is the GitHub
 * Actions workflow .github/workflows/sync.yml.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runDueSyncs(db(), env(), "schedule");
  return Response.json({ results: results.map((r) => ({ source: r.sourceId, status: r.status, created: r.created, updated: r.updated })) });
}
