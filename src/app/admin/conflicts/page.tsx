import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { VerificationBadge, fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";
import { clearReviewAction, dismissConflictAction, manualResultAction } from "../../actions";

async function teamsOf(matchId: string) {
  return db().select({ id: s.teams.id, name: s.teams.name }).from(s.matchParticipants).innerJoin(s.teams, eq(s.teams.id, s.matchParticipants.teamId)).where(eq(s.matchParticipants.matchId, matchId));
}

function ManualResultForm({ matchId, teams }: { matchId: string; teams: { id: string; name: string }[] }) {
  return (
    <form action={manualResultAction} className="inline">
      <input type="hidden" name="matchId" value={matchId} />
      <select name="winnerTeamId" required>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <input name="sourceUrl" type="url" placeholder="Quell-URL (Pflicht)" required />
      <input name="note" placeholder="Begründung" required />
      <button type="submit">Ergebnis festlegen</button>
    </form>
  );
}

export default async function AdminConflicts({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const open = await db().select().from(s.conflicts).where(eq(s.conflicts.status, "open")).orderBy(desc(s.conflicts.createdAt));
  const review = await db().select().from(s.matches).where(eq(s.matches.needsReview, true));
  const claimIds = open.flatMap((c) => c.claimIds);
  const claims = claimIds.length ? await db().select().from(s.resultClaims).where(inArray(s.resultClaims.id, claimIds)) : [];
  const recs = claims.length ? await db().select().from(s.sourceRecords).where(inArray(s.sourceRecords.entityId, [...new Set(claims.map((c) => c.matchId))])) : [];
  return (
    <>
      <h1>Konflikte &amp; Prüfungen</h1>
      {sp.error ? <div className="card error">{sp.error}</div> : null}
      {sp.ok ? <div className="card">Gespeichert.</div> : null}
      <h2>Widersprüchliche Resultate ({open.length})</h2>
      {open.map(async (c) => {
        const teams = c.entityType === "match" ? await teamsOf(c.entityId) : [];
        const name = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "–";
        return (
          <div key={c.id} className={`card ${c.severity === "blocking" ? "error" : "notice"}`}>
            <strong>{c.severity === "blocking" ? "Blockierend" : "Warnung"}</strong> · {c.summary} · {fmtDate(c.createdAt)}{" "}
            {c.entityType === "match" ? <Link href={`/matches/${c.entityId}`}>Match ansehen</Link> : <span className="muted">Turnier {c.entityId.slice(0, 8)}</span>}
            <ul className="small">
              {claims.filter((cl) => c.claimIds.includes(cl.id)).map((cl) => {
                const url = recs.find((r) => r.source === cl.source && r.entityId === cl.matchId)?.url;
                return (
                  <li key={cl.id}>
                    {cl.source} <VerificationBadge v={cl.verification} />: Sieger {name(cl.winnerTeamId)} · {fmtDate(cl.claimedAt)} {url ? <a href={url} rel="noopener noreferrer">Original</a> : null}
                  </li>
                );
              })}
            </ul>
            {c.entityType === "match" ? <ManualResultForm matchId={c.entityId} teams={teams} /> : null}
            <form action={dismissConflictAction} className="inline" style={{ marginTop: 6 }}>
              <input type="hidden" name="conflictId" value={c.id} />
              <input name="note" placeholder="Begründung" required />
              <button type="submit" className="secondary">Niedriger eingestufte Quelle verwerfen</button>
            </form>
          </div>
        );
      })}
      <h2>Ergebnismeldungen aus Social Media ({review.length})</h2>
      {review.map(async (m) => {
        const teams = await teamsOf(m.id);
        const posts = await db().select().from(s.socialPosts).where(eq(s.socialPosts.matchId, m.id));
        return (
          <div key={m.id} className="card notice">
            <Link href={`/matches/${m.id}`}>{teams.map((t) => t.name).join(" vs ")}</Link> · aktueller Status: {m.resultStatus}
            <ul className="small">
              {posts.filter((p) => !p.reviewedAt).map((p) => (
                <li key={p.id}>
                  <a href={p.url} rel="noopener noreferrer" target="_blank">{p.title || p.body.slice(0, 120)}</a> · {p.accountName ?? p.accountHandle} <VerificationBadge v={p.verification} />
                </li>
              ))}
            </ul>
            <form action={clearReviewAction} className="inline">
              <input type="hidden" name="matchId" value={m.id} />
              <input name="note" placeholder="Notiz" required />
              <button type="submit" className="secondary">Geprüft, Ergebnis bleibt</button>
            </form>
            <div style={{ marginTop: 6 }}><ManualResultForm matchId={m.id} teams={teams} /></div>
          </div>
        );
      })}
    </>
  );
}
