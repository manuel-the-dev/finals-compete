import { z } from "zod";
import { list } from "@/lib/env";
import type { FetchContext, NormalizedRecord, SourceAdapter } from "../types";

/**
 * FACEIT Data API v4 (https://docs.faceit.com/docs/data-api/data).
 * The TGM26 Online Series was announced as hosted on FACEIT. A server-side
 * API key from the FACEIT Developer Portal is required.
 *
 * Endpoint shape is based on the public Data API reference; NOT yet verified
 * from this project (no key, and the dev environment blocks the host).
 * Whether THE FINALS matches on FACEIT expose more than two factions or any
 * cashout statistics is unknown; we only read winner + faction scores.
 *
 * FACEIT_CHAMPIONSHIP_IDS: "id[:official|unverified],..." – only championships
 * run by the official organiser should be marked official.
 */
const BASE = "https://open.faceit.com/data/v4";

const Faction = z.object({ faction_id: z.string().optional(), name: z.string().min(1) }).passthrough();
const Match = z
  .object({
    match_id: z.string().min(1),
    competition_id: z.string().optional(),
    competition_name: z.string().optional(),
    status: z.string(),
    scheduled_at: z.number().nullish(),
    started_at: z.number().nullish(),
    faceit_url: z.string().optional(),
    round: z.number().nullish(),
    teams: z.record(z.string(), Faction),
    results: z
      .object({ winner: z.string().nullish(), score: z.record(z.string(), z.number()).nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const Championship = z
  .object({
    championship_id: z.string(),
    name: z.string(),
    organizer_id: z.string().optional(),
    championship_start: z.number().nullish(),
    status: z.string().optional(),
    faceit_url: z.string().optional(),
    region: z.string().optional(),
  })
  .passthrough();

type Raw = { type: "championship"; item: unknown; official: boolean } | { type: "match"; item: unknown; championshipId: string; official: boolean };

function parseIds(value: string | undefined) {
  return list(value).map((e) => {
    const [id, kind] = e.split(":");
    return { id, official: kind !== "unverified" };
  });
}

export const faceitAdapter: SourceAdapter<Raw> = {
  id: "faceit",
  label: "FACEIT Data API",
  platform: "faceit",
  description: "Offizielle Online-Qualifier (z. B. TGM26 Online Series), sofern auf FACEIT ausgetragen.",
  verification: "official",
  defaultIntervalMinutes: 30,
  rateLimit: { limit: 300, windowMs: 3600_000, minIntervalMs: 250, note: "FACEIT-Limits laut Developer Portal; konservativ 300/h." },
  docsUrl: "https://docs.faceit.com/docs/data-api/data",
  requiredEnv: ["FACEIT_API_KEY", "FACEIT_CHAMPIONSHIP_IDS"],
  configured(env) {
    const missing = [];
    if (!env.FACEIT_API_KEY) missing.push("FACEIT_API_KEY");
    if (!env.FACEIT_CHAMPIONSHIP_IDS) missing.push("FACEIT_CHAMPIONSHIP_IDS");
    return { ok: missing.length === 0, missing };
  },
  async fetchRaw(ctx: FetchContext) {
    const out: Raw[] = [];
    const headers = { Authorization: `Bearer ${ctx.env.FACEIT_API_KEY}`, Accept: "application/json" };
    for (const { id, official } of parseIds(ctx.env.FACEIT_CHAMPIONSHIP_IDS)) {
      const champ = await (await ctx.http(`${BASE}/championships/${encodeURIComponent(id)}`, { headers })).json();
      out.push({ type: "championship", item: champ, official });
      for (let offset = 0; offset < 1000; offset += 100) {
        const page = (await (await ctx.http(`${BASE}/championships/${encodeURIComponent(id)}/matches?type=all&offset=${offset}&limit=100`, { headers })).json()) as {
          items?: unknown[];
        };
        const items = page.items ?? [];
        out.push(...items.map((item) => ({ type: "match" as const, item, championshipId: id, official })));
        if (items.length < 100) break;
      }
    }
    return out;
  },
  normalize(raw): NormalizedRecord[] {
    if (raw.type === "championship") {
      const c = Championship.parse(raw.item);
      return [
        {
          kind: "tournament",
          externalId: c.championship_id,
          url: c.faceit_url?.replace("{lang}", "en"),
          name: c.name,
          organizer: "FACEIT",
          region: c.region ?? null,
          startDate: c.championship_start ? new Date(c.championship_start) : null,
          status: c.status === "finished" ? "completed" : c.status === "cancelled" ? "cancelled" : c.status === "started" ? "ongoing" : "upcoming",
          verificationOverride: raw.official ? "official" : "unverified",
        },
      ];
    }
    const m = Match.parse(raw.item);
    const factions = Object.entries(m.teams);
    const status = m.status.toUpperCase();
    const finished = status === "FINISHED";
    const winnerKey = m.results?.winner ?? null;
    return [
      {
        kind: "match",
        externalId: m.match_id,
        url: m.faceit_url?.replace("{lang}", "en"),
        tournamentExternalId: raw.championshipId,
        roundLabel: m.round != null ? `Runde ${m.round}` : null,
        scheduledAt: m.scheduled_at ? new Date(m.scheduled_at * 1000) : m.started_at ? new Date(m.started_at * 1000) : null,
        status: finished ? "completed" : status === "CANCELLED" ? "cancelled" : status === "ONGOING" ? "live" : "scheduled",
        teams: factions.map(([, f]) => ({ name: f.name })),
        result: finished
          ? {
              winnerName: winnerKey ? (m.teams[winnerKey]?.name ?? null) : null,
              placements: undefined,
              cashoutsDocumented: false,
            }
          : null,
        verificationOverride: raw.official ? "official" : "unverified",
      },
    ];
  },
};
