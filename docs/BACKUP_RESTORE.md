# Backup und Wiederherstellung

## Was automatisch passiert

| Sicherung | Wann | Wo | Aufbewahrung |
|---|---|---|---|
| Vollständiger `pg_dump` (Schema + Daten inkl. Zugangsdaten) | täglich 02:30 UTC, Workflow „Backup database“ | GitHub-Artefakt, mit `BACKUP_PASSPHRASE` AES-256 verschlüsselt, also ausserhalb von Neon und ausserhalb jeder Entwicklungsumgebung | 30 Tage (`retention-days` im Workflow) |
| Wiederherstellungstest | bei jedem Backup | Der Dump wird vor dem Verschlüsseln in eine leere Postgres-17-Instanz zurückgespielt; schlägt das fehl, schlägt der Workflow fehl | – |
| Neon Point-in-Time-Restore | laufend | Neon | Free: 6 h; Launch: bis 7 Tage; Scale: bis 30 Tage ([Neon FAQ](https://neon.com/faqs/managed-postgres-providers-point-in-time-recovery)) |
| CI-Backup-Probe | bei jedem Push | CI mit Demo-Daten | – |

Einmalig einrichten: Repository-Variable `BACKUP_ENABLED=true`, im Environment `production` die Secrets `DATABASE_URL` (direkte, nicht gepoolte Verbindung) und `BACKUP_PASSPHRASE` (lange Zufallsfolge, zusätzlich im Passwortmanager des Eigentümers ablegen; ohne sie sind die Backups nicht lesbar).

## Was manuell passiert

- **Vor riskanten Änderungen** (Migration, Massenänderung, Übergabe): Workflow „Backup database“ über „Run workflow“ starten.
- **Langzeitarchiv:** Mindestens monatlich ein Backup-Artefakt herunterladen und an einem zweiten Ort ablegen (z. B. Firmen-Cloudspeicher). GitHub-Artefakte verfallen nach 30 Tagen.
- **Wiederherstellungsübung:** Vierteljährlich ein Artefakt herunterladen, entschlüsseln und in eine leere Datenbank zurückspielen (siehe unten).

## Fehlgeschlagene Backups

GitHub sendet bei fehlgeschlagenen geplanten Workflows eine E-Mail an die Person, die den Workflow zuletzt geändert hat, bzw. an Repository-Admins mit aktivierten Actions-Benachrichtigungen. Vorgehen: Log öffnen, Ursache beheben (häufig: abgelaufenes Passwort in `DATABASE_URL`, Postgres-Version des Servers neuer als der Client), Workflow manuell neu starten. Zwei Tage in Folge ohne erfolgreiches Backup → sofort ein manuelles Backup mit `npm run backup` aus einem Cloud-Workspace erstellen.

## Wiederherstellen

```bash
# 1. Artefakt in GitHub herunterladen (Actions → Backup database → Lauf → Artifacts) und entpacken
gpg --decrypt finals-compete-<zeit>.dump.gpg > finals-compete-<zeit>.dump

# 2. In eine LEERE Datenbank zurückspielen (z. B. neuer Neon-Branch oder neues Neon-Projekt)
TARGET_DATABASE_URL='postgres://…/neondb' bash scripts/restore.sh finals-compete-<zeit>.dump
# Für Produktion zusätzlich: APP_ENV=production … --i-know-this-is-production
```

Mit Neon ist meist schneller: Branch zum gewünschten Zeitpunkt erstellen (Point-in-Time), prüfen, dann `DATABASE_URL` in Vercel und GitHub auf den Branch umstellen.

## Wiederherstellung nach fehlgeschlagenem Deployment

1. **Nur Code kaputt:** In Vercel → Deployments das letzte funktionierende Deployment „Promote to Production“ / „Instant Rollback“. Datenbank bleibt unverändert.
2. **Migration kaputt:** Migrationen sind so zu schreiben, dass sie nur erweitern (neue Spalten/Tabellen), damit der alte Code weiterläuft. Ist das nicht möglich: Vor der Migration manuelles Backup (oben), bei Problemen Neon-Branch vom Zeitpunkt vor der Migration wiederherstellen und Code zurückrollen.
3. Danach `/api/health` und die Checkliste in `TRANSFER_GUIDE.md` Abschnitt 9 durchgehen.

## Geschäftsdaten-Export (JSON/CSV)

Zusätzlich zum Dump: Admin → Export oder `npm run export`. Enthält alle Tabellen mit IDs und Beziehungen, ohne Passwort-Hashes; E-Mail-Adressen nur auf ausdrücklichen Wunsch. Wiederherstellung mit `npm run import -- export.json` in eine leere, migrierte Datenbank. Nach so einem Import müssen sich Nutzer neu registrieren bzw. ein Admin neu angelegt werden, weil Passwörter nicht exportiert werden.

## Getestet (2026-10-20, Cloud-Container)

- `scripts/backup.sh` → `scripts/restore.sh` in eine zweite Datenbank: Zeilenzahlen identisch, Checksumme geprüft.
- `restore.sh` verweigert Produktion ohne Bestätigung.
- JSON-Export → Import in leere Datenbank: alle Tabellen mit identischen IDs, erneuter Export identisch (automatischer Test).
- Noch **nicht** getestet: der Workflow auf GitHub gegen eine echte Neon-Datenbank (es existiert noch keine).
