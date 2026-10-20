import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Verification status of a piece of information, ordered from most to least trusted.
 * See docs/DATA_SOURCES.md for the source hierarchy.
 */
export const VERIFICATION = ["manual", "official", "database", "team_claim", "unverified", "demo"] as const;
export type Verification = (typeof VERIFICATION)[number];

// ---------------------------------------------------------------------------
// Users, wallets, audit
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: createdAt(),
});

/** Virtual currency only. Balance = sum(amount). Rows are append-only. */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    amount: integer("amount").notNull(),
    kind: text("kind", { enum: ["grant", "stake", "payout", "refund", "adjustment"] }).notNull(),
    marketId: uuid("market_id").references(() => markets.id),
    predictionId: uuid("prediction_id").references(() => predictions.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("wallet_tx_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorKind: text("actor_kind", { enum: ["user", "admin", "system", "sync"] }).notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)],
);

// ---------------------------------------------------------------------------
// Competitive data
// ---------------------------------------------------------------------------

export const teams = pgTable("teams", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  region: text("region"),
  /** Lower-cased alternative names used for cross-source matching. */
  aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const players = pgTable("players", {
  id: id(),
  slug: text("slug").notNull().unique(),
  handle: text("handle").notNull(),
  country: text("country"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tournaments = pgTable("tournaments", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  organizer: text("organizer"),
  tier: text("tier"),
  format: text("format"),
  region: text("region"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  prizePool: text("prize_pool"),
  status: text("status", { enum: ["upcoming", "ongoing", "completed", "cancelled"] }).notNull().default("upcoming"),
  officialUrl: text("official_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Lineups: a player on a team, optionally scoped to one tournament. */
export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    playerId: uuid("player_id").notNull().references(() => players.id),
    tournamentId: uuid("tournament_id").references(() => tournaments.id),
    role: text("role"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("membership_team_idx").on(t.teamId)],
);

export const tournamentParticipants = pgTable(
  "tournament_participants",
  {
    tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    /** Final placement; only filled from a verified source. */
    placement: integer("placement"),
    placementVerification: text("placement_verification", { enum: VERIFICATION }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.teamId] })],
);

/**
 * A match can have two or more teams (THE FINALS rounds usually have several
 * teams competing at once), so participants live in match_participants.
 */
export const matches = pgTable(
  "matches",
  {
    id: id(),
    tournamentId: uuid("tournament_id").references(() => tournaments.id),
    stage: text("stage"),
    roundLabel: text("round_label"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    status: text("status", { enum: ["scheduled", "live", "completed", "cancelled"] }).notNull().default("scheduled"),
    /** Derived by the resolution engine from result_claims. Never set from social media. */
    resultStatus: text("result_status", { enum: ["none", "provisional", "verified", "conflict"] })
      .notNull()
      .default("none"),
    winnerTeamId: uuid("winner_team_id").references(() => teams.id),
    resultVerification: text("result_verification", { enum: VERIFICATION }),
    resultResolvedAt: timestamp("result_resolved_at", { withTimezone: true }),
    /** Set when a social post announces a result/correction that is not yet backed by an authoritative source. */
    needsReview: boolean("needs_review").notNull().default(false),
    /** Deterministic key used to detect the same match arriving from several sources. */
    dedupeKey: text("dedupe_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("matches_tournament_idx").on(t.tournamentId), index("matches_dedupe_idx").on(t.dedupeKey)],
);

export const matchParticipants = pgTable(
  "match_participants",
  {
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    /** Placement and score from the resolved (verified) result only. */
    placement: integer("placement"),
    score: text("score"),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.teamId] })],
);

/**
 * Every source that reports a match result creates a claim. The resolution
 * engine (src/domain/resolution.ts) turns claims into the match's result status.
 */
export const resultClaims = pgTable(
  "result_claims",
  {
    id: id(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id),
    source: text("source").notNull(),
    verification: text("verification", { enum: VERIFICATION }).notNull(),
    winnerTeamId: uuid("winner_team_id").references(() => teams.id),
    placements: jsonb("placements").$type<{ teamId: string; placement: number | null; score: string | null }[]>(),
    /** Cashout values are only stored when a source explicitly documents them. */
    cashoutsDocumented: boolean("cashouts_documented").notNull().default(false),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    note: text("note"),
  },
  (t) => [index("claims_match_idx").on(t.matchId)],
);

// ---------------------------------------------------------------------------
// Provenance & sync
// ---------------------------------------------------------------------------

/**
 * Provenance for every imported record: which source, which external id,
 * original URL, when it was seen and whether it changed.
 */
export const sourceRecords = pgTable(
  "source_records",
  {
    id: id(),
    source: text("source").notNull(),
    entityType: text("entity_type", {
      enum: ["team", "player", "tournament", "match", "result", "placement", "lineup", "social_post"],
    }).notNull(),
    externalId: text("external_id").notNull(),
    entityId: uuid("entity_id"),
    url: text("url"),
    verification: text("verification", { enum: VERIFICATION }).notNull(),
    contentHash: text("content_hash").notNull(),
    raw: jsonb("raw"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }).notNull().defaultNow(),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("source_records_unique").on(t.source, t.entityType, t.externalId),
    index("source_records_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const INFO_TYPES = [
  "tournament_announcement",
  "schedule",
  "schedule_change",
  "result",
  "result_correction",
  "lineup_change",
  "transfer",
  "qualification",
  "cancellation",
  "stream",
  "video",
  "other",
] as const;

export const socialPosts = pgTable(
  "social_posts",
  {
    id: id(),
    platform: text("platform", { enum: ["x", "youtube", "twitch", "discord", "reddit", "web"] }).notNull(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    accountHandle: text("account_handle").notNull(),
    accountName: text("account_name"),
    accountKind: text("account_kind", { enum: ["official", "organizer", "team", "player", "community"] }).notNull(),
    url: text("url").notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    infoType: text("info_type", { enum: INFO_TYPES }).notNull().default("other"),
    verification: text("verification", { enum: VERIFICATION }).notNull(),
    tournamentId: uuid("tournament_id").references(() => tournaments.id),
    matchId: uuid("match_id").references(() => matches.id),
    teamIds: uuid("team_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** True while the stream is live (Twitch only; never inferred). */
    isLive: boolean("is_live").notNull().default(false),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("social_posts_unique").on(t.source, t.externalId), index("social_published_idx").on(t.publishedAt)],
);

export const dataSources = pgTable("data_sources", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  intervalMinutes: integer("interval_minutes").notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastWarnings: jsonb("last_warnings").$type<string[]>(),
  recordsImported: integer("records_imported").notNull().default(0),
  /** Timestamps (ms) of recent outbound requests, used to enforce hourly budgets across runs. */
  requestLog: jsonb("request_log").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: updatedAt(),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: id(),
    sourceId: text("source_id").notNull().references(() => dataSources.id),
    trigger: text("trigger", { enum: ["schedule", "manual", "cli", "test"] }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status", { enum: ["running", "success", "partial", "failed", "skipped"] }).notNull().default("running"),
    requests: integer("requests").notNull().default(0),
    fetched: integer("fetched").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    unchanged: integer("unchanged").notNull().default(0),
    errors: jsonb("errors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [index("sync_runs_source_idx").on(t.sourceId, t.startedAt)],
);

export const conflicts = pgTable(
  "conflicts",
  {
    id: id(),
    entityType: text("entity_type", { enum: ["match", "tournament"] }).notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    severity: text("severity", { enum: ["blocking", "warning"] }).notNull(),
    status: text("status", { enum: ["open", "resolved", "dismissed"] }).notNull().default("open"),
    summary: text("summary").notNull(),
    claimIds: uuid("claim_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
  },
  (t) => [index("conflicts_entity_idx").on(t.entityType, t.entityId, t.status)],
);

// ---------------------------------------------------------------------------
// Prediction markets (virtual currency only)
// ---------------------------------------------------------------------------

export const markets = pgTable(
  "markets",
  {
    id: id(),
    question: text("question").notNull(),
    matchId: uuid("match_id").references(() => matches.id),
    tournamentId: uuid("tournament_id").references(() => tournaments.id),
    /** What data the market needs to be settled. */
    dataRequirement: text("data_requirement", {
      enum: ["match_winner", "tournament_winner", "cashout_stat", "round_event", "custom"],
    }).notNull(),
    /**
     * auto        – may settle automatically once the required data is verified
     * manual_only – an admin must settle with a cited source
     * unavailable – no reliable data source exists; market cannot be settled automatically
     */
    settlementMode: text("settlement_mode", { enum: ["auto", "manual_only", "unavailable"] }).notNull(),
    status: text("status", { enum: ["open", "locked", "settlement_blocked", "settled", "voided"] })
      .notNull()
      .default("open"),
    blockedReason: text("blocked_reason"),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    settledOutcomeId: uuid("settled_outcome_id"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    settledByUserId: uuid("settled_by_user_id").references(() => users.id),
    settlementSourceUrl: text("settlement_source_url"),
    settlementNote: text("settlement_note"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "auto_requires_supported_data",
      sql`${t.settlementMode} <> 'auto' OR ${t.dataRequirement} IN ('match_winner', 'tournament_winner')`,
    ),
  ],
);

export const marketOutcomes = pgTable("market_outcomes", {
  id: id(),
  marketId: uuid("market_id").notNull().references(() => markets.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  teamId: uuid("team_id").references(() => teams.id),
});

export const predictions = pgTable(
  "predictions",
  {
    id: id(),
    marketId: uuid("market_id").notNull().references(() => markets.id),
    outcomeId: uuid("outcome_id").notNull().references(() => marketOutcomes.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    stake: integer("stake").notNull(),
    status: text("status", { enum: ["open", "won", "lost", "refunded"] }).notNull().default("open"),
    payout: integer("payout"),
    createdAt: createdAt(),
  },
  (t) => [index("predictions_market_idx").on(t.marketId), check("stake_positive", sql`${t.stake} > 0`)],
);
