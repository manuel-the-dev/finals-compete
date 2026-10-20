import { z } from "zod";
import type { FetchContext, NormalizedRecord, SourceAdapter } from "../types";
import { parseAccounts } from "../types";

/**
 * X API v2 "User Posts timeline" (https://docs.x.com/x-api/posts/user-posts-timeline-by-user-id).
 * Requires a Bearer token from the X Developer Console. Reads are billed per
 * post (pay-per-use), so each run is capped by X_MAX_POSTS_PER_RUN.
 *
 * X_ACCOUNTS: "numericUserId:official:THEFINALS,numericUserId:team:TeamHandle"
 * (numeric ids, not @handles, to avoid a paid user lookup on every run).
 */
const Post = z.object({ id: z.string(), text: z.string(), created_at: z.string().optional() }).passthrough();
type Raw = { item: unknown; account: ReturnType<typeof parseAccounts>[number] };

export const xAdapter: SourceAdapter<Raw> = {
  id: "x",
  label: "X (ehem. Twitter)",
  platform: "x",
  description: "Ankündigungen offizieller Accounts, Organisatoren, Teams und Spieler. Kostenpflichtig pro gelesenem Post.",
  verification: "unverified",
  defaultIntervalMinutes: 120,
  rateLimit: { limit: 30, windowMs: 3600_000, minIntervalMs: 1000, note: "Pay-per-use; Budget über X_MAX_POSTS_PER_RUN steuern." },
  docsUrl: "https://docs.x.com/x-api/getting-started/pricing",
  requiredEnv: ["X_BEARER_TOKEN", "X_ACCOUNTS"],
  configured(env) {
    const missing = ["X_BEARER_TOKEN", "X_ACCOUNTS"].filter((k) => !env[k as keyof typeof env]);
    return { ok: missing.length === 0, missing };
  },
  async fetchRaw(ctx: FetchContext) {
    const out: Raw[] = [];
    let remaining = ctx.env.X_MAX_POSTS_PER_RUN;
    const startTime = (ctx.lastSuccessAt ?? new Date(ctx.now.getTime() - 3 * 86400_000)).toISOString();
    for (const account of parseAccounts(ctx.env.X_ACCOUNTS)) {
      if (remaining < 5) {
        ctx.warn("X-Budget für diesen Lauf aufgebraucht; restliche Accounts beim nächsten Lauf.");
        break;
      }
      const qs = new URLSearchParams({ max_results: String(Math.min(100, Math.max(5, remaining))), "tweet.fields": "created_at", start_time: startTime, exclude: "retweets,replies" });
      const res = await ctx.http(`https://api.x.com/2/users/${encodeURIComponent(account.id)}/tweets?${qs}`, {
        headers: { Authorization: `Bearer ${ctx.env.X_BEARER_TOKEN}` },
      });
      const body = (await res.json()) as { data?: unknown[] };
      const items = body.data ?? [];
      remaining -= items.length;
      out.push(...items.map((item) => ({ item, account })));
    }
    return out;
  },
  normalize(raw): NormalizedRecord[] {
    const p = Post.parse(raw.item);
    return [
      {
        kind: "social_post",
        externalId: p.id,
        url: `https://x.com/${raw.account.label}/status/${p.id}`,
        platform: "x",
        accountHandle: raw.account.label,
        accountKind: raw.account.kind,
        body: p.text,
        publishedAt: p.created_at ? new Date(p.created_at) : null,
      },
    ];
  },
};
