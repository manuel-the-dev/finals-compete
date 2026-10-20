import type { Env } from "@/lib/env";
import type { Verification } from "@/db/schema";

export type AccountKind = "official" | "organizer" | "team" | "player" | "community";

export type TeamRecord = {
  kind: "team";
  externalId: string;
  url?: string;
  name: string;
  region?: string | null;
  aliases?: string[];
};

export type PlayerRecord = {
  kind: "player";
  externalId: string;
  url?: string;
  handle: string;
  country?: string | null;
  teamName?: string | null;
};

export type TournamentRecord = {
  kind: "tournament";
  externalId: string;
  url?: string;
  name: string;
  organizer?: string | null;
  tier?: string | null;
  format?: string | null;
  region?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  prizePool?: string | null;
  status?: "upcoming" | "ongoing" | "completed" | "cancelled";
  officialUrl?: string | null;
  verificationOverride?: Verification;
};

export type MatchRecord = {
  kind: "match";
  externalId: string;
  url?: string;
  tournamentExternalId?: string | null;
  stage?: string | null;
  roundLabel?: string | null;
  scheduledAt?: Date | null;
  status: "scheduled" | "live" | "completed" | "cancelled";
  teams: { name: string }[];
  /** Only present when the source marks the match as finished. */
  result?: {
    winnerName: string | null;
    placements?: { name: string; placement: number | null; score: string | null }[];
    /** True only if the source explicitly lists cashout values. */
    cashoutsDocumented?: boolean;
  } | null;
  verificationOverride?: Verification;
};

export type PlacementRecord = {
  kind: "placement";
  externalId: string;
  url?: string;
  tournamentExternalId: string;
  teamName: string;
  placement: number | null;
};

export type SocialPostRecord = {
  kind: "social_post";
  externalId: string;
  url: string;
  platform: "x" | "youtube" | "twitch" | "discord" | "reddit" | "web";
  accountHandle: string;
  accountName?: string | null;
  accountKind: AccountKind;
  title?: string | null;
  body: string;
  publishedAt?: Date | null;
  isLive?: boolean;
};

export type NormalizedRecord =
  | TeamRecord
  | PlayerRecord
  | TournamentRecord
  | MatchRecord
  | PlacementRecord
  | SocialPostRecord;

export type HttpFn = (url: string, init?: RequestInit) => Promise<Response>;

export type FetchContext = {
  env: Env;
  /** Rate-limited fetch with the project User-Agent. Throws BudgetExhaustedError when the budget is used up. */
  http: HttpFn;
  warn: (message: string) => void;
  lastSuccessAt: Date | null;
  now: Date;
};

export type RateLimit = {
  /** Max requests per window; enforced across runs via data_sources.request_log. */
  limit: number;
  windowMs: number;
  /** Minimum gap between two requests in the same run. */
  minIntervalMs: number;
  note: string;
};

export interface SourceAdapter<Raw = unknown> {
  id: string;
  label: string;
  platform: string;
  description: string;
  /** Default trust level of records from this source (social posts derive it from the account kind). */
  verification: Verification;
  defaultIntervalMinutes: number;
  rateLimit: RateLimit;
  docsUrl: string;
  /** Environment variables (names only) the adapter needs. Values are never exposed. */
  requiredEnv: string[];
  configured(env: Env): { ok: boolean; missing: string[] };
  /** Fetch raw items from the source (respecting ctx.http rate limits). */
  fetchRaw(ctx: FetchContext): Promise<Raw[]>;
  /** Validate + normalize one raw item. Throw to reject the item (logged as warning). */
  normalize(raw: Raw, ctx: FetchContext): NormalizedRecord[];
  /** Social adapters that report "currently live" state set this so stale live flags are cleared. */
  liveSnapshot?: boolean;
}

export class BudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExhaustedError";
  }
}

export class SourceHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SourceHttpError";
  }
}

export function verificationForAccount(kind: AccountKind): Verification {
  if (kind === "official" || kind === "organizer") return "official";
  if (kind === "team" || kind === "player") return "team_claim";
  return "unverified";
}

/** Parses "id:kind:label,..." config strings used by the social adapters. */
export function parseAccounts(value: string | undefined): { id: string; kind: AccountKind; label: string }[] {
  const kinds: AccountKind[] = ["official", "organizer", "team", "player", "community"];
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, kind = "community", ...rest] = entry.split(":");
      const k = kinds.includes(kind as AccountKind) ? (kind as AccountKind) : "community";
      return { id: id.trim(), kind: k, label: rest.join(":").trim() || id.trim() };
    });
}
