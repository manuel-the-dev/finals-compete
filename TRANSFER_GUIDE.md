# Übergabe-Anleitung (Transfer Guide)

Diese Anleitung beschreibt, wie FINALS COMPETE vollständig an eine neue Eigentümerin, einen neuen Eigentümer oder ein Unternehmen übergeben wird. Sie ist für technisch versierte und weniger versierte Personen geschrieben: Jeder Schritt sagt, **wo** man klickt und **wie** man prüft, ob es geklappt hat.

Für die Übergabe braucht niemand Zugriff auf einen bestimmten PC. Alles läuft über Weboberflächen von GitHub, Vercel, Neon und dem Domain-Anbieter.

> Begriffe: **Bisheriger Eigentümer** = wer das Projekt heute besitzt. **Neuer Eigentümer** = wer es übernimmt. **Secret** = geheimer Wert (Passwort, API-Schlüssel). Secrets werden nie per Chat oder E-Mail geschickt, sondern direkt in die jeweilige Plattform eingetragen oder über einen Passwortmanager mit Freigabe-Funktion geteilt.

---

## 1. Welche Konten benötigt werden

| Konto | Wofür | Empfehlung |
|---|---|---|
| GitHub | Quellcode, automatische Jobs (Sync, Backups, Tests), Backup-Dateien | GitHub-**Organisation** des neuen Eigentümers (nicht nur ein persönliches Konto) |
| Vercel | Website-Hosting | Vercel-**Team** des neuen Eigentümers. Hobby ist nur für nicht-kommerzielle Nutzung erlaubt; bei Einnahmen (Werbung, Abos) ist Pro nötig |
| Neon | Datenbank | Neon-**Organisation** des neuen Eigentümers |
| Domain-Registrar | Domain (z. B. bei Vercel, Cloudflare, Infomaniak, Namecheap) | Konto des neuen Eigentümers beim gleichen oder einem neuen Registrar |
| Liquipedia | API-Schlüssel | neuer Antrag auf den neuen Eigentümer (Schlüssel dürfen nicht weitergegeben werden) |
| FACEIT Developer, Twitch Developer, X Developer, Discord Developer | API-Zugänge, nur falls genutzt | jeweils neue App/Key auf den neuen Eigentümer |
| Passwortmanager | Ablage von `BACKUP_PASSPHRASE` und Admin-Zugang | z. B. geteilte Tresore in Bitwarden/1Password |

Mindestens zwei Personen des neuen Eigentümers sollten in GitHub, Vercel und Neon Admin-Rechte haben, damit kein einzelnes Konto alles kontrolliert.

## 2. Git-Repository übertragen

1. Neuer Eigentümer erstellt eine GitHub-Organisation (github.com → „+“ → New organization) und nennt dem bisherigen Eigentümer den Namen.
2. Bisheriger Eigentümer: Repository → **Settings** → ganz unten **Danger Zone** → **Transfer ownership** → Organisation eintragen → bestätigen.
3. Neuer Eigentümer nimmt die Übertragung an (E-Mail von GitHub), falls verlangt.
4. Prüfen: Repository ist unter `github.com/<neue-org>/finals-compete` erreichbar, Commits und Issues sind da. GitHub leitet die alte Adresse weiter.
5. Unter **Settings → Secrets and variables → Actions** und **Settings → Environments** prüfen, welche Secrets und Variablen noch vorhanden sind. Unabhängig davon werden alle Secrets in Schritt 6 erneuert.
6. Benötigte Environments: `production` und `preview`. Bei `production` unter „Deployment protection rules“ **Required reviewers** setzen (bei privaten Repos nur in kostenpflichtigen GitHub-Plänen verfügbar).

Hinweis: Das Repository war zum Zeitpunkt des Schreibens **öffentlich**. Der Code enthält keine Secrets. Soll es privat sein: Settings → Danger Zone → Change visibility.

## 3. Deployment (Vercel) übertragen

1. Neuer Eigentümer erstellt ein Vercel-Team und lädt den bisherigen Eigentümer als Mitglied ein.
2. Bisheriger Eigentümer: Vercel → Projekt → **Settings → General → Transfer Project** → Ziel-Team wählen. Vercel zeigt vor dem Bestätigen, welche Domains und Umgebungsvariablen mitwandern ([Vercel-Doku](https://vercel.com/docs/projects/transferring-projects)). Die Übertragung erfolgt laut Vercel ohne Ausfallzeit.
3. Falls das Projekt aus einem persönlichen Hobby-Konto kommt: Vercel empfiehlt, vorher die Git-Verbindung zu trennen und nach dem Transfer neu mit dem (inzwischen übertragenen) Repository zu verbinden: Projekt → Settings → Git.
4. Prüfen: Projekt erscheint im neuen Team, unter Settings → Environment Variables sind Production- und Preview-Werte vorhanden, ein neuer Push auf `main` löst ein Deployment aus.

Alternative ohne Transfer: Im neuen Vercel-Team **New Project → Import** des Repositories, Umgebungsvariablen aus `.env.example` neu setzen, Domain umziehen. Die Konfiguration steht vollständig in `vercel.json` und `.env.example`.

## 4. Domain übertragen

Es gibt zwei Teile: den **Besitz** der Domain (beim Registrar) und die **DNS-Einträge**, die auf Vercel zeigen.

- **Domain bei Vercel gekauft:** Wandert mit „Transfer Project“, wenn sie im Projekt verwendet wird. Sonst Vercel → Domains → Domain → **Move**.
- **Domain bei einem anderen Registrar:** Beim Registrar den Eigentümerwechsel („Owner change“/„Push“ an ein anderes Konto) oder einen Registrar-Transfer mit Auth-Code durchführen. Ablauf und Gebühren hängen vom Registrar und der Endung ab (.ch-Domains z. B. über den Registrar, nicht direkt bei SWITCH).
- **DNS:** Die nötigen Einträge zeigt Vercel unter Projekt → Settings → Domains (typisch: `A`-Eintrag für die Hauptdomain, `CNAME` für `www`). Werte genau so übernehmen. Vor einem Registrar-Wechsel alle DNS-Einträge abfotografieren/exportieren.
- Prüfen: `https://<domain>/api/health` liefert `{"ok":true,...}`, HTTPS-Zertifikat gültig.

## 5. Datenbank exportieren und wiederherstellen

**Empfohlen: Neon-Projekt übertragen** (keine Datenkopie nötig, Verbindungsdaten bleiben gleich).
1. Neuer Eigentümer lädt den bisherigen Eigentümer als Mitglied in seine Neon-Organisation ein.
2. Bisheriger Eigentümer: Neon → Projekt → **Settings → Transfer** → Ziel-Organisation ([Neon-Doku](https://neon.com/docs/manage/orgs-project-transfer)). Voraussetzung: Admin in der Quell- und mindestens Member in der Ziel-Organisation. Projekte mit Vercel- oder GitHub-Integration lassen sich nicht übertragen; deshalb ist die Datenbank in diesem Projekt nur über `DATABASE_URL` verbunden.
3. Danach Datenbank-Passwort in Neon zurücksetzen (Roles → Reset password) und die neue `DATABASE_URL` überall eintragen (Schritt 7).

**Alternative: Kopie bei beliebigem Postgres-Anbieter** (macht unabhängig von Neon):
1. GitHub → Actions → „Backup database“ → **Run workflow**; Artefakt herunterladen und mit `BACKUP_PASSPHRASE` entschlüsseln (`docs/BACKUP_RESTORE.md`).
2. Leere Postgres-Datenbank (Version 16 oder neuer) beim neuen Anbieter anlegen.
3. `TARGET_DATABASE_URL=… bash scripts/restore.sh <datei>.dump` aus einem Cloud-Workspace (z. B. GitHub Codespaces) ausführen.
4. Zusätzlich gibt es einen anbieterunabhängigen JSON/CSV-Export aller Geschäftsdaten (Admin → Export oder `npm run export`).

Gespeicherte Dateien und Assets: Die Anwendung speichert keine hochgeladenen Dateien. Alle Inhalte liegen in der Datenbank, statische Dateien im Repository.

## 6. Welche API-Keys erneuert werden müssen

Alle Schlüssel werden bei der Übergabe **neu erstellt** und die alten danach widerrufen. Das ist sicherer als Weitergeben und bei Liquipedia Pflicht.

| Secret | Neu erstellen bei | Danach alten Wert widerrufen |
|---|---|---|
| `SESSION_SECRET` | selbst erzeugen (`openssl rand -base64 48` oder Passwortgenerator, min. 32 Zeichen); alle Nutzer müssen sich neu einloggen | – |
| `CRON_SECRET` | selbst erzeugen (nur bei HTTP-Cron) | – |
| `BACKUP_PASSPHRASE` | selbst erzeugen; **alten Wert aufbewahren**, solange alte Backups gebraucht werden | – |
| `DATABASE_URL` | Neon → Roles → Reset password | automatisch |
| `LIQUIPEDIA_API_KEY` | neuer Antrag über liquipedia.net/api-terms-of-use | Liquipedia informieren |
| `FACEIT_API_KEY` | developers.faceit.com → App → API Keys | dort löschen |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | dev.twitch.tv → Console → Applications | alte App löschen |
| `X_BEARER_TOKEN` | X Developer Console (Kreditguthaben/Abrechnung beim neuen Eigentümer) | Token regenerieren |
| `DISCORD_BOT_TOKEN` | discord.com/developers → neue Application → Bot; Bot in den Discord-Server des neuen Eigentümers einladen; Server-Eigentum ggf. übertragen | alten Bot entfernen |

## 7. Umgebungsvariablen sicher übertragen

Liste aller Variablen mit Beschreibung: `.env.example` im Repository. Sie enthält nur Platzhalter.

| Wo | Was |
|---|---|
| Vercel → Settings → Environment Variables, **Production** | `APP_ENV=production`, `DATABASE_URL` (Neon, gepoolte Verbindung), `SESSION_SECRET`, `PUBLIC_BASE_URL`, `SOURCE_USER_AGENT`, optional die Source-Keys für „Jetzt synchronisieren“ |
| Vercel → **Preview** | `APP_ENV=preview`, `DATABASE_URL` des Neon-Branches `preview`, eigenes `SESSION_SECRET` |
| GitHub → Environments → `production` → Secrets | `DATABASE_URL` (direkte Verbindung), `SESSION_SECRET`, `BACKUP_PASSPHRASE`, alle Source-Keys |
| GitHub → Environments → `production` → Variables | `SOURCE_USER_AGENT`, `FACEIT_CHAMPIONSHIP_IDS`, `YOUTUBE_CHANNELS`, `TWITCH_CHANNELS`, `X_ACCOUNTS`, `DISCORD_CHANNELS`, `LIQUIPEDIA_WIKI` |
| GitHub → Environments → `preview` → Secrets | `DATABASE_URL` des Preview-Branches, `SESSION_SECRET` |
| GitHub → Settings → Secrets and variables → Actions → **Variables** (Repository) | `SYNC_ENABLED=true`, `BACKUP_ENABLED=true` |

Regeln: Werte nur direkt in die Weboberfläche tippen oder aus einem geteilten Passwortmanager kopieren. Nie per Chat, E-Mail oder in einer Datei im Repository. Production und Preview bekommen unterschiedliche Datenbanken und unterschiedliche `SESSION_SECRET`.

## 8. Hintergrundjobs einrichten

Alle Jobs sind GitHub-Actions-Workflows im Repository und wandern mit dem Repository mit.

| Workflow | Aufgabe | Aktivieren |
|---|---|---|
| CI | Tests, Build, Backup/Restore-Probe bei jedem Push | läuft automatisch |
| Sync data sources | stündlich; jede Quelle hat eigenes Intervall in `/admin/sources` | Variable `SYNC_ENABLED=true` + Secrets in `production` |
| Backup database | täglich 02:30 UTC, mit Restore-Test | Variable `BACKUP_ENABLED=true` + `BACKUP_PASSPHRASE` |
| Migrate database | manuell, bei neuen Migrationen | Actions → Migrate database → Run workflow → Umgebung wählen |

Nach dem Repository-Transfer: Actions → bei jedem Workflow prüfen, dass er nicht deaktiviert ist (GitHub deaktiviert geplante Workflows in Repositories ohne Aktivität nach 60 Tagen). Einmal „Sync data sources“ und „Backup database“ manuell starten und auf grünes Ergebnis warten.

Alternative ohne GitHub Actions: Vercel Cron oder ein anderer HTTP-Cron ruft `GET /api/cron/sync` mit Header `Authorization: Bearer <CRON_SECRET>` auf.

## 9. Website nach dem Transfer testen

1. `https://<domain>/api/health` → `"ok": true` und `"env": "production"`.
2. Startseite, Turniere, Teams, Märkte, News laden ohne Fehler.
3. Admin anlegen bzw. prüfen: in einem Cloud-Workspace `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run admin:create` mit der Produktions-`DATABASE_URL`. Einloggen, `/admin` öffnen.
4. `/admin/sources`: jede genutzte Quelle zeigt „Verbunden“ nach einem Klick auf „Jetzt synchronisieren“ (oder dem nächsten Sync-Lauf). Fehlende Variablen werden dort beim Namen genannt.
5. GitHub → Actions: „Sync data sources“ und „Backup database“ einmal manuell ausführen, beide grün.
6. Testkonto registrieren, Startguthaben sichtbar, auf einen offenen Markt tippen, Wallet zeigt den Einsatz.
7. Admin → Export → JSON herunterladen; Datei enthält Daten.
8. Audit-Log in `/admin` zeigt die Aktionen.

## 10. Rollback

- **Website:** Vercel → Deployments → letztes funktionierendes Deployment → „Instant Rollback“.
- **Datenbank:** Neon → Branches → Branch vom Zeitpunkt vor der Änderung erstellen (Point-in-Time), prüfen, `DATABASE_URL` darauf umstellen. Oder Backup-Artefakt zurückspielen (`docs/BACKUP_RESTORE.md`).
- **Abgebrochene Übergabe:** Repository, Vercel-Projekt und Neon-Projekt lassen sich auf demselben Weg zurückübertragen. Deshalb alte Keys erst widerrufen, wenn Schritt 9 vollständig grün ist.
- **Domain:** alte DNS-Einträge (Schritt 4, Foto/Export) wieder eintragen.

## 11. Anbietergebühren (Richtwerte, Stand Oktober 2026, vor Entscheidung auf den Preisseiten prüfen)

| Anbieter | Gratis | Kostenpflichtig | Wann nötig |
|---|---|---|---|
| GitHub | Öffentliche Repos: Actions gratis. Private: 2'000 Actions-Minuten/Monat, 500 MB Artefakt-Speicher | Team-Plan pro Nutzer; zusätzliche Minuten ca. 0.006 USD/min (Linux) | Private Repos mit Freigabe-Pflicht für Produktion; viele Sync-Läufe |
| Vercel | Hobby (nur nicht-kommerziell) | Pro ca. 20 USD pro Mitglied/Monat plus Nutzung | Sobald die Seite Einnahmen erzielt oder Team-Mitglieder braucht |
| Neon | Free (inkl. 6 h Wiederherstellungsfenster) | Launch/Scale nutzungsbasiert, ohne Mindestbetrag; Verlauf bis 7 bzw. 30 Tage | Mehr Speicher, längere Point-in-Time-Wiederherstellung |
| Domain | – | Jahresgebühr je nach Endung und Registrar, evtl. Transfergebühr | immer |
| Liquipedia | nicht-kommerzieller API-Zugang nach Antrag | kommerzieller Datenzugang auf Anfrage | bei kommerzieller Nutzung |
| X API | – | pay-per-use (ca. 0.005 USD pro gelesenem Post) | nur wenn X-Monitoring aktiv |
| FACEIT, Twitch, YouTube-Feeds, Discord | gratis | – | – |

Laufende Mindestkosten bei rein nicht-kommerziellem Betrieb mit öffentlichem Repository: nur die Domain. Mit kommerzieller Nutzung: zusätzlich Vercel Pro und ggf. Liquipedia-Lizenz.

## 12. Was nach einem Kontowechsel neu autorisiert werden muss

- **Vercel ↔ GitHub:** Vercel-GitHub-App in der neuen GitHub-Organisation installieren und Repository freigeben; im Projekt unter Settings → Git neu verbinden, falls getrennt.
- **Claude/sonstige GitHub-Apps:** nur falls weiter genutzt, in der neuen Organisation neu installieren.
- **GitHub Actions:** Secrets/Variablen prüfen und neu setzen (Schritt 7), Environments und Required Reviewers neu setzen, geplante Workflows ggf. wieder aktivieren.
- **Neon:** Datenbankpasswort zurücksetzen, neue `DATABASE_URL` eintragen.
- **Alle API-Zugänge** aus Schritt 6 auf den neuen Eigentümer.
- **Discord:** Bot neu einladen, Channel-Follows im Server des neuen Eigentümers neu einrichten.
- **Website-Admins:** Admin-Konten des bisherigen Eigentümers auf `user` zurückstufen (SQL: `UPDATE users SET role='user' WHERE email='…'`) oder löschen; neue Admins mit `npm run admin:create` anlegen.
- **Benachrichtigungen:** Fehler-E-Mails von GitHub Actions und Vercel gehen an die neuen Eigentümer (Notification-Einstellungen prüfen).
- **Monitoring:** Ein externer Uptime-Check (z. B. ein kostenloser Uptime-Dienst) auf `/api/health` muss vom neuen Eigentümer neu angelegt werden, falls einer genutzt wurde.
