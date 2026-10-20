import { z } from "zod";
import type { FetchContext, NormalizedRecord, SourceAdapter } from "../types";

/**
 * Liquipedia LiquipediaDB (LPDB) API v3.
 *
 * Access rules (https://liquipedia.net/api-terms-of-use, checked 2026-10-20):
 * - API key only after an approved request; never share it.
 * - Max 60 requests per hour; cache results; avoid identical repeated queries.
 * - Content is CC BY-SA 3.0: the site must credit Liquipedia.
 * - Scraping HTML pages is not permitted, so this adapter only uses the API.
 *
 * Endpoint shape (base URL, datapoint names, `Authorization: Apikey <key>`,
 * `{ result: [...] }` response) follows the LPDB v3 documentation available
 * after login. NOT yet verified against the live API from this project,
 * because no key is configured yet. Field parsing is deliberately tolerant.
 */
const BASE = "https://api.liquipedia.net/api/v3";

const str = z.union([z.string(), z.number()]).transform(String);
const optStr = str.nullish();

const Tournament = z
  .object({
    pagename: z.string().min(1),
    name: z.string().min(1),
    startdate: optStr,
    enddate: optStr,
    prizepool: optStr,
    liquipediatier: optStr,
    type: optStr,
    status: optStr,
    organizers: z.unknown().optional(),
    locations: z.unknown().optional(),
    mode: optStr,
  })
  .passthrough();

const Opponent = z
  .object({
    name: z.string().default(""),
    template: optStr,
    score: optStr,
    placement: optStr,
    status: optStr,
  })
  .passthrough();

const Match = z
  .object({
    match2id: z.string().min(1),
    pagename: z.string().nullish(),
    tournament: optStr,
    parent: optStr,
    date: optStr,
    finished: z.union([z.number(), z.string(), z.boolean()]).nullish(),
    winner: optStr,
    match2opponents: z.array(Opponent).default([]),
    section: optStr,
    match2bracketdata: z.unknown().optional(),
  })
  .passthrough();

const Placement = z
  .object({
    pagename: z.string().min(1),
    tournament: optStr,
    opponentname: z.string().min(1),
    placement: optStr,
    opponenttype: optStr,
  })
  .passthrough();

type Raw =
  | { datapoint: "tournament"; item: unknown }
  | { datapoint: "match"; item: unknown }
  | { datapoint: "placement"; item: unknown };

function parseDate(v: string | null | undefined): Date | null {
  if (!v || v.startsWith("0000") || v.startsWith("1970")) return null;
  const d = new Date(v.includes("T") || v.endsWith("Z") ? v : `${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function placementNumber(v: string | null | undefined): number | null {
  const m = /^(\d+)/.exec(v ?? "");
  return m ? Number(m[1]) : null;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const liquipediaAdapter: SourceAdapter<Raw> = {
  id: "liquipedia",
  label: "Liquipedia (LPDB API v3)",
  platform: "liquipedia",
  description: "Turniere, Matches, Resultate und Platzierungen aus dem THE-FINALS-Wiki auf Liquipedia.",
  verification: "database",
  defaultIntervalMinutes: 60,
  rateLimit: { limit: 50, windowMs: 3600_000, minIntervalMs: 2000, note: "Liquipedia erlaubt 60 Requests/Stunde; wir nutzen max. 50 als Sicherheitsmarge." },
  docsUrl: "https://liquipedia.net/api-terms-of-use",
  requiredEnv: ["LIQUIPEDIA_API_KEY", "SOURCE_USER_AGENT"],
  configured(env) {
    const missing = [];
    if (!env.LIQUIPEDIA_API_KEY) missing.push("LIQUIPEDIA_API_KEY");
    if (!env.SOURCE_USER_AGENT) missing.push("SOURCE_USER_AGENT");
    return { ok: missing.length === 0, missing };
  },

  async fetchRaw(ctx: FetchContext) {
    const wiki = ctx.env.LIQUIPEDIA_WIKI;
    const since = new Date(ctx.now.getTime() - 120 * 86400_000);
    const until = new Date(ctx.now.getTime() + 60 * 86400_000);
    const get = async (datapoint: string, params: Record<string, string>) => {
      const qs = new URLSearchParams({ wiki, limit: "500", ...params });
      const res = await ctx.http(`${BASE}/${datapoint}?${qs}`, {
        headers: { Authorization: `Apikey ${ctx.env.LIQUIPEDIA_API_KEY}`, Accept: "application/json" },
      });
      const body = (await res.json()) as { result?: unknown[]; error?: unknown; warning?: unknown };
      if (body.error && (!Array.isArray(body.error) || body.error.length)) ctx.warn(`Liquipedia ${datapoint}: ${JSON.stringify(body.error).slice(0, 200)}`);
      if (body.warning && (!Array.isArray(body.warning) || body.warning.length)) ctx.warn(`Liquipedia ${datapoint}: ${JSON.stringify(body.warning).slice(0, 200)}`);
      return Array.isArray(body.result) ? body.result : [];
    };

    // Three queries per run keeps us far below the hourly budget.
    const tournaments = await get("tournament", {
      conditions: `[[enddate::>${isoDay(since)}]]`,
      order: "startdate DESC",
    });
    const matches = await get("match", {
      conditions: `[[date::>${isoDay(since)}]] AND [[date::<${isoDay(until)}]]`,
      order: "date ASC",
    });
    const placements = await get("placement", {
      conditions: `[[date::>${isoDay(since)}]]`,
    });
    return [
      ...tournaments.map((item) => ({ datapoint: "tournament" as const, item })),
      ...matches.map((item) => ({ datapoint: "match" as const, item })),
      ...placements.map((item) => ({ datapoint: "placement" as const, item })),
    ];
  },

  normalize(raw, ctx): NormalizedRecord[] {
    const wikiUrl = (page: string) => `https://liquipedia.net/${ctx.env.LIQUIPEDIA_WIKI}/${encodeURIComponent(page.replace(/ /g, "_")).replace(/%2F/g, "/")}`;
    if (raw.datapoint === "tournament") {
      const t = Tournament.parse(raw.item);
      const start = parseDate(t.startdate);
      const end = parseDate(t.enddate);
      const now = ctx.now.getTime();
      const status =
        t.status?.toLowerCase() === "cancelled"
          ? "cancelled"
          : end && end.getTime() < now
            ? "completed"
            : start && start.getTime() <= now
              ? "ongoing"
              : "upcoming";
      return [
        {
          kind: "tournament",
          externalId: t.pagename,
          url: wikiUrl(t.pagename),
          name: t.name,
          tier: t.liquipediatier ?? null,
          format: t.mode ?? t.type ?? null,
          startDate: start,
          endDate: end,
          prizePool: t.prizepool && t.prizepool !== "0" ? `${t.prizepool} USD` : null,
          status,
        },
      ];
    }
    if (raw.datapoint === "match") {
      const m = Match.parse(raw.item);
      const opponents = m.match2opponents.filter((o) => o.name && o.name.toUpperCase() !== "TBD");
      const finished = m.finished === true || m.finished === 1 || m.finished === "1";
      const winnerIdx = m.winner ? Number(m.winner) - 1 : -1;
      const hasPlacements = opponents.some((o) => placementNumber(o.placement) !== null);
      return [
        {
          kind: "match",
          externalId: m.match2id,
          url: m.pagename ? wikiUrl(m.pagename) : undefined,
          tournamentExternalId: m.parent ?? m.pagename ?? null,
          stage: m.section ?? null,
          scheduledAt: parseDate(m.date),
          status: finished ? "completed" : "scheduled",
          teams: opponents.map((o) => ({ name: o.name })),
          result: finished
            ? {
                winnerName: winnerIdx >= 0 ? (m.match2opponents[winnerIdx]?.name ?? null) : null,
                placements: hasPlacements
                  ? opponents.map((o) => ({ name: o.name, placement: placementNumber(o.placement), score: o.score ?? null }))
                  : undefined,
                // LPDB scores are match scores; they are not treated as documented cashout values.
                cashoutsDocumented: false,
              }
            : null,
        },
      ];
    }
    const p = Placement.parse(raw.item);
    return [
      {
        kind: "placement",
        externalId: `${p.pagename}#${p.opponentname}`,
        url: wikiUrl(p.pagename),
        tournamentExternalId: p.pagename,
        teamName: p.opponentname,
        placement: placementNumber(p.placement),
      },
    ];
  },
};
