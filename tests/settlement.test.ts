import { describe, expect, it } from "vitest";
import { autoSettleDecision, computePayouts, type AutoSettleInput } from "@/domain/settlement";

describe("computePayouts", () => {
  it("splits the pool among winners proportionally", () => {
    const p = computePayouts(
      [
        { id: "a", userId: "u1", outcomeId: "X", stake: 100 },
        { id: "b", userId: "u2", outcomeId: "X", stake: 300 },
        { id: "c", userId: "u3", outcomeId: "Y", stake: 600 },
      ],
      "X",
    );
    expect(p.map((x) => x.payout)).toEqual([250, 750, 0]);
  });

  it("refunds everyone when nobody picked the winner", () => {
    const p = computePayouts([{ id: "a", userId: "u1", outcomeId: "Y", stake: 50 }], "X");
    expect(p[0]).toMatchObject({ status: "refunded", payout: 50 });
  });
});

const base: AutoSettleInput = {
  settlementMode: "auto",
  dataRequirement: "match_winner",
  isDemo: false,
  resultStatus: "verified",
  resultVerification: "database",
  openBlockingConflicts: 0,
  needsReview: false,
};

describe("autoSettleDecision", () => {
  it("allows a verified database result", () => expect(autoSettleDecision(base).ok).toBe(true));
  it("blocks on open conflicts", () => expect(autoSettleDecision({ ...base, openBlockingConflicts: 1 })).toMatchObject({ ok: false, block: true }));
  it("blocks while a social post waits for review", () => expect(autoSettleDecision({ ...base, needsReview: true }).ok).toBe(false));
  it("never auto-settles cashout markets", () =>
    expect(autoSettleDecision({ ...base, dataRequirement: "cashout_stat", settlementMode: "unavailable" }).ok).toBe(false));
  it("waits for provisional results", () => expect(autoSettleDecision({ ...base, resultStatus: "provisional" })).toMatchObject({ ok: false, block: false }));
  it("never settles a real market from demo data", () =>
    expect(autoSettleDecision({ ...base, resultVerification: "demo" })).toMatchObject({ ok: false, block: true }));
  it("does not accept team claims for real markets", () =>
    expect(autoSettleDecision({ ...base, resultVerification: "team_claim" }).ok).toBe(false));
});
