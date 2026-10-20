import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceList } from "@/components/sources";
import { db } from "@/db";
import * as s from "@/db/schema";

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [team] = await db().select().from(s.teams).where(eq(s.teams.slug, slug));
  if (!team) notFound();
  const lineup = await db()
    .select({ player: s.players, role: s.teamMemberships.role })
    .from(s.teamMemberships)
    .innerJoin(s.players, eq(s.players.id, s.teamMemberships.playerId))
    .where(and(eq(s.teamMemberships.teamId, team.id), isNull(s.teamMemberships.leftAt)));
  const results = await db()
    .select({ t: s.tournaments, placement: s.tournamentParticipants.placement })
    .from(s.tournamentParticipants)
    .innerJoin(s.tournaments, eq(s.tournaments.id, s.tournamentParticipants.tournamentId))
    .where(eq(s.tournamentParticipants.teamId, team.id))
    .orderBy(desc(s.tournaments.startDate));
  return (
    <>
      <h1>{team.name}</h1>
      <p className="muted">{team.region ?? ""}</p>
      <h2>Aktuelles Lineup</h2>
      {lineup.length ? <ul>{lineup.map((l) => <li key={l.player.id}>{l.player.handle} {l.role ? `(${l.role})` : ""}</li>)}</ul> : <p className="muted">Kein Lineup aus einer Quelle bekannt.</p>}
      <h2>Turnierhistorie</h2>
      <ul>
        {results.map((r) => (
          <li key={r.t.id}>
            <Link href={`/tournaments/${r.t.slug}`}>{r.t.name}</Link> · Platz {r.placement ?? "offen"}
          </li>
        ))}
      </ul>
      <h2>Quellen</h2>
      <SourceList entityType="team" entityId={team.id} />
    </>
  );
}
