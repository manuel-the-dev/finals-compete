"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { clearReview, dismissConflict, setManualResult, settleMarket } from "@/domain/results-service";
import { getSession, requireAdmin, requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { placePrediction } from "@/lib/wallet";
import { runSync } from "@/sources/pipeline";
import { getAdapter } from "@/sources/registry";

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function registerAction(form: FormData) {
  const parsed = z
    .object({ email: z.email(), password: z.string().min(10), displayName: z.string().min(2).max(40) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) fail("/register", "Bitte gültige E-Mail, Name und Passwort (min. 10 Zeichen) angeben.");
  const email = parsed.data.email.toLowerCase();
  const [exists] = await db().select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (exists) fail("/register", "E-Mail ist bereits registriert.");
  const [u] = await db()
    .insert(s.users)
    .values({ email, passwordHash: await bcrypt.hash(parsed.data.password, 12), displayName: parsed.data.displayName })
    .returning();
  await db().insert(s.walletTransactions).values({ userId: u.id, amount: env().STARTING_BALANCE, kind: "grant", note: "Startguthaben (virtuell)" });
  const session = await getSession();
  session.userId = u.id;
  await session.save();
  redirect("/markets");
}

export async function loginAction(form: FormData) {
  const email = String(form.get("email") ?? "").toLowerCase();
  const password = String(form.get("password") ?? "");
  const [u] = await db().select().from(s.users).where(eq(s.users.email, email));
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) fail("/login", "E-Mail oder Passwort falsch.");
  const session = await getSession();
  session.userId = u.id;
  await session.save();
  redirect(u.role === "admin" ? "/admin" : "/markets");
}

export async function logoutAction() {
  const session = await getSession();
  session.destroy();
  redirect("/");
}

export async function predictAction(form: FormData) {
  const user = await requireUser();
  const marketId = String(form.get("marketId"));
  try {
    await placePrediction(db(), user.id, marketId, String(form.get("outcomeId")), Number(form.get("stake")));
  } catch (err) {
    fail(`/markets/${marketId}`, err instanceof Error ? err.message : "Fehler");
  }
  revalidatePath(`/markets/${marketId}`);
  redirect(`/markets/${marketId}?ok=1`);
}

// --------------------------- admin ---------------------------

export async function updateSourceAction(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  const enabled = form.get("enabled") === "on";
  const interval = Math.max(5, Number(form.get("intervalMinutes")) || 60);
  await db().update(s.dataSources).set({ enabled, intervalMinutes: interval, updatedAt: new Date() }).where(eq(s.dataSources.id, id));
  await db().insert(s.auditLogs).values({ actorKind: "admin", actorUserId: admin.id, action: "source.updated", entityType: "data_source", entityId: id, details: { enabled, interval } });
  revalidatePath("/admin/sources");
}

export async function runSourceAction(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  const summary = await runSync(db(), env(), getAdapter(id), { trigger: "manual" });
  await db().insert(s.auditLogs).values({ actorKind: "admin", actorUserId: admin.id, action: "source.manual_sync", entityType: "data_source", entityId: id, details: { status: summary.status } });
  revalidatePath("/admin/sources");
  redirect(`/admin/sources?ran=${id}&status=${summary.status}`);
}

export async function manualResultAction(form: FormData) {
  const admin = await requireAdmin();
  const matchId = String(form.get("matchId"));
  try {
    await setManualResult(db(), matchId, String(form.get("winnerTeamId")), admin.id, String(form.get("sourceUrl") ?? ""), String(form.get("note") ?? ""));
  } catch (err) {
    fail("/admin/conflicts", err instanceof Error ? err.message : "Fehler");
  }
  revalidatePath("/admin/conflicts");
  redirect("/admin/conflicts?ok=1");
}

export async function clearReviewAction(form: FormData) {
  const admin = await requireAdmin();
  await clearReview(db(), String(form.get("matchId")), admin.id, String(form.get("note") ?? ""));
  revalidatePath("/admin/conflicts");
}

export async function dismissConflictAction(form: FormData) {
  const admin = await requireAdmin();
  try {
    await dismissConflict(db(), String(form.get("conflictId")), admin.id, String(form.get("note") ?? ""));
  } catch (err) {
    fail("/admin/conflicts", err instanceof Error ? err.message : "Fehler");
  }
  revalidatePath("/admin/conflicts");
}

export async function settleManuallyAction(form: FormData) {
  const admin = await requireAdmin();
  const marketId = String(form.get("marketId"));
  const sourceUrl = String(form.get("sourceUrl") ?? "");
  const voidIt = form.get("void") === "1";
  if (!voidIt && !/^https?:\/\//.test(sourceUrl)) fail("/admin/markets", "Für eine manuelle Abrechnung ist eine Quell-URL Pflicht.");
  try {
    await settleMarket(db(), marketId, voidIt ? null : String(form.get("outcomeId")), {
      actorKind: "admin",
      userId: admin.id,
      sourceUrl: sourceUrl || undefined,
      note: String(form.get("note") ?? ""),
      void: voidIt,
    });
  } catch (err) {
    fail("/admin/markets", err instanceof Error ? err.message : "Fehler");
  }
  revalidatePath("/admin/markets");
}

export async function createMarketAction(form: FormData) {
  const admin = await requireAdmin();
  const matchId = String(form.get("matchId") || "") || null;
  const dataRequirement = String(form.get("dataRequirement")) as (typeof s.markets.$inferInsert)["dataRequirement"];
  // Only winner markets may settle automatically; everything else needs a reliable source and a human.
  const settlementMode = dataRequirement === "match_winner" || dataRequirement === "tournament_winner" ? "auto" : dataRequirement === "custom" ? "manual_only" : "unavailable";
  const [m] = await db()
    .insert(s.markets)
    .values({
      question: String(form.get("question")),
      matchId,
      tournamentId: String(form.get("tournamentId") || "") || null,
      dataRequirement,
      settlementMode,
      closesAt: new Date(String(form.get("closesAt"))),
    })
    .returning();
  const labels = String(form.get("outcomes") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (matchId && dataRequirement === "match_winner" && labels.length === 0) {
    const parts = await db().select({ id: s.teams.id, name: s.teams.name }).from(s.matchParticipants).innerJoin(s.teams, eq(s.teams.id, s.matchParticipants.teamId)).where(eq(s.matchParticipants.matchId, matchId));
    for (const p of parts) await db().insert(s.marketOutcomes).values({ marketId: m.id, label: p.name, teamId: p.id });
  } else if (m.tournamentId && dataRequirement === "tournament_winner" && labels.length === 0) {
    const parts = await db().select({ id: s.teams.id, name: s.teams.name }).from(s.tournamentParticipants).innerJoin(s.teams, eq(s.teams.id, s.tournamentParticipants.teamId)).where(eq(s.tournamentParticipants.tournamentId, m.tournamentId));
    for (const p of parts) await db().insert(s.marketOutcomes).values({ marketId: m.id, label: p.name, teamId: p.id });
  } else {
    for (const label of labels) await db().insert(s.marketOutcomes).values({ marketId: m.id, label });
  }
  await db().insert(s.auditLogs).values({ actorKind: "admin", actorUserId: admin.id, action: "market.created", entityType: "market", entityId: m.id, details: { settlementMode } });
  revalidatePath("/admin/markets");
}
