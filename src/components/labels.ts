export const STATUS_LABEL = {
  open: "Offen",
  locked: "Geschlossen",
  settlement_blocked: "Abrechnung gesperrt (Prüfung)",
  settled: "Abgerechnet",
  voided: "Annulliert",
} as const;

export const MODE_LABEL = {
  auto: "Automatische Abrechnung bei bestätigtem Ergebnis",
  manual_only: "Nur manuelle Abrechnung mit Quellenangabe",
  unavailable: "Keine zuverlässige Datenquelle: keine automatische Abrechnung",
} as const;
