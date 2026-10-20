import { db, pool } from "@/db";
import * as s from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { EXPORT_TABLES, exportAll, exportTable, toCsv, type ExportTable } from "@/lib/export";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const includePersonal = url.searchParams.get("personal") === "1";
  const format = url.searchParams.get("format") ?? "json";
  const table = url.searchParams.get("table") as ExportTable | null;
  await db().insert(s.auditLogs).values({ actorKind: "admin", actorUserId: user.id, action: "data.exported", details: { format, table, includePersonal } });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (format === "csv") {
    if (!table || !EXPORT_TABLES.includes(table)) return Response.json({ error: "unknown table" }, { status: 400 });
    const rows = await exportTable(pool(), table, includePersonal);
    return new Response(toCsv(rows), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${table}-${stamp}.csv"` },
    });
  }
  const bundle = await exportAll(pool(), { includePersonal, appEnv: env().APP_ENV });
  return new Response(JSON.stringify(bundle), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="finals-compete-export-${stamp}.json"` },
  });
}
