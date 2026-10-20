import { asc, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { ResultBadge, VerificationBadge, fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";
import { matchTitles } from "./matches/titles";

export default async function Home() {
  const now = new Date();
  const upcoming = await db().select().from(s.matches).where(gte(s.matches.scheduledAt, now)).orderBy(asc(s.matches.scheduledAt)).limit(8);
  const recent = await db().select().from(s.matches).where(eq(s.matches.status, "completed")).orderBy(desc(s.matches.scheduledAt)).limit(8);
  const posts = await db().select().from(s.socialPosts).orderBy(desc(s.socialPosts.publishedAt)).limit(6);
  const titles = await matchTitles([...upcoming, ...recent].map((m) => m.id));
  return (
    <>
      <h1>THE FINALS: kompetitive Szene</h1>
      <p className="muted">Ergebnisse gelten erst als bestätigt, wenn eine offizielle Quelle oder die Turnierdatenbank sie liefert. Jede Angabe zeigt ihre Quelle.</p>
      <div className="grid">
        <section>
          <h2>Nächste Matches</h2>
          {upcoming.length === 0 ? <p className="muted">Keine geplanten Matches importiert.</p> : null}
          {upcoming.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="card" style={{ display: "block", textDecoration: "none" }}>
              <strong>{titles.get(m.id)}</strong>
              <div className="small muted">{fmtDate(m.scheduledAt)}</div>
            </Link>
          ))}
        </section>
        <section>
          <h2>Letzte Resultate</h2>
          {recent.length === 0 ? <p className="muted">Noch keine Resultate.</p> : null}
          {recent.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="card" style={{ display: "block", textDecoration: "none" }}>
              <strong>{titles.get(m.id)}</strong>
              <div className="small">
                <ResultBadge status={m.resultStatus} /> <VerificationBadge v={m.resultVerification} />
              </div>
            </Link>
          ))}
        </section>
        <section>
          <h2>News aus Social Media</h2>
          {posts.map((p) => (
            <div key={p.id} className="card small">
              <a href={p.url} rel="noopener noreferrer" target="_blank">
                <strong>{p.title || p.body.slice(0, 90)}</strong>
              </a>
              <div className="muted">
                {p.platform} · {p.accountName ?? p.accountHandle} · {fmtDate(p.publishedAt)} <VerificationBadge v={p.verification} />
              </div>
            </div>
          ))}
          <Link href="/news" className="small">
            Alle News
          </Link>
        </section>
      </div>
    </>
  );
}
