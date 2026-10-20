import { readFileSync } from "node:fs";
import { Pool } from "pg";

/**
 * Fails when the database is missing migrations that are in ./drizzle.
 * Production builds run this so a deploy never starts against an outdated schema;
 * production migrations are applied deliberately via the "Migrate database" workflow.
 */
async function main() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let applied = 0;
  try {
    const r = await pool.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
    applied = r.rows[0].n;
  } catch {
    applied = 0;
  } finally {
    await pool.end();
  }
  const expected = journal.entries.length;
  if (applied < expected) {
    console.error(`Datenbank hat ${applied}/${expected} Migrationen. Bitte zuerst den Workflow "Migrate database" ausführen.`);
    process.exit(1);
  }
  console.log(`Migrationen aktuell (${applied}/${expected}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
