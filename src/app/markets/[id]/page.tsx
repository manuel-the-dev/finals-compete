import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { balanceOf } from "@/lib/wallet";
import { predictAction } from "../../actions";
import { MODE_LABEL, STATUS_LABEL } from "@/components/labels";

export default async function MarketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [m] = await db().select().from(s.markets).where(eq(s.markets.id, id));
  if (!m) notFound();
  const outcomes = await db()
    .select({ o: s.marketOutcomes, pool: sql<string>`coalesce(sum(${s.predictions.stake}), 0)` })
    .from(s.marketOutcomes)
    .leftJoin(s.predictions, eq(s.predictions.outcomeId, s.marketOutcomes.id))
    .where(eq(s.marketOutcomes.marketId, id))
    .groupBy(s.marketOutcomes.id);
  const total = outcomes.reduce((a, o) => a + Number(o.pool), 0);
  const user = await currentUser();
  const mine = user ? await db().select().from(s.predictions).where(and(eq(s.predictions.marketId, id), eq(s.predictions.userId, user.id))) : [];
  const balance = user ? await balanceOf(db(), user.id) : 0;
  const open = m.status === "open" && m.closesAt > new Date();
  return (
    <>
      <h1>{m.question} {m.isDemo ? <span className="badge b-demo">Demo</span> : null}</h1>
      <p className="muted">
        {STATUS_LABEL[m.status]} · schliesst {fmtDate(m.closesAt)} · {MODE_LABEL[m.settlementMode]}
        {m.matchId ? <> · <Link href={`/matches/${m.matchId}`}>zum Match</Link></> : null}
      </p>
      {m.blockedReason ? <div className="card notice">Abrechnung gesperrt: {m.blockedReason}</div> : null}
      {m.status === "settled" ? (
        <div className="card">
          Abgerechnet am {fmtDate(m.settledAt)}. {m.settlementNote}{" "}
          {m.settlementSourceUrl ? <a href={m.settlementSourceUrl} rel="noopener noreferrer">Quelle</a> : null}
        </div>
      ) : null}
      {sp.error ? <div className="card error">{sp.error}</div> : null}
      {sp.ok ? <div className="card">Tipp gespeichert.</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Option</th><th>Pool</th><th>Anteil</th></tr></thead>
          <tbody>
            {outcomes.map(({ o, pool }) => (
              <tr key={o.id}>
                <td>{o.label} {m.settledOutcomeId === o.id ? <span className="badge b-official">Gewinner</span> : null}</td>
                <td>{Number(pool)}</td>
                <td>{total ? Math.round((Number(pool) / total) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {user && open ? (
        <form action={predictAction} className="card stack">
          <input type="hidden" name="marketId" value={m.id} />
          <label htmlFor="outcomeId">Option</label>
          <select id="outcomeId" name="outcomeId" required>
            {outcomes.map(({ o }) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <label htmlFor="stake">Einsatz (Guthaben: {balance} Coins)</label>
          <input id="stake" name="stake" type="number" min={1} max={balance} required />
          <button type="submit">Tipp abgeben</button>
        </form>
      ) : !user ? <p><Link href="/login">Einloggen</Link>, um zu tippen.</p> : null}
      {mine.length ? (
        <>
          <h2>Deine Tipps</h2>
          <ul>{mine.map((p) => <li key={p.id}>{outcomes.find((o) => o.o.id === p.outcomeId)?.o.label}: {p.stake} Coins · {{ open: "offen", won: "gewonnen", lost: "verloren", refunded: "zurückerstattet" }[p.status]}{p.payout ? ` · Auszahlung ${p.payout}` : ""}</li>)}</ul>
        </>
      ) : null}
    </>
  );
}
