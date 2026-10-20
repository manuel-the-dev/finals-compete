import { desc } from "drizzle-orm";
import Link from "next/link";
import { fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";

const STATUS = { upcoming: "Geplant", ongoing: "Läuft", completed: "Abgeschlossen", cancelled: "Abgesagt" } as const;

export default async function Tournaments() {
  const rows = await db().select().from(s.tournaments).orderBy(desc(s.tournaments.startDate));
  return (
    <>
      <h1>Turniere</h1>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Turnier</th><th>Status</th><th>Start</th><th>Preisgeld</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/tournaments/${t.slug}`}>{t.name}</Link></td>
                <td>{STATUS[t.status]}</td>
                <td>{fmtDate(t.startDate)}</td>
                <td>{t.prizePool ?? "–"}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={4} className="muted">Noch keine Turniere importiert.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
