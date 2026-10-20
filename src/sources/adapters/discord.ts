import { z } from "zod";
import type { FetchContext, NormalizedRecord, SourceAdapter } from "../types";
import { parseAccounts } from "../types";

/**
 * Discord REST "Get Channel Messages" (https://discord.com/developers/docs/resources/message#get-channel-messages).
 *
 * Authorised setup only: the project runs its OWN Discord server and uses
 * "Follow" on the official announcement channels. Discord then copies every
 * announcement into a channel of our server, where our bot reads it.
 * No self-bots, no bots in servers we do not control, no private messages.
 * The bot needs "Read Message History" and the Message Content intent.
 *
 * DISCORD_CHANNELS: "guildId/channelId:official:THE FINALS announcements,..."
 */
const Message = z
  .object({
    id: z.string(),
    content: z.string().default(""),
    timestamp: z.string(),
    author: z.object({ username: z.string() }).passthrough(),
    embeds: z.array(z.object({ title: z.string().optional(), description: z.string().optional() }).passthrough()).default([]),
  })
  .passthrough();

type Raw = { item: unknown; guildId: string; channelId: string; account: ReturnType<typeof parseAccounts>[number] };

export const discordAdapter: SourceAdapter<Raw> = {
  id: "discord",
  label: "Discord (gefolgte Ankündigungskanäle)",
  platform: "discord",
  description: "Offizielle Discord-Ankündigungen, weitergeleitet per Channel-Follow in den eigenen Server.",
  verification: "unverified",
  defaultIntervalMinutes: 30,
  rateLimit: { limit: 200, windowMs: 3600_000, minIntervalMs: 1000, note: "Discord-Limits pro Route; konservativ 200/h." },
  docsUrl: "https://support.discord.com/hc/en-us/articles/360028384531",
  requiredEnv: ["DISCORD_BOT_TOKEN", "DISCORD_CHANNELS"],
  configured(env) {
    const missing = ["DISCORD_BOT_TOKEN", "DISCORD_CHANNELS"].filter((k) => !env[k as keyof typeof env]);
    return { ok: missing.length === 0, missing };
  },
  async fetchRaw(ctx: FetchContext) {
    const out: Raw[] = [];
    for (const account of parseAccounts(ctx.env.DISCORD_CHANNELS)) {
      const [guildId, channelId] = account.id.split("/");
      if (!guildId || !channelId) {
        ctx.warn(`DISCORD_CHANNELS-Eintrag "${account.id}" muss guildId/channelId sein.`);
        continue;
      }
      const res = await ctx.http(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, {
        headers: { Authorization: `Bot ${ctx.env.DISCORD_BOT_TOKEN}` },
      });
      for (const item of (await res.json()) as unknown[]) out.push({ item, guildId, channelId, account });
    }
    return out;
  },
  normalize(raw): NormalizedRecord[] {
    const m = Message.parse(raw.item);
    const embedText = m.embeds.map((e) => [e.title, e.description].filter(Boolean).join("\n")).join("\n");
    const body = [m.content, embedText].filter(Boolean).join("\n").trim();
    if (!body) throw new Error("Leere Discord-Nachricht (fehlt der Message-Content-Intent?)");
    return [
      {
        kind: "social_post",
        externalId: m.id,
        url: `https://discord.com/channels/${raw.guildId}/${raw.channelId}/${m.id}`,
        platform: "discord",
        accountHandle: m.author.username,
        accountName: raw.account.label,
        accountKind: raw.account.kind,
        body: body.slice(0, 4000),
        publishedAt: new Date(m.timestamp),
      },
    ];
  },
};
