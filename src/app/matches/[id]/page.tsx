import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultBadge, VerificationBadge, fmtDate } from "@/components/badges";
import { SourceList } from "@/components/sources";
import { db } from "@/db";
import * as s from "@/db/schema";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [m] = await db().select().from(s.matches).where(eq(s.matches.id, id));
  if (!m) notFound();
  const [t] = m.tournamentId ? await db().select().from(s.tournaments).where(eq(s.tournaments.id, m.tournamentId)) : [];
  const parts = await db()
    .select({ team: s.teams, placement: s.matchParticipants.placement, score: s.matchParticipants.score })
    .from(s.matchParticipants)
    .innerJoin(s.teams, eq(s.teams.id, s.matchParticipants.teamId))
    .where(eq(s.matchParticipants.matchId, id));
  const claims = await db().select().from(s.resultClaims).where(eq(s.resultClaims.matchId, id));
  const posts = await db().select().from(s.socialPosts).where(eq(s.socialPosts.matchId, id));
  const conflicts = await db().select().from(s.conflicts).where(and(eq(s.conflicts.entityType, "match"), eq(s.conflicts.entityId, id)));
  const teamName = (tid: string | null) => parts.find((p) => p.team.id === tid)?.team.name ?? "unbekannt";
  return (
    <>
      <h1>{parts.map((p) => p.team.name).join(" vs ") || "Match"}</h1>
      <p className="muted">
        {t ? <Link href={`/tournaments/${t.slug}`}>{t.name}</Link> : "Ohne Turnier"} · {m.stage ?? ""} {m.roundLabel ?? ""} · {fmtDate(m.scheduledAt)}
      </p>
      <div className="card">
        <ResultBadge status={m.resultStatus} /> <VerificationBadge v={m.resultVerification} />
        {m.resultStatus === "verified" && m.winnerTeamId ? <p>Sieger: <strong>{teamName(m.winnerTeamId)}</strong></p> : null}
        {m.resultStatus === "provisional" ? <p className="small">Nur unbestätigte Angaben vorhanden. Kein offizielles Ergebnis.</p> : null}
        {m.needsReview ? <p className="small notice card">Eine neue Ergebnismeldung aus sozialen Medien wird geprüft.</p> : null}
        {conflicts.filter((c) => c.status === "open").map((c) => (
          <p key={c.id} className="small error card">Konflikt: {c.summary}</p>
        ))}
      </div>
      <h2>Teams</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Team</th><th>Platz</th><th>Score</th></tr></thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.team.id}>
                <td><Link href={`/teams/${p.team.slug}`}>{p.team.name}</Link></td>
                <td>{p.placement ?? "–"}</td>
                <td>{p.score ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Cashout-Werte werden nur angezeigt, wenn eine Quelle sie ausdrücklich dokumentiert. Derzeit liefert keine angebundene Quelle Cashout- oder Rundenereignisse.</p>
      <h2>Gemeldete Ergebnisse je Quelle</h2>
      <ul className="small">
        {claims.map((c) => (
          <li key={c.id}>
            <strong>{c.source}</strong> <VerificationBadge v={c.verification} /> meldet Sieger {teamName(c.winnerTeamId)} · {fmtDate(c.claimedAt)}
            {c.supersededAt ? <span className="muted"> (ersetzt)</span> : null}
            {c.note ? <span className="muted"> · {c.note}</span> : null}
          </li>
        ))}
        {claims.length === 0 ? <li className="muted">Noch keine.</li> : null}
      </ul>
      <h2>Quellen</h2>
      <SourceList entityType="match" entityId={id} />
      {posts.length ? (
        <>
          <h2>Erwähnungen in Social Media</h2>
          <ul className="small">
            {posts.map((p) => (
              <li key={p.id}>
                <a href={p.url} rel="noopener noreferrer" target="_blank">{p.title || p.body.slice(0, 100)}</a> · {p.platform} · {p.accountName ?? p.accountHandle} <VerificationBadge v={p.verification} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
