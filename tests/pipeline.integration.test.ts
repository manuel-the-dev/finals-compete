import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { liquipediaAdapter } from "@/sources/adapters/liquipedia";
import { faceitAdapter } from "@/sources/adapters/faceit";
import { youtubeAdapter } from "@/sources/adapters/youtube";
import { xAdapter } from "@/sources/adapters/x";
import { runSync } from "@/sources/pipeline";
import { fakeFetch, freshDb, testDbUrl } from "./helpers";

/*
 * SYNTHETIC FIXTURES. These payloads imitate the documented response shapes so
 * the pipeline can be tested without network access. They are NOT real
 * Liquipedia/FACEIT/YouTube data and say nothing about what the live APIs return.
 */
const MATCH_TIME = "2026-10-18 18:00:00";
const lpdb = {
  "/api/v3/tournament": {
    result: [{ pagename: "Synthetic_Cup/2026", name: "Synthetic Cup 2026", startdate: "2026-10-17", enddate: "2026-10-19", liquipediatier: "3", prizepool: "1000" }],
  },
  "/api/v3/match": {
    result: [
      {
        match2id: "SYN_R01-M001",
        pagename: "Synthetic_Cup/2026",
        parent: "Synthetic_Cup/2026",
        date: MATCH_TIME,
        finished: 1,
        winner: "1",
        match2opponents: [
          { name: "Test Team One", score: "2", placement: "1" },
          { name: "Test Team Two", score: "1", placement: "2" },
        ],
      },
    ],
  },
  "/api/v3/placement": { result: [{ pagename: "Synthetic_Cup/2026", opponentname: "Test Team One", placement: "1" }] },
};

const run = testDbUrl() ? describe : describe.skip;

run("import pipeline (integration, synthetic fixtures)", () => {
  let db: DB;
  beforeAll(async () => {
    db = await freshDb();
    process.env.LIQUIPEDIA_API_KEY = "test-key";
    process.env.SOURCE_USER_AGENT = "FINALS-COMPETE-tests";
    process.env.FACEIT_API_KEY = "test-key";
    process.env.FACEIT_CHAMPIONSHIP_IDS = "champ-1:official";
    process.env.YOUTUBE_CHANNELS = "UCsynthetic:official:Synthetic Channel";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
  });

  it("imports Liquipedia data with provenance and verifies the result", async () => {
    const calls: string[] = [];
    const sum = await runSync(db, env(), liquipediaAdapter, { trigger: "test", fetchImpl: fakeFetch(lpdb, calls), noWait: true });
    expect(sum.status).toBe("success");
    expect(sum.requests).toBe(3);
    expect(calls.every((c) => c.startsWith("https://api.liquipedia.net/api/v3/"))).toBe(true);

    const [match] = await db.select().from(s.matches);
    expect(match).toMatchObject({ resultStatus: "verified", resultVerification: "database" });
    const recs = await db.select().from(s.sourceRecords).where(eq(s.sourceRecords.entityType, "match"));
    expect(recs[0]).toMatchObject({ source: "liquipedia", externalId: "SYN_R01-M001", verification: "database" });
    expect(recs[0].url).toBe("https://liquipedia.net/thefinals/Synthetic_Cup/2026");
    const [ds] = await db.select().from(s.dataSources).where(eq(s.dataSources.id, "liquipedia"));
    expect(ds.lastSuccessAt).not.toBeNull();
    expect(ds.requestLog).toHaveLength(3);
  });

  it("detects unchanged data on the next run", async () => {
    const sum = await runSync(db, env(), liquipediaAdapter, { trigger: "test", fetchImpl: fakeFetch(lpdb), noWait: true });
    expect(sum.created + sum.updated).toBe(0);
    expect(sum.unchanged).toBeGreaterThan(0);
    expect(await db.select().from(s.matches)).toHaveLength(1);
  });

  it("links the same match from FACEIT instead of duplicating it, and blocks settlement on disagreement", async () => {
    const [match] = await db.select().from(s.matches);
    const parts = await db.select().from(s.matchParticipants).where(eq(s.matchParticipants.matchId, match.id));
    const [market] = await db
      .insert(s.markets)
      .values({ question: "Wer gewinnt?", matchId: match.id, dataRequirement: "match_winner", settlementMode: "auto", closesAt: new Date(MATCH_TIME + "Z") })
      .returning();
    for (const p of parts) await db.insert(s.marketOutcomes).values({ marketId: market.id, label: p.teamId, teamId: p.teamId });

    const faceit = {
      "/championships/champ-1/matches": {
        items: [
          {
            match_id: "1-synthetic",
            status: "FINISHED",
            scheduled_at: Date.parse(MATCH_TIME + "Z") / 1000,
            teams: { faction1: { name: "Test Team One" }, faction2: { name: "Test Team Two" } },
            results: { winner: "faction2", score: { faction1: 1, faction2: 2 } },
          },
        ],
      },
      "/championships/champ-1": { championship_id: "champ-1", name: "Synthetic FACEIT Cup", status: "finished" },
    };
    const sum = await runSync(db, env(), faceitAdapter, { trigger: "test", fetchImpl: fakeFetch(faceit), noWait: true });
    expect(sum.errors).toEqual([]);
    expect(await db.select().from(s.matches)).toHaveLength(1);

    const [after] = await db.select().from(s.matches);
    expect(after.resultStatus).toBe("conflict");
    const conflicts = await db.select().from(s.conflicts);
    expect(conflicts.some((c) => c.severity === "blocking" && c.status === "open")).toBe(true);
    const [m] = await db.select().from(s.markets).where(eq(s.markets.id, market.id));
    expect(m.status).toBe("settlement_blocked");
  });

  it("stores social posts with metadata but never as results", async () => {
    const feed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
      <title>Synthetic Channel</title>
      <entry><id>yt:video:SYNTH1</id><yt:videoId>SYNTH1</yt:videoId><title>Test Team One wins vs Test Team Two</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=SYNTH1"/><published>2026-10-18T20:00:00+00:00</published>
      <media:group><media:description>Synthetic</media:description></media:group></entry></feed>`;
    const sum = await runSync(db, env(), youtubeAdapter, { trigger: "test", fetchImpl: fakeFetch({ "feeds/videos.xml": feed }), noWait: true });
    expect(sum.created).toBe(1);
    const [post] = await db.select().from(s.socialPosts);
    expect(post).toMatchObject({ platform: "youtube", infoType: "result", verification: "official", url: "https://www.youtube.com/watch?v=SYNTH1" });
    expect(post.teamIds).toHaveLength(2);
    expect(post.matchId).not.toBeNull();
    const claims = await db.select().from(s.resultClaims).where(eq(s.resultClaims.source, "youtube"));
    expect(claims).toHaveLength(0);
    const [match] = await db.select().from(s.matches);
    expect(match.needsReview).toBe(true);
  });

  it("skips sources that are not configured and records why", async () => {
    const sum = await runSync(db, env(), xAdapter, { trigger: "test", fetchImpl: fakeFetch({}), noWait: true });
    expect(sum.status).toBe("skipped");
    expect(sum.warnings[0]).toContain("X_BEARER_TOKEN");
  });

  it("logs a failed run without touching existing data", async () => {
    const sum = await runSync(db, env(), liquipediaAdapter, {
      trigger: "test",
      fetchImpl: fakeFetch({ "/api/v3/": new Response("boom", { status: 500 }) }),
      noWait: true,
    });
    expect(sum.status).toBe("failed");
    const [ds] = await db.select().from(s.dataSources).where(eq(s.dataSources.id, "liquipedia"));
    expect(ds.lastFailureAt).not.toBeNull();
    expect(await db.select().from(s.matches)).toHaveLength(1);
  });
});
