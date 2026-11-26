# Hanse Padel Cup – Turnier-App

React-App für das private Padel-Turnier am **Freitag, 16. Oktober 2026, 19:00 Uhr** bei Hanse Padel.
6 Teams, 3 Courts (D6 links, D7 Mitte, D8 rechts), 5 Vorrunden jeder gegen jeden, danach 3 Platzierungsspiele.

## Starten

```bash
npm install
npm run dev      # Entwicklungsserver (im WLAN auch vom iPhone erreichbar)
npm test         # Tests der Berechnungslogik
npm run build    # Produktions-Build in dist/
npm run build:artifact  # eine einzelne HTML-Datei in dist-artifact/
```

## Aufbau

- `src/logic.js` – Teams, fester Spielplan, Spielplanprüfung, Tabelle inkl. Tiebreaks
  (Punkte → Game-Differenz → gewonnene Games → direkter Vergleich → manuelle Entscheidung),
  Platzierungsspiele und Endrangliste. Reine Funktionen, keine gespeicherten Tabellenwerte.
- `src/App.jsx` – Oberfläche: Übersicht, Spielplan, Tabelle, Finale, Siegerehrung.
- `src/store.js` – Speicherung im `localStorage` des Browsers.
- `tests/logic.test.js` – Tests mit `node --test`.

## Regeln (wie umgesetzt)

- Vorrunde: max. 8 Games, Unentschieden erlaubt (z. B. 4:4, 4:2 bei Zeitablauf). Ein Match zählt erst nach „Bestätigen“.
- Sieg 2, Unentschieden 1, Niederlage 0 Punkte.
- Platzierungsspiele: max. 9 Games, kein Unentschieden – bei Gleichstand nach Zeitablauf muss der Golden-Point-Sieger gewählt werden.
- Finalrunde wird erst nach allen 15 bestätigten Vorrundenspielen freigeschaltet. Gespeicherte Finalergebnisse enthalten die Team-IDs;
  ändert sich eine Paarung durch eine Korrektur, wird das alte Ergebnis als „veraltet“ markiert und nicht gewertet.

## Zwei Handys gleichzeitig (Abgleich über GitHub)

Die App läuft auf GitHub Pages: `https://tigraef.github.io/Padel-Turnier/`.
Die Ergebnisse liegen zusätzlich in `turnier.json` auf dem Branch `turnier-daten` und werden alle paar Sekunden abgeglichen
(pro Eintrag gewinnt die jüngere Änderung, Löschungen und „Zurücksetzen“ werden mit übertragen).

Einrichten (einmalig):
1. Repository öffentlich machen (GitHub Pages ist für private Repos nur mit GitHub Pro verfügbar).
2. Settings → Pages → Source: **GitHub Actions**. Danach baut der Workflow `pages.yml` die App bei jedem Push.
3. Fine-grained Token anlegen: GitHub → Settings → Developer settings → Fine-grained tokens →
   Repository access „Only select repositories: Padel-Turnier“, Permissions → Contents: **Read and write**, Ablauf z. B. 7 Tage.
4. Auf beiden Handys die App öffnen → „Lokal“ oben rechts antippen → Token einfügen → Verbinden.

## Live-Ansicht für Teilnehmer

`https://tigraef.github.io/Padel-Turnier/?ansicht` – ohne Token, nur lesen. Zeigt ausschließlich bestätigte Ergebnisse,
aktualisiert sich alle 15 Sekunden (bedingte Anfragen mit ETag, die nicht gegen GitHubs Limit zählen).

## iPad-Version für alte Geräte

`https://tigraef.github.io/Padel-Turnier/ipad/` (Teilnehmer-Ansicht: `…/ipad/?ansicht`) – dieselbe App,
aber als reines ES5 mit Polyfills (ab iOS 9) gebaut (`npm run build:ipad`, Konfiguration `vite.ipad.config.js`).
Die normale App bleibt davon unberührt.

## Americano-Turnier (eigene App)

`https://tigraef.github.io/Padel-Turnier/americano/` (Teilnehmer: `…/americano/?ansicht`). 8 Spieler, 7 Runden à 15 Minuten
(jeder spielt genau einmal mit jedem zusammen, keine Pausen), max. 24 Punkte pro Match, Einzelwertung nach Gesamtpunkten. Code in `src/americano/`, Build `npm run build:americano`
(ES5, läuft auch auf alten iPads). Abgleich über denselben Token, aber eigene Datei `americano.json`.

## TJ Padel Masters am 29.11.2026 (eigene App)

Sonntag, 29.11.2026, 11:00–14:00 Uhr, Hanse Padel Hamburg. 8 Teams, Courts D6–D9, 7 Runden jeder gegen jeden
(verbindlicher Spielplan, die Lobster immer auf D8), danach optionale Platzierungsspiele.

| Wer | Adresse |
| --- | --- |
| Turnierleitung | `https://tigraef.github.io/Padel-Turnier/masters/` |
| Teilnehmer (nur lesen) | `https://tigraef.github.io/Padel-Turnier/masters/?ansicht` |
| Fernseher/Tablet vor Ort | `https://tigraef.github.io/Padel-Turnier/masters/?ansicht&tv` |

Code in `src/masters/` (`logic.js` = Teams, Spielplan, Zeitplan, Tabelle, Platzierungsspiele, Timer, CSV;
`sync.js` = Abgleich; `App.jsx` = Oberfläche), Tests in `tests/masters.test.js`, Build `npm run build:masters`
(ES5, läuft auch auf alten iPads).

### Daten und Echtzeit-Abgleich

Alle Daten liegen als `masters-2911.json` auf dem Branch `turnier-daten` dieses Repositorys – das ist die zentrale,
dauerhafte Ablage. Jedes Gerät speichert zusätzlich sofort lokal (bleibt beim Neuladen und ohne Netz erhalten) und
gleicht alle 8 Sekunden ab, die Teilnehmer-Ansicht alle 15 Sekunden. Jeder Eintrag (Ergebnis, Platzierungsspiel,
Teamname, Uhrzeit, Timer …) trägt einen Zeitstempel; beim Zusammenführen gewinnt pro Eintrag die jüngere Änderung.
Zwei Geräte, die gleichzeitig verschiedene Spiele eintragen, überschreiben sich also nie. Bestätigte Ergebnisse sind
gesperrt und lassen sich nur über „Korrigieren“ wieder ändern.

Trennung Turnierleitung/Teilnehmer: Schreiben kann nur, wer den GitHub-Token hat. Der Teilnehmer-Link zeigt nur
bestätigte Ergebnisse und hat keine Eingabefelder und keinen Admin-Bereich.

### Einrichtung (einmalig, ca. 5 Minuten)

1. GitHub → Settings → Developer settings → Fine-grained tokens → „Generate new token“.
   Repository access: „Only select repositories“ → `Padel-Turnier`. Permissions → Contents: **Read and write**.
   Ablauf: mindestens bis 30.11.2026.
2. Auf jedem Handy/Tablet der Turnierleitung `…/masters/` öffnen → Tab „Admin“ → Token einfügen → „Verbinden“.
   (Wer den Token schon in einer anderen Turnier-App eingetragen hat, ist automatisch verbunden.)
3. Im Admin-Bereich Teamnamen und Uhrzeiten prüfen. Den Teilnehmer-Link dort kopieren und in die Gruppe schicken.
4. Optional: auf dem Fernseher/Tablet `…/masters/?ansicht&tv` öffnen (oder in der Übersicht „Vollbild / TV-Ansicht“).

### Veröffentlichen

Jeder Push auf `ccr-fe9e2b6d-oqp0u9` oder `main` baut über `.github/workflows/pages.yml` alle Apps (inklusive Tests)
und veröffentlicht sie auf GitHub Pages (Settings → Pages → Source: GitHub Actions). Lokal: `npm install`,
`npm test`, `npm run dev` und dann `http://localhost:5173/masters.html` öffnen.

### Am Turniertag

- Übersicht → „Runde 1 starten“ startet den 20-Minuten-Timer auf allen Geräten. Nach Ablauf piept es (Ton auf dem
  Gerät einmal antippen, damit der Browser ihn erlaubt). Der Timer schließt kein Spiel ab.
- Ergebnisse unter „Spielplan“ (Runden, Courts oder Teams) eintragen und bestätigen. Weniger als 8 Games nur mit
  „Abbruch bestätigen“.
- Nach Runde 4: „Pause starten (10 min)“. Zeit mit −5/−1/+1/+5 min anpassen.
- Nach Runde 7 erscheinen die Platzierungsspiele (D8 Finale, D7 3/4, D6 5/6, D9 7/8). „Spiel starten“, Stand
  eintragen (keine Begrenzung), „Beenden & bestätigen“; bei Gleichstand Sieger antippen. Oder „Überspringen“ –
  dann zählt die Tabelle. „Turnier jetzt abschließen“ wertet nicht gespielte Paare nach Tabelle.
- Export im Admin-Bereich: Ergebnisse und Abschlusstabelle als CSV, Text zum Teilen, Backup.
- Drucken: Spielplan bzw. Court-Plan (DIN A4) im Tab „Spielplan“, Ergebnis im Tab „Ergebnis“.
