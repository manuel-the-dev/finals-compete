import type { INFO_TYPES } from "@/db/schema";

type InfoType = (typeof INFO_TYPES)[number];

// Ordered: the first matching rule wins. English and German keywords.
const RULES: [InfoType, RegExp][] = [
  ["result_correction", /\b(correction|corrected|updated results?|korrektur|korrigiert)\b/i],
  ["cancellation", /\b(cancel+ed|cancel+ation|abgesagt|absage)\b/i],
  ["schedule_change", /\b(reschedul\w*|postponed|delayed|new (start )?time|verschoben|neue[rn]? (termin|zeit))\b/i],
  ["qualification", /\b(qualif\w+)\b/i],
  ["result", /\b(wins?|won|champions?|victory|takes? the title|results?|sieg\w*|gewinn\w*|1st place|grand final winner)\b/i],
  ["lineup_change", /\b(roster|line-?up|stand-?in|substitute|ersatzspieler)\b/i],
  ["transfer", /\b(joins|signs?(?!-)|signed|welcome|parted ways|leaves|departure|transfer|wechsel\w*)\b/i],
  ["tournament_announcement", /\b(announc\w+|sign-?ups?|registration|prize pool|preisgeld|anmeldung)\b/i],
  ["schedule", /\b(schedule|bracket|today|tomorrow|starts?|kick-?off|spielplan|heute|morgen)\b/i],
];

export function classifyPost(text: string, platform: string): InfoType {
  for (const [type, re] of RULES) if (re.test(text)) return type;
  if (platform === "twitch") return "stream";
  if (platform === "youtube") return "video";
  return "other";
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(name: string): string {
  return normalizeName(name).replace(/ /g, "-") || "unnamed";
}

/** Returns ids of teams whose name or alias appears as a whole word in the text. */
export function findTeamMentions(text: string, teams: { id: string; name: string; aliases: string[] }[]): string[] {
  const hay = ` ${normalizeName(text)} `;
  return teams
    .filter((t) =>
      [t.name, ...t.aliases]
        .map(normalizeName)
        .filter((n) => n.length >= 3)
        .some((n) => hay.includes(` ${n} `)),
    )
    .map((t) => t.id);
}
