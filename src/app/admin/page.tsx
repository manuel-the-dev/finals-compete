import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";

export default async function AdminHome() {
  const [conf] = await db().select({ n: count() }).from(s.conflicts).where(eq(s.conflicts.status, "open"));
  const [review] = await db().select({ n: count() }).from(s.matches).where(eq(s.matches.needsReview, true));
  const [blocked] = await db().select({ n: count() }).from(s.markets).where(eq(s.markets.status, "settlement_blocked"));
  const logs = await db().select().from(s.auditLogs).orderBy(desc(s.auditLogs.createdAt)).limit(25);
  return (
    <>
      <h1>Admin</h1>
      <p className="muted">Umgebung: <strong>{env().APP_ENV}</strong></p>
      <div className="grid">
        <Link href="/admin/conflicts" className="card">Offene Konflikte: <strong>{conf.n}</strong></Link>
        <Link href="/admin/conflicts" className="card">Matches mit ausstehender Prüfung: <strong>{review.n}</strong></Link>
        <Link href="/admin/markets" className="card">Gesperrte Märkte: <strong>{blocked.n}</strong></Link>
      </div>
      <h2>Audit-Log</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Zeit</th><th>Akteur</th><th>Aktion</th><th>Objekt</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{fmtDate(l.createdAt)}</td>
                <td>{l.actorKind}</td>
                <td>{l.action}</td>
                <td className="small muted">{l.entityType} {l.entityId?.slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
