import { closeDb, db } from "@/db";
import * as s from "@/db/schema";
import { recomputeMatch } from "@/domain/results-service";
import { assertNotProduction } from "@/lib/env";

/**
 * Simulated demo data for development and preview environments ONLY.
 * Everything is fictional, labelled "Demo", stored with verification "demo",
 * and demo markets can never settle real predictions. Refuses to run in production.
 */
async function main() {
  assertNotProduction("seed demo data");
  const d = db();
  const names = ["Demo Alpha", "Demo Bravo", "Demo Charlie", "Demo Delta"];
  const teams: (typeof s.teams.$inferSelect)[] = [];
  for (const name of names) {
    const [t] = await d
      .insert(s.teams)
      .values({ slug: name.toLowerCase().replace(/ /g, "-"), name, region: "Demo", aliases: [name.toLowerCase()] })
      .onConflictDoUpdate({ target: s.teams.slug, set: { name } })
      .returning();
    teams.push(t);
  }
  const now = Date.now();
  const [tournament] = await d
    .insert(s.tournaments)
    .values({
      slug: "demo-cup",
      name: "Demo Cup (simulierte Daten)",
      organizer: "Demo",
      format: "Vier Teams pro Runde, Cashout-Modus (simuliert)",
      status: "ongoing",
      startDate: new Date(now - 86400_000),
      endDate: new Date(now + 6 * 86400_000),
    })
    .onConflictDoUpdate({ target: s.tournaments.slug, set: { status: "ongoing" } })
    .returning();
  for (const t of teams) await d.insert(s.tournamentParticipants).values({ tournamentId: tournament.id, teamId: t.id }).onConflictDoNothing();

  const mk = async (label: string, offsetH: number) => {
    const [m] = await d
      .insert(s.matches)
      .values({ tournamentId: tournament.id, stage: "Gruppenphase", roundLabel: label, scheduledAt: new Date(now + offsetH * 3600_000) })
      .returning();
    for (const t of teams) await d.insert(s.matchParticipants).values({ matchId: m.id, teamId: t.id }).onConflictDoNothing();
    return m;
  };
  const past = await mk("Demo-Runde 1", -20);
  const upcoming = await mk("Demo-Runde 2", 30);

  await d.insert(s.resultClaims).values({
    matchId: past.id,
    source: "demo",
    verification: "demo",
    winnerTeamId: teams[1].id,
    placements: teams.map((t, i) => ({ teamId: t.id, placement: i === 1 ? 1 : i === 0 ? 2 : i + 1, score: null })),
    note: "Simuliertes Demo-Ergebnis",
  });

  for (const m of [past, upcoming]) {
    const [market] = await d
      .insert(s.markets)
      .values({
        question: `Wer gewinnt ${m.roundLabel}? (Demo)`,
        matchId: m.id,
        dataRequirement: "match_winner",
        settlementMode: "auto",
        closesAt: m.scheduledAt!,
        isDemo: true,
      })
      .returning();
    for (const t of teams) await d.insert(s.marketOutcomes).values({ marketId: market.id, label: t.name, teamId: t.id });
  }
  const [cashout] = await d
    .insert(s.markets)
    .values({
      question: "Höchster Cashout-Betrag in Demo-Runde 2 über 50'000? (Demo)",
      matchId: upcoming.id,
      dataRequirement: "cashout_stat",
      settlementMode: "unavailable",
      closesAt: upcoming.scheduledAt!,
      isDemo: true,
    })
    .returning();
  await d.insert(s.marketOutcomes).values([
    { marketId: cashout.id, label: "Ja" },
    { marketId: cashout.id, label: "Nein" },
  ]);

  await d.insert(s.socialPosts).values({
    platform: "web",
    source: "demo",
    externalId: `demo-${now}`,
    accountHandle: "demo",
    accountName: "Demo-Quelle",
    accountKind: "community",
    url: "https://example.com/demo",
    title: "Demo-Ankündigung",
    body: "Simulierter Beitrag: Demo Cup Runde 2 startet morgen.",
    publishedAt: new Date(),
    infoType: "schedule",
    verification: "demo",
    tournamentId: tournament.id,
  }).onConflictDoNothing();

  await recomputeMatch(d, past.id, { actorKind: "system" });
  console.log("Demo-Daten angelegt (alle als Demo gekennzeichnet).");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
