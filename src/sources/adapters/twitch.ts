import { z } from "zod";
import type { FetchContext, NormalizedRecord, SourceAdapter } from "../types";
import { parseAccounts } from "../types";

/**
 * Twitch Helix "Get Streams" (https://dev.twitch.tv/docs/api/reference/#get-streams)
 * with an app access token (client credentials). This is the only source in
 * the project that reports genuinely live state, and only for streams.
 *
 * TWITCH_CHANNELS: "login:official:THE FINALS,login:organizer:..."
 */
const Stream = z
  .object({ id: z.string(), user_login: z.string(), user_name: z.string(), title: z.string().default(""), started_at: z.string(), type: z.string() })
  .passthrough();

type Raw = { item: unknown; kind: ReturnType<typeof parseAccounts>[number]["kind"] };

export const twitchAdapter: SourceAdapter<Raw> = {
  id: "twitch",
  label: "Twitch (Livestreams)",
  platform: "twitch",
  description: "Live-Status von Turnier-Streams.",
  verification: "unverified",
  defaultIntervalMinutes: 10,
  rateLimit: { limit: 600, windowMs: 60_000, minIntervalMs: 200, note: "Helix: 800 Punkte/Minute mit App-Token." },
  docsUrl: "https://dev.twitch.tv/docs/api/",
  requiredEnv: ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "TWITCH_CHANNELS"],
  liveSnapshot: true,
  configured(env) {
    const missing = ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "TWITCH_CHANNELS"].filter((k) => !env[k as keyof typeof env]);
    return { ok: missing.length === 0, missing };
  },
  async fetchRaw(ctx: FetchContext) {
    const tokenRes = await ctx.http("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: ctx.env.TWITCH_CLIENT_ID!, client_secret: ctx.env.TWITCH_CLIENT_SECRET!, grant_type: "client_credentials" }),
    });
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const accounts = parseAccounts(ctx.env.TWITCH_CHANNELS);
    const kinds = new Map(accounts.map((a) => [a.id.toLowerCase(), a.kind]));
    const out: Raw[] = [];
    for (let i = 0; i < accounts.length; i += 100) {
      const qs = new URLSearchParams(accounts.slice(i, i + 100).map((a) => ["user_login", a.id]));
      const res = await ctx.http(`https://api.twitch.tv/helix/streams?${qs}`, {
        headers: { Authorization: `Bearer ${access_token}`, "Client-Id": ctx.env.TWITCH_CLIENT_ID! },
      });
      const body = (await res.json()) as { data?: { user_login?: string }[] };
      for (const item of body.data ?? []) out.push({ item, kind: kinds.get(String(item.user_login).toLowerCase()) ?? "community" });
    }
    return out;
  },
  normalize(raw): NormalizedRecord[] {
    const s = Stream.parse(raw.item);
    return [
      {
        kind: "social_post",
        externalId: s.id,
        url: `https://www.twitch.tv/${s.user_login}`,
        platform: "twitch",
        accountHandle: s.user_login,
        accountName: s.user_name,
        accountKind: raw.kind,
        title: s.title,
        body: s.title,
        publishedAt: new Date(s.started_at),
        isLive: s.type === "live",
      },
    ];
  },
};
