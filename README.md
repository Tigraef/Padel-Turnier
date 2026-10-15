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
