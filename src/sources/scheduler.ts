import type { DB } from "@/db";
import type { Env } from "@/lib/env";
import { ensureDataSource, runSync, type SyncSummary } from "./pipeline";
import { ADAPTERS } from "./registry";

/** Runs each enabled, configured source whose configured interval has elapsed. */
export async function runDueSyncs(db: DB, env: Env, trigger: "schedule" | "manual" = "schedule", now = new Date()): Promise<SyncSummary[]> {
  const out: SyncSummary[] = [];
  for (const adapter of ADAPTERS) {
    const ds = await ensureDataSource(db, adapter);
    if (!ds.enabled || !adapter.configured(env).ok) continue;
    const last = ds.lastAttemptAt?.getTime() ?? 0;
    if (now.getTime() - last < ds.intervalMinutes * 60_000 - 30_000) continue;
    out.push(await runSync(db, env, adapter, { trigger }));
  }
  return out;
}
