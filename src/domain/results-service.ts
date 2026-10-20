import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import type { Verification } from "@/db/schema";
import { resolveResult, type ClaimInput } from "./resolution";
import { autoSettleDecision, computePayouts, refundAll, type Payout } from "./settlement";
import { VERIFICATION_RANK, isAuthoritative } from "./verification";

type Actor = { actorKind: "sync" | "admin" | "system"; userId?: string | null };

/** Re-derives a match's result from all claims, records conflicts and tries automatic settlement. */
export async function recomputeMatch(db: DB, matchId: string, actor: Actor) {
  const claims = await db.select().from(s.resultClaims).where(eq(s.resultClaims.matchId, matchId));
  const inputs: ClaimInput[] = claims.map((c) => ({
    id: c.id,
    source: c.source,
    verification: c.verification,
    winnerTeamId: c.winnerTeamId,
    placements: c.placements,
    claimedAt: c.claimedAt,
    supersededAt: c.supersededAt,
  }));
  const res = resolveResult(inputs);

  if (res.supersededClaimIds.length) {
    await db.update(s.resultClaims).set({ supersededAt: new Date() }).where(inArray(s.resultClaims.id, res.supersededClaimIds));
  }

  const [before] = await db.select().from(s.matches).where(eq(s.matches.id, matchId));
  await db
    .update(s.matches)
    .set({
      resultStatus: res.status,
      winnerTeamId: res.winnerTeamId,
      resultVerification: res.verification,
      resultResolvedAt: new Date(),
      ...(res.status === "verified" ? { status: "completed" as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(s.matches.id, matchId));

  await db.update(s.matchParticipants).set({ placement: null, score: null }).where(eq(s.matchParticipants.matchId, matchId));
  if (res.status === "verified" && res.placements) {
    for (const p of res.placements) {
      await db
        .update(s.matchParticipants)
        .set({ placement: p.placement, score: p.score })
        .where(and(eq(s.matchParticipants.matchId, matchId), eq(s.matchParticipants.teamId, p.teamId)));
    }
  }

  // Record new conflicts (one conflict per distinct claim set, also if it was already handled).
  const open = await db
    .select()
    .from(s.conflicts)
    .where(and(eq(s.conflicts.entityType, "match"), eq(s.conflicts.entityId, matchId)));
  for (const c of res.conflicts) {
    const key = [...c.claimIds].sort().join(",");
    if (open.some((o) => [...o.claimIds].sort().join(",") === key)) continue;
    await db.insert(s.conflicts).values({
      entityType: "match",
      entityId: matchId,
      field: "result",
      severity: c.severity,
      summary: c.summary,
      claimIds: c.claimIds,
    });
  }

  if (before && (before.resultStatus !== res.status || before.winnerTeamId !== res.winnerTeamId)) {
    await db.insert(s.auditLogs).values({
      actorKind: actor.actorKind,
      actorUserId: actor.userId ?? null,
      action: "match.result_recomputed",
      entityType: "match",
      entityId: matchId,
      details: { from: { status: before.resultStatus, winner: before.winnerTeamId }, to: { status: res.status, winner: res.winnerTeamId } },
    });
  }

  const markets = await db.select({ id: s.markets.id }).from(s.markets).where(and(eq(s.markets.matchId, matchId), inArray(s.markets.status, ["open", "locked", "settlement_blocked"])));
  for (const m of markets) await tryAutoSettle(db, m.id);
  return res;
}

/**
 * Applies tournament placements reported by authoritative sources. Disagreeing
 * placements for the same team become a blocking conflict on the tournament.
 */
export async function recomputeTournamentPlacements(db: DB, tournamentId: string) {
  const rows = await db.execute<{ team_id: string; placement: number | null; verification: Verification; source: string }>(sql`
    SELECT p.entity_id AS team_id, (p.raw->>'placement')::int AS placement, p.verification, p.source
    FROM source_records p
    JOIN source_records t
      ON t.source = p.source AND t.entity_type = 'tournament' AND t.external_id = p.raw->>'tournamentExternalId'
    WHERE p.entity_type = 'placement' AND t.entity_id = ${tournamentId}
  `);
  const byTeam = new Map<string, { placement: number | null; verification: Verification; source: string }[]>();
  for (const r of rows.rows) byTeam.set(r.team_id, [...(byTeam.get(r.team_id) ?? []), r]);

  for (const [teamId, list] of byTeam) {
    const auth = list.filter((l) => isAuthoritative(l.verification)).sort((a, b) => VERIFICATION_RANK[a.verification] - VERIFICATION_RANK[b.verification]);
    const distinct = new Set(auth.map((a) => a.placement));
    if (distinct.size > 1) {
      const summary = `Platzierung widersprüchlich für Team ${teamId}: ${auth.map((a) => `${a.source}=${a.placement}`).join(", ")}`;
      const [exists] = await db
        .select({ id: s.conflicts.id, status: s.conflicts.status })
        .from(s.conflicts)
        .where(and(eq(s.conflicts.entityType, "tournament"), eq(s.conflicts.entityId, tournamentId), eq(s.conflicts.summary, summary)));
      if (!exists) await db.insert(s.conflicts).values({ entityType: "tournament", entityId: tournamentId, field: "placement", severity: "blocking", summary });
      // Until an admin has looked at the conflict, no placement is shown. After dismissal the most trusted source wins.
      if (!exists || exists.status === "open") {
        await db
          .update(s.tournamentParticipants)
          .set({ placement: null, placementVerification: null })
          .where(and(eq(s.tournamentParticipants.tournamentId, tournamentId), eq(s.tournamentParticipants.teamId, teamId)));
        continue;
      }
    }
    const best = auth[0] ?? list[0];
    await db
      .update(s.tournamentParticipants)
      .set({ placement: best.placement, placementVerification: best.verification })
      .where(and(eq(s.tournamentParticipants.tournamentId, tournamentId), eq(s.tournamentParticipants.teamId, teamId)));
  }

  const markets = await db
    .select({ id: s.markets.id })
    .from(s.markets)
    .where(and(eq(s.markets.tournamentId, tournamentId), inArray(s.markets.status, ["open", "locked", "settlement_blocked"])));
  for (const m of markets) await tryAutoSettle(db, m.id);
}

async function marketState(db: DB, marketId: string) {
  const [market] = await db.select().from(s.markets).where(eq(s.markets.id, marketId));
  if (!market) throw new Error("Markt nicht gefunden");
  const outcomes = await db.select().from(s.marketOutcomes).where(eq(s.marketOutcomes.marketId, marketId));

  let resultStatus: "none" | "provisional" | "verified" | "conflict" = "none";
  let resultVerification: string | null = null;
  let winnerTeamId: string | null = null;
  let needsReview = false;
  let openBlockingConflicts = 0;

  if (market.dataRequirement === "match_winner" && market.matchId) {
    const [m] = await db.select().from(s.matches).where(eq(s.matches.id, market.matchId));
    resultStatus = m.resultStatus;
    resultVerification = m.resultVerification;
    winnerTeamId = m.winnerTeamId;
    needsReview = m.needsReview;
    openBlockingConflicts = (
      await db
        .select({ id: s.conflicts.id })
        .from(s.conflicts)
        .where(and(eq(s.conflicts.entityType, "match"), eq(s.conflicts.entityId, m.id), eq(s.conflicts.status, "open"), eq(s.conflicts.severity, "blocking")))
    ).length;
  } else if (market.dataRequirement === "tournament_winner" && market.tournamentId) {
    const [t] = await db.select().from(s.tournaments).where(eq(s.tournaments.id, market.tournamentId));
    const [first] = await db
      .select()
      .from(s.tournamentParticipants)
      .where(and(eq(s.tournamentParticipants.tournamentId, market.tournamentId), eq(s.tournamentParticipants.placement, 1)));
    openBlockingConflicts = (
      await db
        .select({ id: s.conflicts.id })
        .from(s.conflicts)
        .where(and(eq(s.conflicts.entityType, "tournament"), eq(s.conflicts.entityId, market.tournamentId), eq(s.conflicts.status, "open"), eq(s.conflicts.severity, "blocking")))
    ).length;
    if (t?.status === "completed" && first && first.placementVerification) {
      resultVerification = first.placementVerification;
      resultStatus = isAuthoritative(first.placementVerification) || first.placementVerification === "manual" || first.placementVerification === "demo" ? "verified" : "provisional";
      winnerTeamId = first.teamId;
    }
  }
  return { market, outcomes, resultStatus, resultVerification, winnerTeamId, needsReview, openBlockingConflicts };
}

/** Settles a market automatically if, and only if, all safety rules allow it. */
export async function tryAutoSettle(db: DB, marketId: string) {
  const st = await marketState(db, marketId);
  const decision = autoSettleDecision({
    settlementMode: st.market.settlementMode,
    dataRequirement: st.market.dataRequirement,
    isDemo: st.market.isDemo,
    resultStatus: st.resultStatus,
    resultVerification: st.resultVerification,
    openBlockingConflicts: st.openBlockingConflicts,
    needsReview: st.needsReview,
  });
  if (!decision.ok) {
    if (decision.block && st.market.status !== "settlement_blocked") {
      await db.update(s.markets).set({ status: "settlement_blocked", blockedReason: decision.reason }).where(eq(s.markets.id, marketId));
      await db.insert(s.auditLogs).values({ actorKind: "system", action: "market.settlement_blocked", entityType: "market", entityId: marketId, details: { reason: decision.reason } });
    }
    return { settled: false, reason: decision.reason };
  }
  const outcome = st.outcomes.find((o) => o.teamId && o.teamId === st.winnerTeamId);
  if (!outcome) {
    await db.update(s.markets).set({ status: "settlement_blocked", blockedReason: "Gewinner ist keine Option dieses Marktes." }).where(eq(s.markets.id, marketId));
    return { settled: false, reason: "Gewinner ist keine Option dieses Marktes." };
  }
  await settleMarket(db, marketId, outcome.id, { actorKind: "system", note: `Automatisch abgerechnet (Quelle: ${st.resultVerification}).` });
  return { settled: true };
}

/** Pays out a market in one transaction. Used by auto-settlement and by admins. */
export async function settleMarket(
  db: DB,
  marketId: string,
  outcomeId: string | null,
  opts: { actorKind: "system" | "admin"; userId?: string; note?: string; sourceUrl?: string; void?: boolean },
) {
  return db.transaction(async (tx) => {
    const [market] = await tx.select().from(s.markets).where(eq(s.markets.id, marketId)).for("update");
    if (!market) throw new Error("Markt nicht gefunden");
    if (market.status === "settled" || market.status === "voided") throw new Error("Markt ist bereits abgeschlossen");
    const preds = await tx.select().from(s.predictions).where(eq(s.predictions.marketId, marketId));
    const stakes = preds.map((p) => ({ id: p.id, userId: p.userId, outcomeId: p.outcomeId, stake: p.stake }));
    const payouts: Payout[] = opts.void || !outcomeId ? refundAll(stakes) : computePayouts(stakes, outcomeId);

    for (const p of payouts) {
      await tx.update(s.predictions).set({ status: p.status, payout: p.payout }).where(eq(s.predictions.id, p.predictionId));
      if (p.payout > 0) {
        await tx.insert(s.walletTransactions).values({
          userId: p.userId,
          amount: p.payout,
          kind: p.status === "refunded" ? "refund" : "payout",
          marketId,
          predictionId: p.predictionId,
        });
      }
    }
    await tx
      .update(s.markets)
      .set({
        status: opts.void ? "voided" : "settled",
        settledOutcomeId: opts.void ? null : outcomeId,
        settledAt: new Date(),
        settledByUserId: opts.userId ?? null,
        settlementNote: opts.note ?? null,
        settlementSourceUrl: opts.sourceUrl ?? null,
        blockedReason: null,
      })
      .where(eq(s.markets.id, marketId));
    await tx.insert(s.auditLogs).values({
      actorKind: opts.actorKind,
      actorUserId: opts.userId ?? null,
      action: opts.void ? "market.voided" : "market.settled",
      entityType: "market",
      entityId: marketId,
      details: { outcomeId, note: opts.note, sourceUrl: opts.sourceUrl, payouts: payouts.length },
    });
    return payouts;
  });
}

/** Admin decision on a match result. Requires a cited source URL. Resolves open conflicts. */
export async function setManualResult(db: DB, matchId: string, winnerTeamId: string, userId: string, sourceUrl: string, note: string) {
  if (!/^https?:\/\//.test(sourceUrl)) throw new Error("Eine Quell-URL ist erforderlich.");
  await db.insert(s.resultClaims).values({ matchId, source: "manual", verification: "manual", winnerTeamId, createdByUserId: userId, note: `${note} (${sourceUrl})` });
  await db
    .update(s.conflicts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedByUserId: userId, resolutionNote: note })
    .where(and(eq(s.conflicts.entityType, "match"), eq(s.conflicts.entityId, matchId), eq(s.conflicts.status, "open")));
  await db.update(s.matches).set({ needsReview: false }).where(eq(s.matches.id, matchId));
  await db.insert(s.auditLogs).values({ actorKind: "admin", actorUserId: userId, action: "match.manual_result", entityType: "match", entityId: matchId, details: { winnerTeamId, sourceUrl, note } });
  await db.update(s.markets).set({ status: "open", blockedReason: null }).where(and(eq(s.markets.matchId, matchId), eq(s.markets.status, "settlement_blocked")));
  return recomputeMatch(db, matchId, { actorKind: "admin", userId });
}

/** Admin confirms that social posts flagged on a match do not change the verified result. */
export async function clearReview(db: DB, matchId: string, userId: string, note: string) {
  await db.update(s.matches).set({ needsReview: false }).where(eq(s.matches.id, matchId));
  await db.update(s.socialPosts).set({ reviewedAt: new Date() }).where(eq(s.socialPosts.matchId, matchId));
  await db.insert(s.auditLogs).values({ actorKind: "admin", actorUserId: userId, action: "match.review_cleared", entityType: "match", entityId: matchId, details: { note } });
  await db.update(s.markets).set({ status: "open", blockedReason: null }).where(and(eq(s.markets.matchId, matchId), eq(s.markets.status, "settlement_blocked")));
  return recomputeMatch(db, matchId, { actorKind: "admin", userId });
}

export async function dismissConflict(db: DB, conflictId: string, userId: string, note: string) {
  const [c] = await db.select().from(s.conflicts).where(eq(s.conflicts.id, conflictId));
  if (!c || c.status !== "open") throw new Error("Konflikt nicht gefunden oder bereits erledigt");
  if (c.entityType === "match" && c.claimIds.length) {
    const claims = await db.select().from(s.resultClaims).where(inArray(s.resultClaims.id, c.claimIds));
    if (claims.filter((cl) => isAuthoritative(cl.verification)).length > 1) {
      throw new Error("Widerspruch zwischen verifizierten Quellen: bitte ein manuelles Ergebnis mit Quellenangabe setzen.");
    }
    // Keep the most trusted claim, set the contradicting lower-ranked claims aside.
    const sorted = [...claims].sort((a, b) => VERIFICATION_RANK[a.verification] - VERIFICATION_RANK[b.verification]);
    const drop = sorted.slice(1).map((cl) => cl.id);
    if (drop.length) await db.update(s.resultClaims).set({ supersededAt: new Date() }).where(inArray(s.resultClaims.id, drop));
  }
  await db
    .update(s.conflicts)
    .set({ status: "dismissed", resolvedAt: new Date(), resolvedByUserId: userId, resolutionNote: note })
    .where(eq(s.conflicts.id, conflictId));
  await db.insert(s.auditLogs).values({ actorKind: "admin", actorUserId: userId, action: "conflict.dismissed", entityType: "conflict", entityId: conflictId, details: { note } });
  if (c.entityType === "match") {
    await db.update(s.markets).set({ status: "open", blockedReason: null }).where(and(eq(s.markets.matchId, c.entityId), eq(s.markets.status, "settlement_blocked")));
    await recomputeMatch(db, c.entityId, { actorKind: "admin", userId });
  } else {
    await db.update(s.markets).set({ status: "open", blockedReason: null }).where(and(eq(s.markets.tournamentId, c.entityId), eq(s.markets.status, "settlement_blocked")));
  }
  return c;
}
