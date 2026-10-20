import { sql } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Used by uptime monitoring and the post-transfer smoke test. */
export async function GET() {
  try {
    await db().execute(sql`SELECT 1`);
    return Response.json({ ok: true, env: env().APP_ENV, time: new Date().toISOString() });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
