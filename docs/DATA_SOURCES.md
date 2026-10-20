# Datenquellen

Stand: 2026-10-20. Legende: **Getestet** = mit echtem Zugriff geprüft · **Mit Testdaten geprüft** = Adapter-Logik mit nachgebildeten (synthetischen) Antworten getestet · **Recherchiert** = laut Dokumentation, ohne echten Zugriff.

> Kein Adapter wurde bisher gegen die echte API getestet. Gründe: Es sind noch keine API-Schlüssel hinterlegt, und die Netzwerkrichtlinie der Entwicklungsumgebung blockiert `liquipedia.net` (Proxy antwortet 403). Die Adapter folgen der jeweiligen Dokumentation und sind mit synthetischen Antworten getestet. Beim ersten echten Lauf zeigt `/admin/sources` Abweichungen als Warnungen.

## Übersicht

| Adapter | Daten | Stufe | Zugang | Kosten | Status |
|---|---|---|---|---|---|
| `liquipedia` | Turniere, Matches, Resultate, Platzierungen | 2 Turnierdatenbank | LPDB API v3, Key nach Antrag | gratis (nicht-kommerziell; kommerziell: [Liquipedia API](https://liquipedia.net/api)) | Mit Testdaten geprüft |
| `faceit` | Online-Qualifier (Matches, Sieger) | 1 offiziell (pro Championship einstellbar) | Data API v4, Server-Key | gratis | Mit Testdaten geprüft |
| `youtube` | Videos/VODs von Kanälen | je Account | Kanal-RSS ohne Key | gratis | Mit Testdaten geprüft |
| `twitch` | Live-Status von Streams | je Account | Helix, App-Token | gratis | Recherchiert |
| `x` | Posts von Accounts | je Account | X API v2, Bearer-Token | pay-per-use, ca. 0.005 USD pro gelesenem Post | Recherchiert |
| `discord` | Offizielle Ankündigungen | je Kanal | Bot im eigenen Server, Channel-Follow | gratis | Recherchiert |

## Liquipedia

- Es gibt ein THE-FINALS-Wiki: <https://liquipedia.net/thefinals/>. Laut Websuche enthält es u. a. die TGM26 Online Series (Americas, EMEA, APAC Cycles), The Grand Major, weitere Community-Turniere und Spieler-Resultatseiten. Wie vollständig Matches und Lineups strukturiert in der LPDB stehen, ist erst mit einem API-Key prüfbar.
- Regeln laut [API Terms of Use](https://liquipedia.net/api-terms-of-use):
  - LPDB-API nur mit genehmigtem Key, **60 Requests pro Stunde**, Key nicht weitergeben.
  - MediaWiki-API ohne Key: 1 Request pro 2 s, `action=parse` 1 pro 30 s.
  - **Scraping von HTML-Seiten ist verboten.** Deshalb gibt es keinen Scraper.
  - Eigener User-Agent mit Kontakt, gzip, Ergebnisse cachen, identische Abfragen vermeiden.
  - Inhalte unter **CC BY-SA 3.0**: die Website nennt Liquipedia im Footer und verlinkt jede Angabe auf die Originalseite.
- Umsetzung: Pro Lauf 3 Requests (tournament, match, placement), Budget im Code 50/h (Sicherheitsmarge), das Budget gilt über mehrere Läufe hinweg. Bei HTTP 429 bricht der Lauf ab, statt es erneut zu versuchen.
- Nicht genutzt: MediaWiki-API (liefert nur Wikitext, dessen Auswertung fehleranfällig wäre). Sie bleibt dokumentierte Alternative.

### Liquipedia-Key hinterlegen (ohne ihn im Chat zu teilen)

1. Auf <https://liquipedia.net/api-terms-of-use> Zugang beantragen, idealerweise mit einer Projekt-E-Mail statt einer privaten.
2. Den Key nur an diesen Stellen eintragen:
   - **GitHub** → Repository → Settings → Environments → `production` → Secrets → `LIQUIPEDIA_API_KEY` (für den stündlichen Sync).
   - Optional **Vercel** → Project → Settings → Environment Variables (nur nötig, wenn im Admin „Jetzt synchronisieren“ genutzt wird).
3. In GitHub zusätzlich die Variable `SOURCE_USER_AGENT` setzen, z. B. `FINALS-COMPETE/1.0 (https://deine-domain; kontakt@deine-domain)`.

## FACEIT

- Die TGM26 Online Series wurde laut Ankündigung auf FACEIT ausgetragen ([Inven Global](https://www.invenglobal.com/articles/26316/the-finals-confirms-three-apac-teams-for-grand-major-2026)).
- Data API v4 (`open.faceit.com/data/v4`), Key im [FACEIT Developer Portal](https://developers.faceit.com). Genutzt: `/championships/{id}` und `/championships/{id}/matches`.
- Offen: ob THE-FINALS-Matches auf FACEIT mehr als zwei Teams pro Match abbilden und ob Statistiken Cashouts enthalten. Der Adapter liest nur Sieger und Teams.
- `FACEIT_CHAMPIONSHIP_IDS` enthält nur Championships, die der offizielle Veranstalter betreibt (`:official`). Community-Turniere mit `:unverified` markieren.

## Social Media

| Plattform | Was erlaubt und umgesetzt ist | Was bewusst nicht gemacht wird |
|---|---|---|
| YouTube | Öffentliche Kanal-Feeds (`/feeds/videos.xml?channel_id=`). Upgrade: Data API v3 mit Key (10'000 Einheiten/Tag) | Kein Scraping von Kanalseiten |
| Twitch | Helix „Get Streams“ mit App-Token; einzige Quelle für echten Live-Status | Keine Chat-Auswertung |
| X | API v2 User-Timeline mit Budget pro Lauf (`X_MAX_POSTS_PER_RUN`) | Kein Scraping, keine privaten Accounts |
| Discord | Eigener Server folgt offiziellen Ankündigungskanälen („Follow“), eigener Bot liest diese Kopie | Keine Self-Bots, keine Bots in fremden Servern, keine DMs |
| Reddit | Nicht angebunden. Möglich über die Reddit Data API (OAuth), nur als Stufe 4 | – |

Kanal-IDs und Accounts sind **nicht** im Code fest eingetragen. Sie werden als Variablen gepflegt (`YOUTUBE_CHANNELS`, `TWITCH_CHANNELS`, `X_ACCOUNTS`, `DISCORD_CHANNELS`, Format in `.env.example`) und müssen von den offiziellen Seiten übernommen werden. Vorgeschlagene Kandidaten zur Prüfung: offizielle THE-FINALS- und Embark-Kanäle, Turnierorganisatoren (z. B. DreamHack für The Grand Major 2026 in Stockholm), FACEIT, verifizierte Team- und Spieler-Accounts.

Jeder Beitrag speichert: Plattform, Account und Account-Art, Original-URL, Veröffentlichungszeit, Importzeit, zugeordnete Teams, Match/Turnier, Art der Information (Stichwort-Klassifizierung), Verifizierungsstatus.

## Quellenhierarchie und Prioritätsregeln

| Stufe | Verifizierung | Beispiele |
|---|---|---|
| 0 | `manual` | Admin-Entscheid mit Pflicht-Quell-URL |
| 1 | `official` | Embark/THE FINALS, offizieller Veranstalter, FACEIT-Championship des Veranstalters, offizielle Social-Accounts |
| 2 | `database` | Liquipedia |
| 3 | `team_claim` | Team- und Spieler-Accounts |
| 4 | `unverified` | Community |
| – | `demo` | Simulierte Daten, nie als echt angezeigt |

Regeln je Datentyp (umgesetzt in `src/domain/resolution.ts` und `results-service.ts`, abgedeckt durch Tests):

**Match-Ergebnis**
1. Eine neuere Meldung derselben Quelle ersetzt deren ältere Meldung (Korrektur).
2. Ein manueller Admin-Entscheid hat Vorrang vor allem.
3. Bestätigt wird ein Ergebnis nur durch Stufe 1 oder 2.
4. Widersprechen sich Stufe-1/2-Quellen → blockierender Konflikt, kein Sieger.
5. Widerspricht eine Team-/Spielerangabe einem bestätigten Ergebnis → blockierender Konflikt.
6. Widerspricht ein Community-Bericht → nur Warnung.
7. Nur Stufe 3/4 vorhanden → „vorläufig“, wird nie als offizielles Ergebnis angezeigt.
8. Social-Media-Beiträge erzeugen **nie** eine Ergebnismeldung. Ein Beitrag vom Typ „Ergebnis“ oder „Korrektur“, der einem Match zugeordnet wird, setzt das Match auf „Prüfung nötig“ und sperrt die automatische Abrechnung bis zur Admin-Prüfung.

**Turnierplatzierung:** wie oben; widersprüchliche Platzierungen aus Stufe 1/2 werden nicht angezeigt, bis ein Admin den Konflikt bearbeitet.

**Spielplan und Matchdaten:** Matches aus verschiedenen Quellen werden über (gleiche Teams, gleiche Stunde) zusammengeführt. Die zuletzt importierte Quelle aktualisiert Zeit und Status.

**Lineups:** neue Teamzugehörigkeit aus einer Quelle schliesst die vorherige offene Zugehörigkeit.

## Cashouts, Runden und Live-Daten

Geprüft: Keine angebundene oder gefundene Quelle liefert strukturierte Cashout-Werte, Rundenereignisse oder Live-Platzierungen. Es gibt keine öffentliche, offizielle Embark-API dafür; Community-Wrapper decken nur Ranglisten ab.

| Art | Behandlung |
|---|---|
| In einer Quelle dokumentierte Cashouts | Feld `result_claims.cashouts_documented`; derzeit setzt kein Adapter es auf `true` |
| Aus offiziellem Matchbericht | nur manuell durch Admin mit Quell-URL |
| Live-Ereignisse aus autorisierter Quelle | keine vorhanden; nur Twitch-Stream-Status ist live |
| Manuell eingetragene Ergebnisse | `manual`, im Audit-Log |
| Simulierte Demo-Daten | `demo`, nur in Development/Preview, können keinen echten Markt abrechnen |

Märkte mit Datenbedarf `cashout_stat` oder `round_event` sind immer `unavailable` (Datenbank-Regel). Es werden keine Zahlen aus Posts, Screenshots oder Zusammenfassungen abgeleitet.

## Neue Quelle hinzufügen

1. `src/sources/adapters/<name>.ts` mit `fetchRaw` (Abruf über `ctx.http`, das Limits durchsetzt) und `normalize` (Validierung mit zod, Rückgabe normalisierter Datensätze).
2. In `src/sources/registry.ts` eintragen.
3. Benötigte Variablen in `.env.example`, `sync.yml` und dieser Datei ergänzen.
4. Test mit synthetischen Antworten in `tests/` hinzufügen.
