import { closeDb, db } from "@/db";
import { env } from "@/lib/env";
import { runDueSyncs } from "@/sources/scheduler";
import { ADAPTERS, getAdapter } from "@/sources/registry";
import { runSync } from "@/sources/pipeline";

/**
 * Usage:
 *   npm run sync -- --due            run every enabled source whose interval has elapsed (used by cron)
 *   npm run sync -- --source liquipedia
 *   npm run sync -- --all
 */
async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  let results;
  if (sourceIdx >= 0) {
    results = [await runSync(db(), env(), getAdapter(args[sourceIdx + 1]), { trigger: "cli" })];
  } else if (args.includes("--all")) {
    results = [];
    for (const a of ADAPTERS) results.push(await runSync(db(), env(), a, { trigger: "cli" }));
  } else {
    results = await runDueSyncs(db(), env(), "schedule");
  }
  for (const r of results) {
    console.log(`${r.sourceId}: ${r.status} (req ${r.requests}, neu ${r.created}, geändert ${r.updated}, unverändert ${r.unchanged})`);
    for (const w of r.warnings) console.log(`  Warnung: ${w}`);
    for (const e of r.errors) console.log(`  Fehler: ${e}`);
  }
  await closeDb();
  // Exit non-zero only when a configured source failed completely, so cron alerts are meaningful.
  if (results.some((r) => r.status === "failed")) process.exit(2);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
