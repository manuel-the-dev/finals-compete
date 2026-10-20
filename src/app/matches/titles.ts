import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";

/** "Team A vs Team B (vs ...)" for a list of match ids. */
export async function matchTitles(ids: string[]) {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await db()
    .select({ matchId: s.matchParticipants.matchId, name: s.teams.name })
    .from(s.matchParticipants)
    .innerJoin(s.teams, eq(s.teams.id, s.matchParticipants.teamId))
    .where(inArray(s.matchParticipants.matchId, ids));
  for (const id of ids) map.set(id, rows.filter((r) => r.matchId === id).map((r) => r.name).join(" vs ") || "Teams offen");
  return map;
}
