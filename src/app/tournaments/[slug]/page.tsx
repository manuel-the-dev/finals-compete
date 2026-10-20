import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultBadge, VerificationBadge, fmtDate } from "@/components/badges";
import { SourceList } from "@/components/sources";
import { db } from "@/db";
import * as s from "@/db/schema";
import { matchTitles } from "../../matches/titles";

export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t] = await db().select().from(s.tournaments).where(eq(s.tournaments.slug, slug));
  if (!t) notFound();
  const parts = await db()
    .select({ team: s.teams, placement: s.tournamentParticipants.placement, v: s.tournamentParticipants.placementVerification })
    .from(s.tournamentParticipants)
    .innerJoin(s.teams, eq(s.teams.id, s.tournamentParticipants.teamId))
    .where(eq(s.tournamentParticipants.tournamentId, t.id))
    .orderBy(asc(s.tournamentParticipants.placement));
  const matches = await db().select().from(s.matches).where(eq(s.matches.tournamentId, t.id)).orderBy(asc(s.matches.scheduledAt));
  const titles = await matchTitles(matches.map((m) => m.id));
  return (
    <>
      <h1>{t.name}</h1>
      <p className="muted">
        {fmtDate(t.startDate)} bis {fmtDate(t.endDate)} · {t.organizer ?? "Organisator unbekannt"} · {t.format ?? ""} {t.prizePool ? `· ${t.prizePool}` : ""}
      </p>
      {t.officialUrl ? <p><a href={t.officialUrl} rel="noopener noreferrer">Offizielle Seite</a></p> : null}
      <h2>Teilnehmer und Platzierungen</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Platz</th><th>Team</th><th>Quelle</th></tr></thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.team.id}>
                <td>{p.placement ?? "–"}</td>
                <td><Link href={`/teams/${p.team.slug}`}>{p.team.name}</Link></td>
                <td>{p.placement ? <VerificationBadge v={p.v} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Matches</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Zeit</th><th>Match</th><th>Ergebnis</th></tr></thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id}>
                <td>{fmtDate(m.scheduledAt)}</td>
                <td><Link href={`/matches/${m.id}`}>{titles.get(m.id)}</Link> <span className="muted small">{m.roundLabel ?? ""}</span></td>
                <td><ResultBadge status={m.resultStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Quellen</h2>
      <SourceList entityType="tournament" entityId={t.id} />
    </>
  );
}
