import type { Verification } from "@/db/schema";

/** Lower number = more trusted. Mirrors the hierarchy in docs/DATA_SOURCES.md. */
export const VERIFICATION_RANK: Record<Verification, number> = {
  manual: 0, // decided by an authorised admin, with a cited source
  official: 1, // publisher/organiser of the event
  database: 2, // established tournament database (Liquipedia)
  team_claim: 3, // team or player announcement
  unverified: 4, // community report
  demo: 5, // simulated demo data, never shown as real
};

export const VERIFICATION_LABEL: Record<Verification, string> = {
  manual: "Manuell geprüft",
  official: "Offiziell bestätigt",
  database: "Turnierdatenbank",
  team_claim: "Team-/Spielerangabe",
  unverified: "Unbestätigt",
  demo: "Demo-Daten",
};

/** Sources whose results may verify a match without human review. */
export function isAuthoritative(v: Verification) {
  return v === "official" || v === "database";
}
