import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { beforeAll, describe, expect, it } from "vitest";
import { pool, type DB } from "@/db";
import * as s from "@/db/schema";
import { dismissConflict, recomputeMatch, setManualResult } from "@/domain/results-service";
import { EXPORT_TABLES, exportAll, importAll, toCsv } from "@/lib/export";
import { freshDb, testDbUrl } from "./helpers";

const run = testDbUrl() ? describe : describe.skip;

run("settlement, manual review and export/import (integration)", () => {
  let db: DB;
  let admin: typeof s.users.$inferSelect;
  let users: (typeof s.users.$inferSelect)[];
  let teamA: string, teamB: string, matchId: string, marketId: string, outA: string, outB: string;

  beforeAll(async () => {
    db = await freshDb();
    [admin] = await db.insert(s.users).values({ email: "admin@example.test", passwordHash: "x", displayName: "Admin", role: "admin" }).returning();
    users = await db
      .insert(s.users)
      .values([
        { email: "u1@example.test", passwordHash: "x", displayName: "U1" },
        { email: "u2@example.test", passwordHash: "x", displayName: "U2" },
      ])
      .returning();
    for (const u of users) await db.insert(s.walletTransactions).values({ userId: u.id, amount: 1000, kind: "grant" });
    const teams = await db.insert(s.teams).values([{ slug: "a", name: "A" }, { slug: "b", name: "B" }]).returning();
    [teamA, teamB] = teams.map((t) => t.id);
    const [m] = await db.insert(s.matches).values({ scheduledAt: new Date() }).returning();
    matchId = m.id;
    await db.insert(s.matchParticipants).values([{ matchId, teamId: teamA }, { matchId, teamId: teamB }]);
    const [mk] = await db.insert(s.markets).values({ question: "A oder B?", matchId, dataRequirement: "match_winner", settlementMode: "auto", closesAt: new Date() }).returning();
    marketId = mk.id;
    const outs = await db.insert(s.marketOutcomes).values([{ marketId, label: "A", teamId: teamA }, { marketId, label: "B", teamId: teamB }]).returning();
    [outA, outB] = outs.map((o) => o.id);
    const preds = await db
      .insert(s.predictions)
      .values([
        { marketId, outcomeId: outA, userId: users[0].id, stake: 100 },
        { marketId, outcomeId: outB, userId: users[1].id, stake: 300 },
      ])
      .returning();
    for (const p of preds) await db.insert(s.walletTransactions).values({ userId: p.userId, amount: -p.stake, kind: "stake", marketId, predictionId: p.id });
  });

  it("does not settle on a team claim alone", async () => {
    await db.insert(s.resultClaims).values({ matchId, source: "team-post", verification: "team_claim", winnerTeamId: teamB });
    await recomputeMatch(db, matchId, { actorKind: "system" });
    const [m] = await db.select().from(s.markets).where(eq(s.markets.id, marketId));
    expect(m.status).toBe("open");
  });

  it("blocks when the database contradicts the team claim, then settles after admin review", async () => {
    await db.insert(s.resultClaims).values({ matchId, source: "liquipedia", verification: "database", winnerTeamId: teamA });
    await recomputeMatch(db, matchId, { actorKind: "sync" });
    let [m] = await db.select().from(s.markets).where(eq(s.markets.id, marketId));
    expect(m.status).toBe("settlement_blocked");

    const [conflict] = await db.select().from(s.conflicts).where(eq(s.conflicts.status, "open"));
    await dismissConflict(db, conflict.id, admin.id, "Team-Post war veraltet");
    [m] = await db.select().from(s.markets).where(eq(s.markets.id, marketId));
    expect(m.status).toBe("settled");
    expect(m.settledOutcomeId).toBe(outA);

    const balance = async (uid: string) =>
      (await db.select().from(s.walletTransactions).where(eq(s.walletTransactions.userId, uid))).reduce((a, t) => a + t.amount, 0);
    expect(await balance(users[0].id)).toBe(1000 - 100 + 400);
    expect(await balance(users[1].id)).toBe(1000 - 300);
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "market.settled"));
    expect(logs).toHaveLength(1);
  });

  it("requires a source URL for a manual result", async () => {
    await expect(setManualResult(db, matchId, teamA, admin.id, "no-url", "x")).rejects.toThrow();
  });

  it("exports without secrets and re-imports into an empty database with identical ids", async () => {
    const bundle = await exportAll(pool(), { includePersonal: false, appEnv: "test" });
    expect(bundle.tables.users?.[0]).not.toHaveProperty("password_hash");
    expect(bundle.tables.users?.[0]).not.toHaveProperty("email");
    expect(toCsv(bundle.tables.wallet_transactions ?? [])).toContain("amount");

    const target = new URL(testDbUrl()!);
    target.pathname = "/finals_test_restore";
    const restorePool = new Pool({ connectionString: target.toString() });
    await restorePool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
    await migrate(drizzle(restorePool), { migrationsFolder: "drizzle" });
    const client = await restorePool.connect();
    try {
      const counts = await importAll(client, JSON.parse(JSON.stringify(bundle)));
      for (const t of EXPORT_TABLES) expect(counts[t]).toBe(bundle.tables[t]?.length ?? 0);
      const again = await exportAll(client, { includePersonal: false, appEnv: "test" });
      expect(JSON.parse(JSON.stringify(again.tables.markets))).toEqual(JSON.parse(JSON.stringify(bundle.tables.markets)));
      expect(JSON.parse(JSON.stringify(again.tables.wallet_transactions))).toEqual(JSON.parse(JSON.stringify(bundle.tables.wallet_transactions)));
      await expect(importAll(client, JSON.parse(JSON.stringify(bundle)))).rejects.toThrow(/nicht leer/);
    } finally {
      client.release();
      await restorePool.end();
    }
  });
});
