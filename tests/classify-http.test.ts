import { describe, expect, it } from "vitest";
import { classifyPost, findTeamMentions } from "@/domain/classify";
import { RequestBudget } from "@/sources/http";
import { BudgetExhaustedError } from "@/sources/types";

describe("classifyPost", () => {
  it.each([
    ["Match postponed to Sunday", "schedule_change"],
    ["Result correction for round 3", "result_correction"],
    ["Team X wins the Grand Final!", "result"],
    ["Welcome our new stand-in", "lineup_change"],
    ["Sign-ups are open, $10,000 prize pool", "tournament_announcement"],
    ["Turnier abgesagt", "cancellation"],
  ])("%s -> %s", (text, type) => expect(classifyPost(text, "x")).toBe(type));
});

describe("findTeamMentions", () => {
  it("matches whole names and aliases only", () => {
    const teams = [
      { id: "1", name: "Team Alpha", aliases: ["alpha"] },
      { id: "2", name: "Bravo", aliases: [] },
    ];
    expect(findTeamMentions("GG to ALPHA and bravo!", teams)).toEqual(["1", "2"]);
    expect(findTeamMentions("alphabet soup", teams)).toEqual([]);
  });
});

describe("RequestBudget", () => {
  it("stops instead of exceeding an hourly budget carried over from earlier runs", async () => {
    let now = 1_000_000;
    const previous = Array.from({ length: 59 }, (_, i) => now - i * 1000);
    const b = new RequestBudget({ limit: 60, windowMs: 3600_000, minIntervalMs: 0, note: "" }, previous, () => now, async () => {});
    await b.acquire();
    await expect(b.acquire()).rejects.toBeInstanceOf(BudgetExhaustedError);
    now += 3600_000;
    await expect(b.acquire()).resolves.toBeUndefined();
  });
});
