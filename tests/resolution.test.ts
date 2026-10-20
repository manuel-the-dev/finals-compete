import { describe, expect, it } from "vitest";
import { resolveResult, type ClaimInput } from "@/domain/resolution";

const t = (h: number) => new Date(Date.UTC(2026, 9, 20, h));
const claim = (p: Partial<ClaimInput> & Pick<ClaimInput, "id" | "source" | "verification" | "winnerTeamId">): ClaimInput => ({ claimedAt: t(10), ...p });

describe("resolveResult", () => {
  it("has no result without claims", () => {
    expect(resolveResult([]).status).toBe("none");
  });

  it("verifies a single database claim", () => {
    const r = resolveResult([claim({ id: "1", source: "liquipedia", verification: "database", winnerTeamId: "A" })]);
    expect(r).toMatchObject({ status: "verified", winnerTeamId: "A", verification: "database" });
  });

  it("never verifies from team or community claims alone", () => {
    const r = resolveResult([claim({ id: "1", source: "x", verification: "team_claim", winnerTeamId: "A" })]);
    expect(r.status).toBe("provisional");
  });

  it("flags a blocking conflict when official and database disagree", () => {
    const r = resolveResult([
      claim({ id: "1", source: "faceit", verification: "official", winnerTeamId: "A" }),
      claim({ id: "2", source: "liquipedia", verification: "database", winnerTeamId: "B" }),
    ]);
    expect(r.status).toBe("conflict");
    expect(r.winnerTeamId).toBeNull();
    expect(r.conflicts[0].severity).toBe("blocking");
  });

  it("treats a newer claim from the same source as a correction", () => {
    const r = resolveResult([
      claim({ id: "old", source: "liquipedia", verification: "database", winnerTeamId: "A", claimedAt: t(10) }),
      claim({ id: "new", source: "liquipedia", verification: "database", winnerTeamId: "B", claimedAt: t(12) }),
    ]);
    expect(r).toMatchObject({ status: "verified", winnerTeamId: "B" });
    expect(r.supersededClaimIds).toEqual(["old"]);
  });

  it("blocks when a team claim contradicts the verified result", () => {
    const r = resolveResult([
      claim({ id: "1", source: "liquipedia", verification: "database", winnerTeamId: "A" }),
      claim({ id: "2", source: "manual-team", verification: "team_claim", winnerTeamId: "B" }),
    ]);
    expect(r.status).toBe("conflict");
  });

  it("only warns when a community report contradicts", () => {
    const r = resolveResult([
      claim({ id: "1", source: "faceit", verification: "official", winnerTeamId: "A" }),
      claim({ id: "2", source: "reddit", verification: "unverified", winnerTeamId: "B" }),
    ]);
    expect(r.status).toBe("verified");
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].severity).toBe("warning");
  });

  it("lets a manual admin decision override conflicts", () => {
    const r = resolveResult([
      claim({ id: "1", source: "faceit", verification: "official", winnerTeamId: "A" }),
      claim({ id: "2", source: "liquipedia", verification: "database", winnerTeamId: "B" }),
      claim({ id: "3", source: "manual", verification: "manual", winnerTeamId: "B" }),
    ]);
    expect(r).toMatchObject({ status: "verified", winnerTeamId: "B", verification: "manual" });
  });

  it("compares placements, not just winners", () => {
    const r = resolveResult([
      claim({ id: "1", source: "faceit", verification: "official", winnerTeamId: "A", placements: [{ teamId: "A", placement: 1, score: null }, { teamId: "B", placement: 2, score: null }] }),
      claim({ id: "2", source: "liquipedia", verification: "database", winnerTeamId: "A", placements: [{ teamId: "A", placement: 1, score: null }, { teamId: "B", placement: 3, score: null }] }),
    ]);
    expect(r.status).toBe("conflict");
  });

  it("keeps demo results labelled as demo", () => {
    const r = resolveResult([claim({ id: "1", source: "demo", verification: "demo", winnerTeamId: "A" })]);
    expect(r).toMatchObject({ status: "verified", verification: "demo" });
  });
});
