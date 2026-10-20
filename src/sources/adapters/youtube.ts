import { XMLParser } from "fast-xml-parser";
import type { FetchContext, NormalizedRecord, SourceAdapter } from "../types";
import { parseAccounts } from "../types";

/**
 * YouTube channel Atom feeds: https://www.youtube.com/feeds/videos.xml?channel_id=...
 * No API key, no quota. Returns the latest videos only (around 15); the feed is
 * public but not formally documented by Google, so it may change.
 * Upgrade path: YouTube Data API v3 (API key, 10,000 units/day) if more is needed.
 *
 * YOUTUBE_CHANNELS: "UC...:official:THE FINALS,UC...:team:Team X"
 * Channel ids must be copied from the channel page; none are hard-coded here.
 */
type Raw = { entry: Record<string, unknown>; account: ReturnType<typeof parseAccounts>[number]; channelTitle: string };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export const youtubeAdapter: SourceAdapter<Raw> = {
  id: "youtube",
  label: "YouTube (Kanal-Feeds)",
  platform: "youtube",
  description: "Neue Videos und VODs offizieller Kanäle, Organisatoren und Teams.",
  verification: "unverified",
  defaultIntervalMinutes: 60,
  rateLimit: { limit: 120, windowMs: 3600_000, minIntervalMs: 1000, note: "Öffentlicher Feed ohne Kontingent; wir begrenzen auf 120 Abrufe/h." },
  docsUrl: "https://developers.google.com/youtube/v3/getting-started",
  requiredEnv: ["YOUTUBE_CHANNELS"],
  configured(env) {
    return env.YOUTUBE_CHANNELS ? { ok: true, missing: [] } : { ok: false, missing: ["YOUTUBE_CHANNELS"] };
  },
  async fetchRaw(ctx: FetchContext) {
    const out: Raw[] = [];
    for (const account of parseAccounts(ctx.env.YOUTUBE_CHANNELS)) {
      const xml = await (await ctx.http(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(account.id)}`)).text();
      const feed = parser.parse(xml)?.feed;
      if (!feed) {
        ctx.warn(`YouTube-Feed für ${account.label} hat kein gültiges Format.`);
        continue;
      }
      const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
      for (const entry of entries) out.push({ entry, account, channelTitle: String(feed.title ?? account.label) });
    }
    return out;
  },
  normalize(raw): NormalizedRecord[] {
    const e = raw.entry as Record<string, any>;
    const videoId = String(e["yt:videoId"] ?? "");
    if (!videoId) throw new Error("YouTube-Eintrag ohne videoId");
    const link = Array.isArray(e.link) ? e.link[0] : e.link;
    const description = e["media:group"]?.["media:description"];
    return [
      {
        kind: "social_post",
        externalId: videoId,
        url: link?.["@_href"] ?? `https://www.youtube.com/watch?v=${videoId}`,
        platform: "youtube",
        accountHandle: raw.account.id,
        accountName: raw.channelTitle,
        accountKind: raw.account.kind,
        title: String(e.title ?? ""),
        body: typeof description === "string" ? description.slice(0, 2000) : "",
        publishedAt: e.published ? new Date(e.published) : null,
      },
    ];
  },
};
