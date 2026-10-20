import { readFileSync } from "node:fs";
import { closeDb, pool } from "@/db";
import { assertNotProduction, env } from "@/lib/env";
import { importAll, type ExportBundle } from "@/lib/export";

/**
 * Usage: npm run import -- path/to/export.json [--allow-production]
 * Restores a JSON export into an EMPTY database that already has the migrations applied.
 */
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Pfad zur export.json fehlt");
  if (!args.includes("--allow-production")) assertNotProduction("import into production without --allow-production");
  const bundle = JSON.parse(readFileSync(file, "utf8")) as ExportBundle;
  const client = await pool().connect();
  try {
    const counts = await importAll(client, bundle);
    console.log(`Import in ${env().APP_ENV} abgeschlossen:`);
    for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`);
  } finally {
    client.release();
    await closeDb();
  }
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
