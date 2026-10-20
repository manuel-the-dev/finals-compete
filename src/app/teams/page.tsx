import { asc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import * as s from "@/db/schema";

export default async function Teams() {
  const rows = await db().select().from(s.teams).orderBy(asc(s.teams.name));
  return (
    <>
      <h1>Teams</h1>
      <div className="grid">
        {rows.map((t) => (
          <Link key={t.id} href={`/teams/${t.slug}`} className="card" style={{ textDecoration: "none" }}>
            <strong>{t.name}</strong>
            <div className="small muted">{t.region ?? "Region unbekannt"}</div>
          </Link>
        ))}
      </div>
      {rows.length === 0 ? <p className="muted">Noch keine Teams importiert.</p> : null}
    </>
  );
}
