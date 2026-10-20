import { desc, eq, inArray } from "drizzle-orm";
import { fmtDate } from "@/components/badges";
import { MODE_LABEL, STATUS_LABEL } from "@/components/labels";
import { db } from "@/db";
import * as s from "@/db/schema";
import { createMarketAction, settleManuallyAction } from "../../actions";

export default async function AdminMarkets({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const markets = await db().select().from(s.markets).where(inArray(s.markets.status, ["open", "locked", "settlement_blocked"])).orderBy(desc(s.markets.closesAt));
  const matches = await db().select({ id: s.matches.id, label: s.matches.roundLabel, at: s.matches.scheduledAt }).from(s.matches).orderBy(desc(s.matches.scheduledAt)).limit(200);
  const tournaments = await db().select({ id: s.tournaments.id, name: s.tournaments.name }).from(s.tournaments).orderBy(desc(s.tournaments.startDate)).limit(100);
  return (
    <>
      <h1>Märkte verwalten</h1>
      {sp.error ? <div className="card error">{sp.error}</div> : null}
      <h2>Offene und gesperrte Märkte</h2>
      {markets.map(async (m) => {
        const outcomes = await db().select().from(s.marketOutcomes).where(eq(s.marketOutcomes.marketId, m.id));
        return (
          <div key={m.id} className={`card ${m.status === "settlement_blocked" ? "notice" : ""}`}>
            <strong>{m.question}</strong> {m.isDemo ? <span className="badge b-demo">Demo</span> : null}
            <div className="small muted">{STATUS_LABEL[m.status]} · {MODE_LABEL[m.settlementMode]} · schliesst {fmtDate(m.closesAt)}</div>
            {m.blockedReason ? <div className="small">Grund: {m.blockedReason}</div> : null}
            <form action={settleManuallyAction} className="inline" style={{ marginTop: 6 }}>
              <input type="hidden" name="marketId" value={m.id} />
              <select name="outcomeId">{outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
              <input name="sourceUrl" type="url" placeholder="Quell-URL (Pflicht)" />
              <input name="note" placeholder="Begründung" required />
              <button type="submit">Manuell abrechnen</button>
              <button type="submit" name="void" value="1" className="secondary">Annullieren (alle Einsätze zurück)</button>
            </form>
          </div>
        );
      })}
      <h2>Neuen Markt anlegen</h2>
      <form action={createMarketAction} className="card stack">
        <label htmlFor="question">Frage</label>
        <input id="question" name="question" required />
        <label htmlFor="dataRequirement">Benötigte Daten</label>
        <select id="dataRequirement" name="dataRequirement">
          <option value="match_winner">Match-Sieger (automatisch abrechenbar)</option>
          <option value="tournament_winner">Turniersieger (automatisch abrechenbar)</option>
          <option value="cashout_stat">Cashout-Statistik (keine zuverlässige Quelle)</option>
          <option value="round_event">Rundenereignis (keine zuverlässige Quelle)</option>
          <option value="custom">Sonstiges (nur manuell)</option>
        </select>
        <label htmlFor="matchId">Match (optional)</label>
        <select id="matchId" name="matchId"><option value="">–</option>{matches.map((m) => <option key={m.id} value={m.id}>{fmtDate(m.at)} {m.label ?? m.id.slice(0, 8)}</option>)}</select>
        <label htmlFor="tournamentId">Turnier (optional)</label>
        <select id="tournamentId" name="tournamentId"><option value="">–</option>{tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <label htmlFor="closesAt">Schliesst (UTC)</label>
        <input id="closesAt" name="closesAt" type="datetime-local" required />
        <label htmlFor="outcomes">Optionen (eine pro Zeile; leer = Teams des Matches/Turniers)</label>
        <textarea id="outcomes" name="outcomes" rows={3} />
        <button type="submit">Markt anlegen</button>
      </form>
    </>
  );
}
