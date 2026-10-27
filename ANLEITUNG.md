# FINALS COMPETE selbst einrichten: Schritt für Schritt (kostenlos)

Mit dieser Anleitung richtest du deine eigene FINALS-COMPETE-Webseite ein. Alles gehört danach dir: der Code, die Datenbank und die Webseite. Du brauchst **keine Programmierkenntnisse** und **musst nichts auf deinem Computer installieren**. Alles passiert im Browser.

Dauer: etwa 30 Minuten. Kosten: 0 Franken, solange du mit der Seite kein Geld verdienst (siehe „Kosten“ unten).

Du brauchst drei kostenlose Konten:

| Dienst | Wofür |
|---|---|
| **GitHub** (github.com) | Hier liegt der Code. Ausserdem laufen hier die automatischen Aufgaben (Daten abholen, Backups) |
| **Neon** (neon.com) | Die Datenbank, in der Turniere, Nutzer und Tipps gespeichert werden |
| **Vercel** (vercel.com) | Macht die Webseite im Internet erreichbar |

> **Wichtig:** Passwörter und Schlüssel trägst du immer nur direkt auf diesen Webseiten ein. Schick sie niemandem per Chat oder E-Mail.

---

## Schritt 1: GitHub-Konto und eigene Kopie des Codes

1. Auf **github.com** ein kostenloses Konto erstellen (falls du noch keins hast).
2. Öffne **github.com/new/import**.
3. Bei „Your source repository details“ diese Adresse eintragen:
   `https://github.com/manuel-the-dev/finals-compete`
   (Falls diese Adresse nicht mehr existiert: Neues leeres Repository erstellen und den Inhalt der ZIP-Datei über „uploading an existing file“ hochladen.)
4. Bei „Repository name“ z. B. `finals-compete` eintragen.
5. **Public** oder **Private** wählen. Empfehlung: **Public**. Der Code enthält keine Geheimnisse, und bei öffentlichen Repositories sind die automatischen Aufgaben unbegrenzt gratis (bei privaten: 2'000 Minuten pro Monat gratis, das reicht normalerweise auch).
6. **„Begin import“** klicken und warten, bis GitHub „Your new repository is ready“ meldet.

Ab jetzt ist das **dein** Repository unter `github.com/<dein-name>/finals-compete`.

## Schritt 2: Datenbank bei Neon

1. Auf **neon.com** ein kostenloses Konto erstellen (am einfachsten mit „Sign up with GitHub“).
2. **„New Project“** klicken:
   - Name: `finals-compete`
   - Postgres version: **17**
   - Region: **AWS Europe Central 1 (Frankfurt)**
   - **„Create“** klicken.
3. Im Projekt oben auf **„Connect“** klicken. Du brauchst **zwei** Verbindungsadressen:
   - **Adresse A (direkt):** Den Schalter **„Connection pooling“ ausschalten** und die Adresse kopieren (sie beginnt mit `postgresql://`). Sie kommt in Schritt 3 zu GitHub.
   - **Adresse B (pooled):** Den Schalter **„Connection pooling“ einschalten** und die Adresse kopieren (sie enthält `-pooler`). Sie kommt in Schritt 6 zu Vercel.

   Tipp: Kopiere beide Adressen in eine Notiz in deinem Passwortmanager, nicht in eine normale Textdatei.

> Wichtig: Verbinde Neon **nicht** über „Integrations → Vercel“. Wir verbinden die beiden Dienste nur über die Adresse. Dann kannst du die Datenbank später problemlos an jemand anderen übergeben.

## Schritt 3: Geheime Werte in GitHub eintragen

Du brauchst zuerst drei lange Zufallspasswörter. Erzeuge sie mit dem Passwortgenerator deines Passwortmanagers (oder z. B. auf bitwarden.com/password-generator). Wähle jeweils **mindestens 40 Zeichen** und **nur Buchstaben und Zahlen**.

| Name | Was es ist |
|---|---|
| `SESSION_SECRET` | Zufallspasswort 1. Damit werden Logins gesichert |
| `BACKUP_PASSPHRASE` | Zufallspasswort 2. Damit werden die Backups verschlüsselt. **Unbedingt im Passwortmanager speichern**, sonst kann man Backups nie mehr öffnen |
| `ADMIN_PASSWORD` | Dein Admin-Passwort für die Webseite (mindestens 12 Zeichen), das du selbst zum Einloggen benutzt |

So trägst du sie ein:

1. In deinem Repository auf GitHub: **Settings** (Zahnrad oben) → links **Environments** → **New environment** → Name `production` → **Configure environment**.
2. Ganz unten bei **Environment secrets** auf **„Add environment secret“** klicken und nacheinander diese vier Einträge anlegen:
   - `DATABASE_URL` = **Adresse A** aus Schritt 2 (die *ohne* `-pooler`)
   - `SESSION_SECRET` = Zufallspasswort 1
   - `BACKUP_PASSPHRASE` = Zufallspasswort 2
   - `ADMIN_PASSWORD` = dein Admin-Passwort

## Schritt 4: Datenbank einrichten (ein Klick)

1. Im Repository oben auf **Actions**. Falls GitHub fragt „Workflows aren't being run on this repository“, auf **„I understand my workflows, go ahead and enable them“** klicken.
2. Links **„Migrate database“** wählen → rechts **„Run workflow“** → bei „Ziel-Umgebung“ **production** wählen → grüner Knopf **„Run workflow“**.
3. Nach etwa einer Minute erscheint ein **grüner Haken**. Damit sind die Tabellen in der Datenbank angelegt.
   Bei einem roten Kreuz: draufklicken und die Fehlermeldung lesen. Meistens ist `DATABASE_URL` falsch kopiert.

## Schritt 5: Admin-Konto anlegen (ein Klick)

1. **Actions** → links **„Create admin“** → **„Run workflow“** → deine E-Mail-Adresse eintragen → **„Run workflow“**.
2. Grüner Haken = dein Admin-Konto existiert. Du loggst dich später mit dieser E-Mail und dem `ADMIN_PASSWORD` ein.

## Schritt 6: Webseite bei Vercel online stellen

1. Auf **vercel.com** ein kostenloses Konto erstellen, mit **„Continue with GitHub“**. Plan: **Hobby**.
2. **„Add New…“ → „Project“** → bei deinem Repository `finals-compete` auf **„Import“** klicken (falls es nicht erscheint: „Adjust GitHub App Permissions“ und das Repository freigeben).
3. Vor dem Deploy **„Environment Variables“** aufklappen und diese drei Einträge hinzufügen:

   | Key | Value |
   |---|---|
   | `APP_ENV` | `production` |
   | `DATABASE_URL` | **Adresse B** aus Schritt 2 (die *mit* `-pooler`) |
   | `SESSION_SECRET` | dasselbe Zufallspasswort 1 wie bei GitHub |

4. **„Deploy“** klicken und 2 bis 3 Minuten warten.
5. Vercel zeigt dir deine Adresse, z. B. `https://finals-compete-xyz.vercel.app`. **Das ist deine Webseite!**
6. Nach dem ersten Deploy: Projekt → **Settings → Environment Variables**. Bei allen drei Einträgen prüfen, dass nur **„Production“** angehakt ist (nicht „Preview“ oder „Development“). So kann eine Testversion nie deine echten Daten verändern.

## Schritt 7: Testen

1. `https://<deine-adresse>/api/health` öffnen. Dort sollte `"ok":true` stehen.
2. Die Startseite öffnen. Sie ist noch leer, weil noch keine Turnierdaten importiert sind. Das ist normal.
3. **Login** mit deiner Admin-E-Mail und dem `ADMIN_PASSWORD`, danach oben auf **Admin**.
4. Unter **Admin → Märkte** kannst du einen ersten Markt anlegen.
5. Unter **Register** ein normales Testkonto erstellen. Es bekommt 1'000 virtuelle Coins.

## Schritt 8: Automatische Backups und Daten einschalten (empfohlen)

1. GitHub → **Settings → Secrets and variables → Actions** → Reiter **Variables** → **„New repository variable“**:
   - `BACKUP_ENABLED` = `true` (jede Nacht ein verschlüsseltes Backup, 30 Tage aufbewahrt)
   - `SYNC_ENABLED` = `true` (jede Stunde werden die Datenquellen abgefragt)
2. **Actions → „Backup database“ → Run workflow** einmal von Hand starten, um zu prüfen, dass es grün wird.

## Schritt 9: Echte Turnierdaten anbinden (nach und nach)

Ohne Zugangsschlüssel zeigt die Seite nur, was du als Admin einträgst. Unter **Admin → Datenquellen** siehst du jederzeit, was noch fehlt. Die Schlüssel kommen als **Environment secret** in GitHub (`production`, wie in Schritt 3). Kanal-Listen und ähnliche Angaben kommen als **Environment variable** in dasselbe Environment.

| Quelle | Was du tust | Kosten |
|---|---|---|
| **Liquipedia** (Turniere, Resultate) | Auf liquipedia.net/api-terms-of-use API-Zugang beantragen. Danach Secret `LIQUIPEDIA_API_KEY` und Variable `SOURCE_USER_AGENT` = `FINALS-COMPETE/1.0 (deine-webseite; deine-email)` eintragen | gratis (nicht-kommerziell) |
| **YouTube** (Videos) | Variable `YOUTUBE_CHANNELS`, z. B. `UCxxxxxxxx:official:THE FINALS`. Die Kanal-ID steht auf der Kanalseite unter „Info“ → „Kanal teilen“ → „Kanal-ID kopieren“ | gratis |
| **FACEIT** (Online-Qualifier) | Auf developers.faceit.com eine App erstellen, Secret `FACEIT_API_KEY`, Variable `FACEIT_CHAMPIONSHIP_IDS` | gratis |
| **Twitch** (Livestreams) | Auf dev.twitch.tv eine App erstellen, Secrets `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, Variable `TWITCH_CHANNELS` | gratis |
| **Discord** | siehe `docs/DATA_SOURCES.md` | gratis |
| **X / Twitter** | kostet pro gelesenem Beitrag, deshalb erst einmal weglassen | kostenpflichtig |

Das genaue Format aller Einträge steht in der Datei `.env.example` im Repository.

## Kosten

| Dienst | Gratis-Angebot | Wann es etwas kostet |
|---|---|---|
| GitHub | Öffentliche Repositories: automatische Aufgaben gratis | Bei privatem Repository mit mehr als 2'000 Minuten pro Monat |
| Neon | Free-Plan: 1 Projekt mit kleiner Datenbank, Wiederherstellung der letzten 6 Stunden | Bei viel Speicher oder längerer Wiederherstellung |
| Vercel | Hobby: gratis, aber **nur für nicht-kommerzielle Nutzung** | Sobald die Seite Geld einbringt (Werbung, Abos): Pro, etwa 20 USD pro Monat |
| Eigene Domain (optional) | – | etwa 10 bis 20 Franken pro Jahr beim Domain-Anbieter |

Die Prediction-Märkte nutzen nur **virtuelle Coins ohne Geldwert**. Echtgeld-Wetten wären rechtlich etwas ganz anderes und sind nicht vorgesehen.

## Eigene Domain (optional)

Vercel → dein Projekt → **Settings → Domains** → Domain eintragen. Vercel zeigt dir, welche Einträge du bei deinem Domain-Anbieter setzen musst.

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Vercel-Deploy scheitert mit „Migrationen fehlen“ | Schritt 4 („Migrate database“) ausführen, dann bei Vercel **Redeploy** |
| Login funktioniert nicht | Prüfen, ob `SESSION_SECRET` bei Vercel gesetzt ist. Schritt 5 erneut ausführen, das setzt das Admin-Passwort neu |
| `/api/health` zeigt `"ok":false` | `DATABASE_URL` bei Vercel prüfen (Adresse B) |
| Ein Workflow ist rot | Draufklicken, den roten Schritt öffnen und die Fehlermeldung lesen. Meistens fehlt ein Secret oder es ist falsch kopiert |

## Weiterentwickeln

- Code ändern kannst du direkt auf GitHub (Stift-Symbol bei einer Datei) oder in **GitHub Codespaces** (Repository → grüner „Code“-Knopf → „Codespaces“). Codespaces ist eine Entwicklungsumgebung im Browser, gratis für einige Stunden pro Monat.
- Jede Änderung auf dem Branch `main` wird von Vercel automatisch veröffentlicht.
- Technische Details: `README.md`, `docs/ARCHITECTURE.md`, `docs/DATA_SOURCES.md`, `docs/BACKUP_RESTORE.md`.
- Falls du die Seite später einmal weitergibst: `TRANSFER_GUIDE.md` und `OWNER_HANDOVER_CHECKLIST.md`.
