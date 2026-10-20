import { createHash } from "node:crypto";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import type { Verification } from "@/db/schema";
import { classifyPost, findTeamMentions, normalizeName, slugify } from "@/domain/classify";
import { recomputeMatch, recomputeTournamentPlacements } from "@/domain/results-service";
import type { Env } from "@/lib/env";
import { RequestBudget, createHttp } from "./http";
import {
  BudgetExhaustedError,
  type FetchContext,
  type MatchRecord,
  type NormalizedRecord,
  type SocialPostRecord,
  type SourceAdapter,
  verificationForAccount,
} from "./types";

export type SyncSummary = {
  sourceId: string;
  status: "success" | "partial" | "failed" | "skipped";
  requests: number;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
  warnings: string[];
};

/** Stable JSON (sorted keys, Dates as ISO) for change detection. */
export function stableHash(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(norm(value))).digest("hex");
}

export async function ensureDataSource(db: DB, adapter: SourceAdapter) {
  await db
    .insert(s.dataSources)
    .values({ id: adapter.id, intervalMinutes: adapter.defaultIntervalMinutes })
    .onConflictDoNothing();
  const [row] = await db.select().from(s.dataSources).where(eq(s.dataSources.id, adapter.id));
  return row;
}

type RunOptions = {
  trigger: "schedule" | "manual" | "cli" | "test";
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Skip the minIntervalMs wait (tests). */
  noWait?: boolean;
};

/**
 * Runs one adapter end to end: fetch -> validate/normalize -> dedupe -> detect
 * changes -> store with provenance -> recompute results -> log the run.
 */
export async function runSync(db: DB, env: Env, adapter: SourceAdapter, opts: RunOptions): Promise<SyncSummary> {
  const ds = await ensureDataSource(db, adapter);
  const now = opts.now ?? new Date();
  const summary: SyncSummary = {
    sourceId: adapter.id,
    status: "success",
    requests: 0,
    fetched: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    warnings: [],
  };

  const cfg = adapter.configured(env);
  if (!ds.enabled || !cfg.ok) {
    summary.status = "skipped";
    summary.warnings.push(!ds.enabled ? "Quelle ist deaktiviert." : `Nicht konfiguriert, fehlend: ${cfg.missing.join(", ")}`);
    await db.insert(s.syncRuns).values({
      sourceId: adapter.id,
      trigger: opts.trigger,
      status: "skipped",
      finishedAt: new Date(),
      warnings: summary.warnings,
    });
    return summary;
  }

  const [run] = await db.insert(s.syncRuns).values({ sourceId: adapter.id, trigger: opts.trigger }).returning();
  const budget = new RequestBudget(adapter.rateLimit, ds.requestLog ?? [], Date.now, opts.noWait ? async () => {} : undefined);
  const ctx: FetchContext = {
    env,
    http: createHttp(budget, env.SOURCE_USER_AGENT, opts.fetchImpl),
    warn: (m) => summary.warnings.push(m),
    lastSuccessAt: ds.lastSuccessAt,
    now,
  };

  let raws: unknown[] = [];
  try {
    raws = await adapter.fetchRaw(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof BudgetExhaustedError) summary.warnings.push(msg);
    else summary.errors.push(msg);
  }
  summary.fetched = raws.length;

  const records: NormalizedRecord[] = [];
  for (const raw of raws) {
    try {
      records.push(...adapter.normalize(raw, ctx));
    } catch (err) {
      summary.warnings.push(`Ungültiger Datensatz verworfen: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
    }
  }

  // Store in dependency order so references resolve within one run.
  const order: NormalizedRecord["kind"][] = ["team", "tournament", "player", "match", "placement", "social_post"];
  records.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  const touchedMatches = new Set<string>();
  const touchedTournaments = new Set<string>();
  const liveSeen = new Set<string>();
  for (const rec of records) {
    try {
      const outcome = await storeRecord(db, adapter, rec, touchedMatches, touchedTournaments);
      summary[outcome]++;
      if (rec.kind === "social_post" && rec.isLive) liveSeen.add(rec.externalId);
    } catch (err) {
      summary.errors.push(`${rec.kind} ${rec.externalId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (adapter.liveSnapshot && summary.errors.length === 0) {
    // Streams that were live but are no longer reported are marked offline. Never inferred the other way round.
    const live = await db
      .select({ id: s.socialPosts.id, externalId: s.socialPosts.externalId })
      .from(s.socialPosts)
      .where(and(eq(s.socialPosts.source, adapter.id), eq(s.socialPosts.isLive, true)));
    const stale = live.filter((p) => !liveSeen.has(p.externalId)).map((p) => p.id);
    if (stale.length) await db.update(s.socialPosts).set({ isLive: false }).where(inArray(s.socialPosts.id, stale));
  }

  for (const matchId of touchedMatches) await recomputeMatch(db, matchId, { actorKind: "sync" });
  for (const tId of touchedTournaments) await recomputeTournamentPlacements(db, tId);

  summary.requests = budget.used;
  if (summary.errors.length && summary.created + summary.updated + summary.unchanged === 0) summary.status = "failed";
  else if (summary.errors.length || summary.warnings.length) summary.status = "partial";

  const finishedAt = new Date();
  await db
    .update(s.syncRuns)
    .set({
      finishedAt,
      status: summary.status,
      requests: summary.requests,
      fetched: summary.fetched,
      created: summary.created,
      updated: summary.updated,
      unchanged: summary.unchanged,
      errors: summary.errors.slice(0, 50),
      warnings: summary.warnings.slice(0, 50),
    })
    .where(eq(s.syncRuns.id, run.id));

  const failed = summary.status === "failed";
  await db
    .update(s.dataSources)
    .set({
      lastAttemptAt: finishedAt,
      ...(failed
        ? { lastFailureAt: finishedAt, lastError: summary.errors[0] ?? null }
        : { lastSuccessAt: finishedAt, ...(summary.errors.length ? { lastFailureAt: finishedAt, lastError: summary.errors[0] } : {}) }),
      lastWarnings: summary.warnings.slice(0, 20),
      requestLog: budget.snapshot(),
      recordsImported: sql`${s.dataSources.recordsImported} + ${summary.created}`,
      updatedAt: finishedAt,
    })
    .where(eq(s.dataSources.id, adapter.id));

  return summary;
}

type Outcome = "created" | "updated" | "unchanged";

async function upsertSourceRecord(
  db: DB,
  adapter: SourceAdapter,
  rec: NormalizedRecord,
): Promise<{ existing: typeof s.sourceRecords.$inferSelect | undefined; hash: string; changed: boolean }> {
  const entityType = rec.kind === "social_post" ? "social_post" : rec.kind;
  const hash = stableHash(rec);
  const [existing] = await db
    .select()
    .from(s.sourceRecords)
    .where(and(eq(s.sourceRecords.source, adapter.id), eq(s.sourceRecords.entityType, entityType), eq(s.sourceRecords.externalId, rec.externalId)));
  if (existing && existing.contentHash === hash) {
    await db.update(s.sourceRecords).set({ lastImportedAt: new Date() }).where(eq(s.sourceRecords.id, existing.id));
    return { existing, hash, changed: false };
  }
  return { existing, hash, changed: true };
}

async function saveSourceRecord(
  db: DB,
  adapter: SourceAdapter,
  rec: NormalizedRecord,
  verification: Verification,
  hash: string,
  entityId: string | null,
) {
  const entityType = rec.kind;
  const now = new Date();
  const [row] = await db
    .insert(s.sourceRecords)
    .values({
      source: adapter.id,
      entityType,
      externalId: rec.externalId,
      entityId,
      url: rec.url ?? null,
      verification,
      contentHash: hash,
      raw: JSON.parse(JSON.stringify(rec)),
    })
    .onConflictDoUpdate({
      target: [s.sourceRecords.source, s.sourceRecords.entityType, s.sourceRecords.externalId],
      set: { entityId, url: rec.url ?? null, verification, contentHash: hash, raw: JSON.parse(JSON.stringify(rec)), lastChangedAt: now, lastImportedAt: now },
    })
    .returning();
  return row;
}

async function entityIdFor(db: DB, source: string, entityType: (typeof s.sourceRecords.$inferSelect)["entityType"], externalId: string) {
  const [row] = await db
    .select({ entityId: s.sourceRecords.entityId })
    .from(s.sourceRecords)
    .where(and(eq(s.sourceRecords.source, source), eq(s.sourceRecords.entityType, entityType), eq(s.sourceRecords.externalId, externalId)));
  return row?.entityId ?? null;
}

/** Finds a team by normalized name or alias (cross-source dedupe) or creates it. */
export async function findOrCreateTeam(db: DB, name: string, extra?: { region?: string | null; aliases?: string[] }) {
  const norm = normalizeName(name);
  const slug = slugify(name);
  const [found] = await db
    .select()
    .from(s.teams)
    .where(sql`${s.teams.slug} = ${slug} OR ${norm} = ANY(${s.teams.aliases})`);
  if (found) return { team: found, created: false };
  const aliases = [...new Set([norm, ...(extra?.aliases ?? []).map(normalizeName)])];
  const [team] = await db
    .insert(s.teams)
    .values({ slug, name, region: extra?.region ?? null, aliases })
    .onConflictDoNothing()
    .returning();
  if (team) return { team, created: true };
  const [again] = await db.select().from(s.teams).where(eq(s.teams.slug, slug));
  return { team: again, created: false };
}

/**
 * Same set of teams scheduled in the same hour = same match, whichever source
 * reported it. Tournament ids are not part of the key because each source
 * names tournaments differently (Liquipedia page vs. FACEIT championship).
 */
export function matchDedupeKey(teamIds: string[], scheduledAt: Date | null | undefined) {
  if (!scheduledAt || teamIds.length < 2) return null;
  const hour = new Date(scheduledAt);
  hour.setUTCMinutes(0, 0, 0);
  return `${[...teamIds].sort().join(",")}|${hour.toISOString()}`;
}

async function storeRecord(
  db: DB,
  adapter: SourceAdapter,
  rec: NormalizedRecord,
  touchedMatches: Set<string>,
  touchedTournaments: Set<string>,
): Promise<Outcome> {
  const verification =
    rec.kind === "social_post"
      ? verificationForAccount(rec.accountKind)
      : ("verificationOverride" in rec && rec.verificationOverride) || adapter.verification;
  const { existing, hash, changed } = await upsertSourceRecord(db, adapter, rec);
  if (!changed) return "unchanged";

  let entityId: string | null = existing?.entityId ?? null;

  switch (rec.kind) {
    case "team": {
      if (entityId) {
        await db.update(s.teams).set({ name: rec.name, region: rec.region ?? null, updatedAt: new Date() }).where(eq(s.teams.id, entityId));
      } else {
        entityId = (await findOrCreateTeam(db, rec.name, rec)).team.id;
      }
      break;
    }
    case "player": {
      const values = { handle: rec.handle, country: rec.country ?? null, updatedAt: new Date() };
      if (entityId) await db.update(s.players).set(values).where(eq(s.players.id, entityId));
      else {
        const slug = slugify(rec.handle);
        const [p] = await db.insert(s.players).values({ ...values, slug }).onConflictDoUpdate({ target: s.players.slug, set: values }).returning();
        entityId = p.id;
      }
      if (rec.teamName) {
        const { team } = await findOrCreateTeam(db, rec.teamName);
        const [m] = await db
          .select()
          .from(s.teamMemberships)
          .where(and(eq(s.teamMemberships.playerId, entityId), eq(s.teamMemberships.teamId, team.id), sql`${s.teamMemberships.leftAt} IS NULL`));
        if (!m) {
          // A player moved: close the previous open membership.
          await db
            .update(s.teamMemberships)
            .set({ leftAt: new Date() })
            .where(and(eq(s.teamMemberships.playerId, entityId), sql`${s.teamMemberships.leftAt} IS NULL`));
          await db.insert(s.teamMemberships).values({ teamId: team.id, playerId: entityId, joinedAt: new Date() });
        }
      }
      break;
    }
    case "tournament": {
      const values = {
        name: rec.name,
        organizer: rec.organizer ?? null,
        tier: rec.tier ?? null,
        format: rec.format ?? null,
        region: rec.region ?? null,
        startDate: rec.startDate ?? null,
        endDate: rec.endDate ?? null,
        prizePool: rec.prizePool ?? null,
        status: rec.status ?? "upcoming",
        officialUrl: rec.officialUrl ?? null,
        updatedAt: new Date(),
      };
      if (entityId) await db.update(s.tournaments).set(values).where(eq(s.tournaments.id, entityId));
      else {
        const slug = slugify(rec.name);
        const [t] = await db.insert(s.tournaments).values({ ...values, slug }).onConflictDoUpdate({ target: s.tournaments.slug, set: values }).returning();
        entityId = t.id;
      }
      break;
    }
    case "match": {
      entityId = await storeMatch(db, adapter, rec, entityId, verification);
      touchedMatches.add(entityId);
      break;
    }
    case "placement": {
      const tournamentId = await entityIdFor(db, adapter.id, "tournament", rec.tournamentExternalId);
      if (!tournamentId) throw new Error(`Turnier ${rec.tournamentExternalId} unbekannt`);
      const { team } = await findOrCreateTeam(db, rec.teamName);
      await db.insert(s.tournamentParticipants).values({ tournamentId, teamId: team.id }).onConflictDoNothing();
      entityId = team.id;
      touchedTournaments.add(tournamentId);
      break;
    }
    case "social_post": {
      entityId = await storeSocialPost(db, adapter, rec, verification);
      break;
    }
  }

  await saveSourceRecord(db, adapter, rec, verification, hash, entityId);
  return existing ? "updated" : "created";
}

async function storeMatch(db: DB, adapter: SourceAdapter, rec: MatchRecord, entityId: string | null, verification: Verification) {
  const tournamentId = rec.tournamentExternalId ? await entityIdFor(db, adapter.id, "tournament", rec.tournamentExternalId) : null;
  const teamIds: string[] = [];
  for (const t of rec.teams) teamIds.push((await findOrCreateTeam(db, t.name)).team.id);
  const dedupeKey = matchDedupeKey(teamIds, rec.scheduledAt);

  if (!entityId && dedupeKey) {
    // Same match already imported from another source -> link instead of duplicating.
    const [dupe] = await db.select({ id: s.matches.id }).from(s.matches).where(eq(s.matches.dedupeKey, dedupeKey));
    entityId = dupe?.id ?? null;
  }

  const values = {
    ...(tournamentId ? { tournamentId } : {}),
    stage: rec.stage ?? null,
    roundLabel: rec.roundLabel ?? null,
    scheduledAt: rec.scheduledAt ?? null,
    status: rec.status,
    dedupeKey,
    updatedAt: new Date(),
  };
  if (entityId) await db.update(s.matches).set(values).where(eq(s.matches.id, entityId));
  else entityId = (await db.insert(s.matches).values(values).returning())[0].id;

  for (const teamId of teamIds) {
    await db.insert(s.matchParticipants).values({ matchId: entityId, teamId }).onConflictDoNothing();
  }

  if (rec.result) {
    const byName = new Map(rec.teams.map((t, i) => [normalizeName(t.name), teamIds[i]]));
    const winnerTeamId = rec.result.winnerName ? (byName.get(normalizeName(rec.result.winnerName)) ?? null) : null;
    const placements =
      rec.result.placements?.map((p) => ({ teamId: byName.get(normalizeName(p.name)) ?? "", placement: p.placement, score: p.score })).filter((p) => p.teamId) ??
      null;
    // A changed result from the same source supersedes its previous claim (correction).
    await db
      .update(s.resultClaims)
      .set({ supersededAt: new Date() })
      .where(and(eq(s.resultClaims.matchId, entityId), eq(s.resultClaims.source, adapter.id), sql`${s.resultClaims.supersededAt} IS NULL`));
    await db.insert(s.resultClaims).values({
      matchId: entityId,
      source: adapter.id,
      verification,
      winnerTeamId,
      placements,
      cashoutsDocumented: rec.result.cashoutsDocumented ?? false,
    });
  }
  return entityId;
}

async function storeSocialPost(db: DB, adapter: SourceAdapter, rec: SocialPostRecord, verification: Verification) {
  const text = `${rec.title ?? ""} ${rec.body}`;
  const infoType = classifyPost(text, rec.platform);
  const allTeams = await db.select({ id: s.teams.id, name: s.teams.name, aliases: s.teams.aliases }).from(s.teams);
  const teamIds = findTeamMentions(text, allTeams);

  let matchId: string | null = null;
  let tournamentId: string | null = null;
  const at = rec.publishedAt ?? new Date();
  if (teamIds.length >= 2) {
    const from = new Date(at.getTime() - 48 * 3600e3);
    const to = new Date(at.getTime() + 48 * 3600e3);
    const candidates = await db
      .select({ id: s.matches.id, tournamentId: s.matches.tournamentId, teamId: s.matchParticipants.teamId })
      .from(s.matches)
      .innerJoin(s.matchParticipants, eq(s.matchParticipants.matchId, s.matches.id))
      .where(and(gte(s.matches.scheduledAt, from), lte(s.matches.scheduledAt, to), inArray(s.matchParticipants.teamId, teamIds)));
    const hits = new Map<string, { n: number; tournamentId: string | null }>();
    for (const c of candidates) hits.set(c.id, { n: (hits.get(c.id)?.n ?? 0) + 1, tournamentId: c.tournamentId });
    const best = [...hits.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n)[0];
    if (best) {
      matchId = best[0];
      tournamentId = best[1].tournamentId;
    }
  }
  if (!tournamentId) {
    const ts = await db.select({ id: s.tournaments.id, name: s.tournaments.name }).from(s.tournaments);
    const norm = ` ${normalizeName(text)} `;
    tournamentId = ts.find((t) => normalizeName(t.name).length >= 5 && norm.includes(` ${normalizeName(t.name)} `))?.id ?? null;
  }

  const values = {
    platform: rec.platform,
    source: adapter.id,
    externalId: rec.externalId,
    accountHandle: rec.accountHandle,
    accountName: rec.accountName ?? null,
    accountKind: rec.accountKind,
    url: rec.url,
    title: rec.title ?? null,
    body: rec.body,
    publishedAt: rec.publishedAt ?? null,
    infoType,
    verification,
    tournamentId,
    matchId,
    teamIds,
    isLive: rec.isLive ?? false,
  };
  const [row] = await db
    .insert(s.socialPosts)
    .values(values)
    .onConflictDoUpdate({ target: [s.socialPosts.source, s.socialPosts.externalId], set: values })
    .returning();

  // Social media never sets a result. A result/correction post only flags the match for human review.
  if (matchId && (infoType === "result" || infoType === "result_correction")) {
    await db.update(s.matches).set({ needsReview: true }).where(eq(s.matches.id, matchId));
    await db.insert(s.auditLogs).values({
      actorKind: "sync",
      action: "match.flagged_for_review",
      entityType: "match",
      entityId: matchId,
      details: { socialPostId: row.id, url: rec.url, infoType },
    });
  }
  return row.id;
}
