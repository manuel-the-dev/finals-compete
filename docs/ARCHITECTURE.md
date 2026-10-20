# Architektur

Stand: 2026-10-20

## Überblick

```
                 ┌────────────────────────── GitHub (Repository + Actions) ──────────────────────────┐
                 │  CI (Tests, Build, Backup/Restore-Probe)   Sync (stündlich)   Backup (täglich)       │
                 │  Migrate (manuell, Freigabe)                                                         │
                 └───────────────┬───────────────────────────────┬──────────────────┬────────────────┘
                                 │ Deploy (Git-Integration)      │ npm run sync     │ pg_dump → verschlüsseltes Artefakt
                                 ▼                               ▼                  ▼
  Besucher ──► Vercel (Next.js: Seiten, Admin, API) ──────► Neon Postgres (Produktion, Preview-Branch)
                                                                 ▲
                         Liquipedia LPDB, FACEIT, YouTube, Twitch, X, Discord (nur über Adapter)
```

Drei Anbieter, alle mit dokumentierter Übertragbarkeit:

| Dienst | Aufgabe | Übertragung |
|---|---|---|
| GitHub | Code, CI, Hintergrundjobs, Backups (Artefakte) | Repository-Transfer an Person oder Organisation |
| Vercel | Hosting der Website | „Transfer Project“ zwischen Teams, inkl. Domains und Env-Variablen ([Doku](https://vercel.com/docs/projects/transferring-projects)) |
| Neon | Postgres-Datenbank | Projekt-Transfer zwischen Organisationen, Verbindungsdaten bleiben gleich ([Doku](https://neon.com/docs/manage/orgs-project-transfer)) |

Wichtig: Neon darf **nicht** über die Vercel-Marketplace-Integration verbunden werden. Neon kann Projekte mit Vercel- oder GitHub-Integration nicht übertragen. Die Verbindung erfolgt nur über die Umgebungsvariable `DATABASE_URL`.

Render wurde geprüft und verworfen, weil kein dokumentierter Weg existiert, Dienste zwischen Workspaces zu übertragen.

## Code-Struktur

| Pfad | Inhalt |
|---|---|
| `src/db/schema.ts` | Datenmodell (Drizzle). Änderungen → `npm run db:generate` erzeugt SQL in `drizzle/` |
| `src/sources/` | Import-System: `types.ts` (Adapter-Schnittstelle), `pipeline.ts` (Abruf → Validierung → Normalisierung → Duplikaterkennung → Änderungserkennung → Speichern → Protokoll), `http.ts` (Rate-Limits), `adapters/*` |
| `src/domain/` | Fachlogik ohne UI: `resolution.ts` (Ergebnis aus mehreren Quellen), `settlement.ts` (Auszahlung, Regeln für automatische Abrechnung), `results-service.ts` (DB-Anwendung), `classify.ts` |
| `src/app/` | Website, Admin (`/admin/*`), API (`/api/health`, `/api/cron/sync`, `/api/admin/export`) |
| `src/lib/` | Konfiguration (`env.ts`, einzige Stelle, an der Secrets gelesen werden), Auth, Wallet, Export |
| `scripts/` | CLI: Migration, Sync, Export/Import, Backup/Restore, Admin anlegen, Demo-Daten |
| `.github/workflows/` | CI, Sync, Migration, Backup |

## Datenmodell (Kurzfassung)

- **Wettbewerb:** `teams`, `players`, `team_memberships` (Lineups), `tournaments`, `tournament_participants` (Platzierung + deren Verifizierungsstatus), `matches`, `match_participants` (mehrere Teams pro Match möglich).
- **Herkunft:** `source_records` speichert für jeden importierten Datensatz Quelle, externe ID, Original-URL, Verifizierungsstatus, Inhalts-Hash, Rohdaten, erstes/letztes Sehen und letzte Änderung. Eindeutig über (Quelle, Typ, externe ID).
- **Ergebnisse:** `result_claims` (jede Quelle meldet ihr Ergebnis), daraus berechnet `resolution.ts` den Status des Matches (`none`, `provisional`, `verified`, `conflict`). `conflicts` hält Widersprüche bis zur Admin-Entscheidung.
- **Social Media:** `social_posts` mit Plattform, Account, Account-Art, URL, Veröffentlichungs- und Importzeit, Art der Information, Verifizierung, zugeordneten Teams/Match/Turnier.
- **Sync:** `data_sources` (aktiv, Intervall, letzte Erfolge/Fehler, Request-Log für Limits), `sync_runs` (jeder Lauf mit Zählern, Fehlern, Warnungen).
- **Märkte:** `markets` (benötigte Daten, Abrechnungsmodus, Status), `market_outcomes`, `predictions`, `wallet_transactions` (nur Anhängen; Saldo = Summe), `audit_logs`.

Eine Datenbank-Regel (`CHECK`) verhindert, dass ein Cashout- oder Rundenereignis-Markt jemals auf automatische Abrechnung gestellt wird.

## Umgebungen

| Umgebung | Datenbank | Wo konfiguriert | Migrationen |
|---|---|---|---|
| Development | eigene DB im Cloud-Workspace | `.env.development.local` (nicht in Git) | `npm run db:migrate` |
| Test | DB mit „test“ im Namen | `TEST_DATABASE_URL` | Tests setzen das Schema neu auf; andere Namen werden verweigert |
| Preview | Neon-Branch `preview` | Vercel „Preview“-Variablen, GitHub-Environment `preview` | automatisch beim Preview-Build |
| Production | Neon-Hauptbranch | Vercel „Production“-Variablen, GitHub-Environment `production` | nur über Workflow „Migrate database“; der Produktions-Build bricht ab, wenn Migrationen fehlen |

Schutzmechanismen: Demo-Daten und JSON-Import verweigern `APP_ENV=production`; `restore.sh` verlangt eine ausdrückliche Bestätigung für Produktion und nutzt bewusst `TARGET_DATABASE_URL` statt `DATABASE_URL`; Tests laufen nur gegen Datenbanken mit „test“ im Namen.

## Hintergrundjobs

| Job | Zeitplan | Wo |
|---|---|---|
| Datenquellen synchronisieren | stündlich (jede Quelle mit eigenem Intervall und Budget) | `.github/workflows/sync.yml` |
| Datenbank-Backup + Restore-Probe | täglich 02:30 UTC | `.github/workflows/backup.yml` |
| Alternative: HTTP-Cron | z. B. Vercel Cron auf `/api/cron/sync` mit `CRON_SECRET` | `src/app/api/cron/sync/route.ts` |

Sync und Backup sind ausgeschaltet, bis die Repository-Variablen `SYNC_ENABLED=true` bzw. `BACKUP_ENABLED=true` gesetzt sind.
