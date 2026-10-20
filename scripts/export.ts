import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb, pool } from "@/db";
import { env } from "@/lib/env";
import { EXPORT_TABLES, exportAll, toCsv } from "@/lib/export";

/**
 * Usage: npm run export -- [--out exports/2026-10-20] [--include-personal]
 * Writes export.json (all tables, re-importable) and one CSV per table.
 * Password hashes are never exported; e-mail addresses only with --include-personal.
 */
async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : path.join("exports", new Date().toISOString().replace(/[:.]/g, "-"));
  const includePersonal = args.includes("--include-personal");
  mkdirSync(out, { recursive: true });
  const bundle = await exportAll(pool(), { includePersonal, appEnv: env().APP_ENV });
  writeFileSync(path.join(out, "export.json"), JSON.stringify(bundle, null, 2));
  for (const t of EXPORT_TABLES) writeFileSync(path.join(out, `${t}.csv`), toCsv(bundle.tables[t] ?? []));
  console.log(`Export geschrieben nach ${out}`);
  for (const t of EXPORT_TABLES) console.log(`  ${t}: ${bundle.tables[t]?.length ?? 0}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
