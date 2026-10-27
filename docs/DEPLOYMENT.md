# Erstes Deployment

Ausführliche Schritt-für-Schritt-Version für Nicht-Programmierer: [ANLEITUNG.md](../ANLEITUNG.md).

Alles läuft über Weboberflächen; kein lokaler PC nötig. Reihenfolge:

1. **Neon** (neon.com): Organisation anlegen (z. B. „finals-compete“), Projekt mit **Postgres 17** und Region Frankfurt erstellen. Einen Branch `preview` anlegen. Für jeden Branch zwei Verbindungsstrings notieren: *pooled* (für Vercel) und *direct* (für GitHub Actions). **Nicht** die Vercel-Integration von Neon verwenden (sonst ist das Projekt nicht übertragbar).
2. **GitHub** → Repository → Settings → Environments: `production` und `preview` anlegen und die Secrets/Variablen aus `TRANSFER_GUIDE.md` §7 eintragen (mindestens `DATABASE_URL`, `SESSION_SECRET`; für Backups `BACKUP_PASSPHRASE`).
3. **GitHub** → Actions → „Migrate database“ → Run workflow → `production`. Danach dasselbe für `preview`.
4. **Vercel** (vercel.com): Team anlegen, *Add New → Project → Import* `finals-compete`. Unter Environment Variables für **Production** und **Preview** getrennt setzen: `APP_ENV`, `DATABASE_URL` (pooled), `SESSION_SECRET`, `PUBLIC_BASE_URL`, `SOURCE_USER_AGENT`. Deploy.
5. **Admin anlegen:** Secret `ADMIN_PASSWORD` im Environment `production` setzen, dann Actions → „Create admin“ → Run workflow mit der E-Mail-Adresse.
6. **Jobs einschalten:** Repository-Variablen `SYNC_ENABLED=true` und `BACKUP_ENABLED=true`. „Backup database“ einmal manuell starten.
7. **Datenquellen:** Keys gemäss `docs/DATA_SOURCES.md` beantragen und als Secrets in `production` eintragen; `/admin/sources` zeigt, was noch fehlt.
8. **Domain:** Vercel → Project → Settings → Domains → Domain hinzufügen, DNS-Einträge beim Registrar setzen.
