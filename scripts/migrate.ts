import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, db } from "@/db";
import { env } from "@/lib/env";

/** Applies the SQL migrations in ./drizzle. Safe to run repeatedly. */
async function main() {
  console.log(`Applying migrations (APP_ENV=${env().APP_ENV})`);
  await migrate(db(), { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
