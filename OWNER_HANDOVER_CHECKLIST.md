# Übergabe-Checkliste

Kurzfassung von [TRANSFER_GUIDE.md](TRANSFER_GUIDE.md) in praktischer Reihenfolge. Abhaken, wer es erledigt hat und wann.

## Vorbereitung
- [ ] Neuer Eigentümer hat Konten: GitHub-Organisation, Vercel-Team, Neon-Organisation, Passwortmanager (§1)
- [ ] Bisheriger Eigentümer ist vorübergehend Mitglied im Vercel-Team und in der Neon-Organisation des neuen Eigentümers
- [ ] Manuelles Backup: Actions → „Backup database“ → Run workflow, grün; Artefakt heruntergeladen und sicher abgelegt (§5)
- [ ] JSON-Export aus Admin → Export heruntergeladen (§5)
- [ ] DNS-Einträge der Domain exportiert oder abfotografiert (§4)

## Übertragung
- [ ] GitHub-Repository an die Organisation übertragen (§2)
- [ ] Vercel-Projekt in das neue Team übertragen, Git-Verbindung geprüft (§3)
- [ ] Neon-Projekt in die neue Organisation übertragen (§5)
- [ ] Domain umgezogen bzw. Besitz übertragen, DNS zeigt auf Vercel (§4)

## Absichern
- [ ] Neon-Passwort zurückgesetzt, neue `DATABASE_URL` in Vercel und GitHub eingetragen (§6, §7)
- [ ] Neues `SESSION_SECRET` in Vercel (Production und Preview getrennt) (§6)
- [ ] Neue `BACKUP_PASSPHRASE` gesetzt, alte für alte Backups im Passwortmanager aufbewahrt (§6)
- [ ] API-Keys neu erstellt und eingetragen: Liquipedia, FACEIT, Twitch, X, Discord (nur die genutzten) (§6)
- [ ] GitHub-Environments `production` und `preview` mit Secrets/Variablen, Required Reviewers für Produktion (§2, §7)
- [ ] Repository-Variablen `SYNC_ENABLED=true`, `BACKUP_ENABLED=true` (§8)
- [ ] Neue Admins angelegt, Admin-Rechte des bisherigen Eigentümers entfernt (§12)

## Prüfen
- [ ] `/api/health` → ok, `env: production` (§9)
- [ ] Alle öffentlichen Seiten und `/admin` laden (§9)
- [ ] `/admin/sources`: genutzte Quellen „Verbunden“ (§9)
- [ ] Workflows „Sync data sources“ und „Backup database“ manuell gestartet, beide grün (§8)
- [ ] Testkonto: Registrieren, Tipp abgeben, Wallet stimmt (§9)

## Abschluss
- [ ] Alte API-Keys, Tokens und Bot widerrufen (§6)
- [ ] Bisheriger Eigentümer aus GitHub-Org, Vercel-Team und Neon-Org entfernt
- [ ] Laufende Kosten und Rechnungsadressen beim neuen Eigentümer (§11)
- [ ] Rollback-Weg bekannt (§10)
