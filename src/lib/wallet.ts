import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";

export async function balanceOf(db: DB, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${s.walletTransactions.amount}), 0)` })
    .from(s.walletTransactions)
    .where(eq(s.walletTransactions.userId, userId));
  return Number(row.total);
}

/** Places a prediction atomically: market must be open, balance sufficient. Virtual coins only. */
export async function placePrediction(db: DB, userId: string, marketId: string, outcomeId: string, stake: number) {
  if (!Number.isInteger(stake) || stake <= 0) throw new Error("Einsatz muss eine positive ganze Zahl sein.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const [market] = await tx.select().from(s.markets).where(eq(s.markets.id, marketId)).for("update");
    if (!market || market.status !== "open") throw new Error("Markt ist nicht offen.");
    if (market.closesAt.getTime() <= Date.now()) throw new Error("Markt ist bereits geschlossen.");
    const [outcome] = await tx.select().from(s.marketOutcomes).where(eq(s.marketOutcomes.id, outcomeId));
    if (!outcome || outcome.marketId !== marketId) throw new Error("Ungültige Option.");
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${s.walletTransactions.amount}), 0)` })
      .from(s.walletTransactions)
      .where(eq(s.walletTransactions.userId, userId));
    if (Number(row.total) < stake) throw new Error("Nicht genügend virtuelle Coins.");
    const [p] = await tx.insert(s.predictions).values({ marketId, outcomeId, userId, stake }).returning();
    await tx.insert(s.walletTransactions).values({ userId, amount: -stake, kind: "stake", marketId, predictionId: p.id });
    return p;
  });
}
