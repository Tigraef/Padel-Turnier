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

`https://tigraef.github.io/Padel-Turnier/americano/` (Teilnehmer: `…/americano/?ansicht`). 10 Spieler, 8 Runden + Bonusrunde,
24 Punkte pro Match, Einzelwertung nach Ø Punkten pro Match. Code in `src/americano/`, Build `npm run build:americano`
(ES5, läuft auch auf alten iPads). Abgleich über denselben Token, aber eigene Datei `americano.json`.

## TJ Padel Masters am 29.11.2026 (eigene App)

`https://tigraef.github.io/Padel-Turnier/masters/` (Teilnehmer: `…/masters/?ansicht`). Sonntag, 11:00–14:00 Uhr bei Hanse Padel.
8 Teams, 4 Courts parallel, 7 Runden jeder gegen jeden (28 Matches, niemand setzt aus), max. 8 Games, Pause nach Runde 4.
Danach Platzierungsspiele 1–2, 3–4, 5–6, 7–8 als Best of 7 oder Best of 9 (in der App umschaltbar) – oder „Keine Zeit“,
dann zählt die Abschlusstabelle. Aufbau und Look wie die Turnier-App, Code in `src/masters/` (Teams, Courts, Zeiten in
`src/masters/logic.js`), Build `npm run build:masters` (ES5, läuft auch auf alten iPads). Abgleich über denselben Token,
aber eigene Datei `masters.json`.
