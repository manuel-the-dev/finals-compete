import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, db, pool } from "@/db";
import { resetEnvCache } from "@/lib/env";

/**
 * Integration tests run against TEST_DATABASE_URL only. The database name must
 * contain "test" so a test run can never wipe a development or production DB.
 */
export function testDbUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;
  if (!/test/i.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must point to a database whose name contains 'test'");
  return url;
}

export async function freshDb() {
  const url = testDbUrl()!;
  process.env.DATABASE_URL = url;
  process.env.APP_ENV = "test";
  process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
  resetEnvCache();
  await closeDb();
  await pool().query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(db(), { migrationsFolder: "drizzle" });
  return db();
}

/** Minimal fetch stub: maps URL substrings to JSON/text bodies. */
export function fakeFetch(routes: Record<string, unknown | ((url: string) => unknown)>, calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    const v = typeof routes[key] === "function" ? (routes[key] as (u: string) => unknown)(url) : routes[key];
    if (v instanceof Response) return v;
    return typeof v === "string" ? new Response(v, { status: 200 }) : new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
