import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pool?: Pool; __db?: DB };

export function db(): DB {
  if (!globalForDb.__db) {
    globalForDb.__pool = new Pool({ connectionString: env().DATABASE_URL, max: 5 });
    globalForDb.__db = drizzle(globalForDb.__pool, { schema });
  }
  return globalForDb.__db;
}

export function pool(): Pool {
  db();
  return globalForDb.__pool!;
}

export async function closeDb() {
  await globalForDb.__pool?.end();
  globalForDb.__pool = undefined;
  globalForDb.__db = undefined;
}

export { schema };
