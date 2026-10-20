import { desc } from "drizzle-orm";
import Link from "next/link";
import { fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";
import { MODE_LABEL, STATUS_LABEL } from "@/components/labels";

export default async function Markets() {
  const rows = await db().select().from(s.markets).orderBy(desc(s.markets.closesAt));
  return (
    <>
      <h1>Prediction-Märkte</h1>
      <p className="muted">Nur virtuelle Coins ohne Geldwert. Märkte werden nur automatisch abgerechnet, wenn eine offizielle Quelle oder die Turnierdatenbank das Ergebnis bestätigt und keine Quellen widersprechen.</p>
      {rows.map((m) => (
        <Link key={m.id} href={`/markets/${m.id}`} className="card" style={{ display: "block", textDecoration: "none" }}>
          <strong>{m.question}</strong> {m.isDemo ? <span className="badge b-demo">Demo</span> : null}
          <div className="small muted">
            {STATUS_LABEL[m.status]} · schliesst {fmtDate(m.closesAt)} · {MODE_LABEL[m.settlementMode]}
          </div>
        </Link>
      ))}
      {rows.length === 0 ? <p className="muted">Noch keine Märkte.</p> : null}
    </>
  );
}
