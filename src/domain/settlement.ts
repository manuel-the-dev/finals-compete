export type StakeInput = { id: string; userId: string; outcomeId: string; stake: number };
export type Payout = { predictionId: string; userId: string; status: "won" | "lost" | "refunded"; payout: number };

/**
 * Parimutuel payout in virtual coins: winners share the whole pool in
 * proportion to their stake. Fractions are rounded down. If nobody picked
 * the winning outcome, every stake is refunded.
 */
export function computePayouts(stakes: StakeInput[], winningOutcomeId: string): Payout[] {
  const pool = stakes.reduce((s, p) => s + p.stake, 0);
  const winningPool = stakes.filter((p) => p.outcomeId === winningOutcomeId).reduce((s, p) => s + p.stake, 0);
  if (winningPool === 0) {
    return stakes.map((p) => ({ predictionId: p.id, userId: p.userId, status: "refunded", payout: p.stake }));
  }
  return stakes.map((p) =>
    p.outcomeId === winningOutcomeId
      ? { predictionId: p.id, userId: p.userId, status: "won", payout: Math.floor((p.stake * pool) / winningPool) }
      : { predictionId: p.id, userId: p.userId, status: "lost", payout: 0 },
  );
}

export function refundAll(stakes: StakeInput[]): Payout[] {
  return stakes.map((p) => ({ predictionId: p.id, userId: p.userId, status: "refunded", payout: p.stake }));
}

export type AutoSettleInput = {
  settlementMode: "auto" | "manual_only" | "unavailable";
  dataRequirement: "match_winner" | "tournament_winner" | "cashout_stat" | "round_event" | "custom";
  isDemo: boolean;
  /** Result status of the underlying match or tournament winner. */
  resultStatus: "none" | "provisional" | "verified" | "conflict";
  resultVerification: string | null;
  openBlockingConflicts: number;
  needsReview: boolean;
};

/** Decides whether a market may be settled without a human. Returns the reason when it may not. */
export function autoSettleDecision(m: AutoSettleInput): { ok: true } | { ok: false; reason: string; block: boolean } {
  if (m.settlementMode === "unavailable")
    return { ok: false, block: false, reason: "Keine zuverlässige Datenquelle für diesen Markt; automatische Abrechnung deaktiviert." };
  if (m.settlementMode === "manual_only") return { ok: false, block: false, reason: "Nur manuelle Abrechnung erlaubt." };
  if (m.dataRequirement !== "match_winner" && m.dataRequirement !== "tournament_winner")
    return { ok: false, block: false, reason: "Datentyp wird nicht automatisch abgerechnet." };
  if (m.openBlockingConflicts > 0) return { ok: false, block: true, reason: "Widersprüchliche Quellen, manuelle Prüfung nötig." };
  if (m.needsReview) return { ok: false, block: true, reason: "Neue Ergebnismeldung in sozialen Medien wartet auf Prüfung." };
  if (m.resultStatus === "conflict") return { ok: false, block: true, reason: "Ergebnis im Konflikt." };
  if (m.resultStatus !== "verified") return { ok: false, block: false, reason: "Noch kein verifiziertes Ergebnis." };
  if (m.resultVerification === "demo" && !m.isDemo)
    return { ok: false, block: true, reason: "Demo-Ergebnis darf keinen echten Markt abrechnen." };
  if (!m.isDemo && !["official", "database", "manual"].includes(m.resultVerification ?? ""))
    return { ok: false, block: true, reason: "Ergebnis stammt nicht aus einer verifizierten Quelle." };
  return { ok: true };
}
