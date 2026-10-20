import type { Verification } from "@/db/schema";
import { VERIFICATION_LABEL } from "@/domain/verification";

export function VerificationBadge({ v }: { v: Verification | null | undefined }) {
  if (!v) return <span className="badge muted">Keine Quelle</span>;
  return <span className={`badge b-${v}`}>{VERIFICATION_LABEL[v]}</span>;
}

const RESULT_LABEL = {
  none: "Kein Ergebnis",
  provisional: "Vorläufig (unbestätigt)",
  verified: "Bestätigt",
  conflict: "Widersprüchlich, in Prüfung",
} as const;

export function ResultBadge({ status }: { status: keyof typeof RESULT_LABEL }) {
  const cls = status === "verified" ? "b-official" : status === "conflict" ? "b-bad" : "b-unverified";
  return <span className={`badge ${cls}`}>{RESULT_LABEL[status]}</span>;
}

export function fmtDate(d: Date | null | undefined) {
  if (!d) return "offen";
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
}
