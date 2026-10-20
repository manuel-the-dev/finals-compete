# Abnahmeprotokoll

Stand: 2026-10-20. Status: **Erfüllt** · **Teilweise** (mit Begründung) · **Offen** (braucht einen Schritt des Eigentümers).

| # | Kriterium | Status | Nachweis / was fehlt |
|---|---|---|---|
| 1 | Entwicklung nur in der freigegebenen Remote-Umgebung | Erfüllt | Claude-Code-Cloud-Container (`CLAUDE_CODE_REMOTE=true`), eigenes Dateisystem, Postgres im Container, Git nur zu GitHub |
| 2 | Keine Dateien auf dem lokalen PC erstellt/verändert | Erfüllt | Kein Geräte- oder Ordnerzugriff verwendet |
| 3 | Liquipedia auf verfügbare, erlaubte Zugänge geprüft | Teilweise | Terms geprüft, LPDB-API gewählt, Scraping ausgeschlossen. Echter Abruf **nicht getestet**: kein Key, und die Netzwerkrichtlinie der Entwicklungsumgebung blockiert `liquipedia.net` |
| 4 | Social-Media-Quellen identifiziert und dokumentiert | Erfüllt | `docs/DATA_SOURCES.md`; konkrete Kanal-IDs muss der Eigentümer von offiziellen Seiten übernehmen (nicht erfunden) |
| 5 | Datenquellen modular austauschbar | Erfüllt | Adapter-Schnittstelle `src/sources/types.ts`, Registry, 6 Adapter |
| 6 | Importierte Daten mit Quellenreferenz | Erfüllt | `source_records` (URL, externe ID, Zeitstempel, Verifizierung); Anzeige auf Match-, Turnier-, Teamseiten; Test `pipeline.integration.test.ts` |
| 7 | Unbestätigtes nicht als offiziell ausgegeben | Erfüllt | `resolution.ts`, Badges „Vorläufig/Unbestätigt“; Tests |
| 8 | Unzuverlässige Resultate lösen keine automatische Abrechnung aus | Erfüllt | `autoSettleDecision`, Konflikt-Sperre, Social-Review-Sperre, DB-Regel für Cashout-Märkte; Tests |
| 9 | Reproduzierbar ohne persönliche Entwicklerdateien | Erfüllt | `npm ci`, Migrationen, `.env.example`, CI baut von Null |
| 10 | Quellcode und Daten exportierbar | Erfüllt | Git; JSON/CSV-Export (Admin + CLI), `pg_dump`; Roundtrip-Test |
| 11 | Übernahme anhand der Dokumentation möglich | Erfüllt | `TRANSFER_GUIDE.md`, `OWNER_HANDOVER_CHECKLIST.md`, `docs/*` |
| 12 | Übergabedokumentation vollständig (12 Punkte) | Erfüllt | `TRANSFER_GUIDE.md` §1–§12 |
| 13 | Backups und Wiederherstellung dokumentiert und getestet | Teilweise | Skripte im Container und in CI getestet; der tägliche Workflow gegen eine echte Produktionsdatenbank ist **erst nach dem Anlegen von Neon** testbar |
| 14 | Keine fest codierten Zugangsdaten | Erfüllt | Secrets nur über `src/lib/env.ts`; `.env*` ausser `.env.example` in `.gitignore` |
| 15 | Externe Abhängigkeiten und Kosten dokumentiert | Erfüllt | `TRANSFER_GUIDE.md` §11, `docs/ARCHITECTURE.md` |

## Verbleibende Einschränkungen

1. **Kein Live-Test der Datenquellen.** Alle Adapter sind mit synthetischen Antworten getestet. Feldnamen der LPDB- und FACEIT-Antworten folgen der Dokumentation und können abweichen; der erste echte Lauf zeigt Abweichungen als Warnungen in `/admin/sources`.
2. **Noch kein Deployment.** Vercel- und Neon-Projekte müssen vom Eigentümer angelegt werden (Konten auf seinen Namen); die Entwicklungsumgebung erreicht diese Dienste nicht.
3. **Cashout-/Rundendaten:** keine zuverlässige Quelle gefunden; entsprechende Märkte sind dauerhaft „nicht verfügbar“ für automatische Abrechnung.
4. **Social-Media-Klassifizierung** ist stichwortbasiert und kann Beiträge falsch einordnen. Sie beeinflusst nie Resultate, nur die Anzeige und die Prüf-Markierung.
5. **Match-Zusammenführung** über Quellen hinweg nutzt Teams + Stunde. Gleich benannte Teams mit unterschiedlicher Schreibweise werden als verschiedene Teams angelegt, bis ein Alias ergänzt wird (derzeit nur per SQL).
6. **Passwort-Reset** per E-Mail ist nicht umgesetzt (kein E-Mail-Anbieter, um Anbieterzahl klein zu halten). Admins können Passwörter mit `npm run admin:create` neu setzen.
7. **Repository ist öffentlich.** Enthält keine Secrets; auf Wunsch privat stellen (beachte: Actions-Minuten und Environment-Freigaben sind dann plan-abhängig).
