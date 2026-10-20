import type { Verification } from "@/db/schema";
import { VERIFICATION_RANK, isAuthoritative } from "./verification";

export type ClaimInput = {
  id: string;
  source: string;
  verification: Verification;
  winnerTeamId: string | null;
  placements?: { teamId: string; placement: number | null; score: string | null }[] | null;
  claimedAt: Date;
  supersededAt?: Date | null;
};

export type ConflictDraft = { severity: "blocking" | "warning"; summary: string; claimIds: string[] };

export type Resolution = {
  status: "none" | "provisional" | "verified" | "conflict";
  winnerTeamId: string | null;
  verification: Verification | null;
  placements: { teamId: string; placement: number | null; score: string | null }[] | null;
  /** Claims superseded by a newer claim from the same source (corrections). */
  supersededClaimIds: string[];
  conflicts: ConflictDraft[];
};

/** Two claims agree when they name the same winner and, where both list placements, the same placements. */
export function claimsAgree(a: ClaimInput, b: ClaimInput): boolean {
  if (a.winnerTeamId !== b.winnerTeamId) return false;
  if (a.placements?.length && b.placements?.length) {
    const map = new Map(a.placements.map((p) => [p.teamId, p.placement]));
    if (a.placements.length !== b.placements.length) return false;
    return b.placements.every((p) => map.get(p.teamId) === p.placement);
  }
  return true;
}

function byRankThenRecency(a: ClaimInput, b: ClaimInput) {
  const r = VERIFICATION_RANK[a.verification] - VERIFICATION_RANK[b.verification];
  return r !== 0 ? r : b.claimedAt.getTime() - a.claimedAt.getTime();
}

/**
 * Turns all result claims for one match into a result status.
 *
 * Rules (documented in docs/DATA_SOURCES.md, "Prioritätsregeln"):
 * 1. A newer claim from the same source replaces that source's older claim (correction).
 * 2. A manual admin decision overrides everything.
 * 3. Only official sources and the tournament database can verify a result.
 * 4. Authoritative sources that disagree -> blocking conflict, no winner.
 * 5. A team/player claim that disagrees with the verified result -> blocking conflict.
 * 6. A community report that disagrees -> warning only.
 * 7. Without an authoritative claim the result is at best "provisional".
 * 8. Demo claims only ever produce a demo result.
 */
export function resolveResult(all: ClaimInput[]): Resolution {
  const active = all.filter((c) => !c.supersededAt);
  const latestPerSource = new Map<string, ClaimInput>();
  const superseded: string[] = [];
  for (const c of [...active].sort((a, b) => b.claimedAt.getTime() - a.claimedAt.getTime())) {
    // Manual claims are kept per claim id so an admin's decision is never "corrected" by another source.
    const key = c.verification === "manual" ? `manual` : `${c.source}:${c.verification}`;
    if (latestPerSource.has(key)) superseded.push(c.id);
    else latestPerSource.set(key, c);
  }
  const claims = [...latestPerSource.values()].sort(byRankThenRecency);
  const base = { supersededClaimIds: superseded, conflicts: [] as ConflictDraft[] };

  if (claims.length === 0) {
    return { ...base, status: "none", winnerTeamId: null, verification: null, placements: null };
  }

  const manual = claims.find((c) => c.verification === "manual");
  if (manual) {
    return {
      ...base,
      status: "verified",
      winnerTeamId: manual.winnerTeamId,
      verification: "manual",
      placements: manual.placements ?? null,
    };
  }

  const authoritative = claims.filter((c) => isAuthoritative(c.verification));
  if (authoritative.length === 0) {
    const real = claims.filter((c) => c.verification !== "demo");
    if (real.length === 0) {
      const demo = claims[0];
      return { ...base, status: "verified", winnerTeamId: demo.winnerTeamId, verification: "demo", placements: demo.placements ?? null };
    }
    const best = real[0];
    const disagreeing = real.filter((c) => !claimsAgree(c, best));
    return {
      ...base,
      status: "provisional",
      winnerTeamId: best.winnerTeamId,
      verification: best.verification,
      placements: best.placements ?? null,
      conflicts: disagreeing.length
        ? [{ severity: "warning", summary: "Unbestätigte Quellen widersprechen sich.", claimIds: [best.id, ...disagreeing.map((c) => c.id)] }]
        : [],
    };
  }

  const best = authoritative[0];
  const authConflict = authoritative.filter((c) => !claimsAgree(c, best));
  if (authConflict.length) {
    return {
      ...base,
      status: "conflict",
      winnerTeamId: null,
      verification: null,
      placements: null,
      conflicts: [
        {
          severity: "blocking",
          summary: `Offizielle Quelle/Turnierdatenbank widersprechen sich (${[best, ...authConflict].map((c) => c.source).join(", ")}).`,
          claimIds: [best.id, ...authConflict.map((c) => c.id)],
        },
      ],
    };
  }

  const conflicts: ConflictDraft[] = [];
  const teamDisagree = claims.filter((c) => c.verification === "team_claim" && !claimsAgree(c, best));
  if (teamDisagree.length) {
    conflicts.push({
      severity: "blocking",
      summary: "Team-/Spielerangabe widerspricht dem bestätigten Ergebnis.",
      claimIds: [best.id, ...teamDisagree.map((c) => c.id)],
    });
  }
  const communityDisagree = claims.filter((c) => c.verification === "unverified" && !claimsAgree(c, best));
  if (communityDisagree.length) {
    conflicts.push({
      severity: "warning",
      summary: "Community-Bericht widerspricht dem bestätigten Ergebnis.",
      claimIds: [best.id, ...communityDisagree.map((c) => c.id)],
    });
  }

  const blocking = conflicts.some((c) => c.severity === "blocking");
  return {
    ...base,
    status: blocking ? "conflict" : "verified",
    winnerTeamId: blocking ? null : best.winnerTeamId,
    verification: blocking ? null : best.verification,
    placements: blocking ? null : (best.placements ?? null),
    conflicts,
  };
}
