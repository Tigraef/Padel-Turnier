import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYERS,
  ROUNDS,
  MATCHES,
  REGULAR_ROUNDS,
  roundTime,
  validateSchedule,
  validateScore,
  computeRanking,
  gamesPerPlayer,
  currentRound,
  exportText,
} from '../src/americano/data.js';

const ok = (a, b) => ({ a, b, confirmed: true });

test('Americano: Spielplan exakt wie vorgegeben und gültig', () => {
  const v = validateSchedule();
  assert.equal(v.ok, true, JSON.stringify(v.checks));
  assert.equal(PLAYERS.length, 8);
  assert.equal(ROUNDS.length, 7);
  assert.equal(REGULAR_ROUNDS, 7);
  assert.equal(MATCHES.length, 14);
  assert.ok(ROUNDS.every((r) => !r.bonus && r.pause.length === 0));
  const r1 = ROUNDS[0];
  assert.deepEqual(r1.matches[0].team1, ['Tobi', 'Freddy']);
  assert.deepEqual(r1.matches[0].team2, ['Daniel', 'Jana']);
  assert.deepEqual(r1.matches[1].team1, ['Liza', 'Kevin']);
  assert.deepEqual(r1.matches[1].team2, ['Max', 'Lars']);
  const r7 = ROUNDS[6];
  assert.deepEqual(r7.matches[1].team1, ['Tobi', 'Daniel']);
  assert.deepEqual(r7.matches[1].team2, ['Kevin', 'Max']);
  assert.equal(roundTime(1), '19:00–19:15');
  assert.equal(roundTime(7), '20:30–20:45');
});

test('Americano: jeder spielt 7-mal, einmal mit jedem, zweimal gegen jeden', () => {
  const counts = gamesPerPlayer();
  for (const p of PLAYERS) assert.equal(counts[p], 7, p);
  const partners = new Set();
  const opponents = {};
  for (const m of MATCHES) {
    partners.add([...m.team1].sort().join('+'));
    partners.add([...m.team2].sort().join('+'));
    for (const x of m.team1) for (const y of m.team2) {
      const k = [x, y].sort().join('-');
      opponents[k] = (opponents[k] || 0) + 1;
    }
  }
  assert.equal(partners.size, 28);
  assert.equal(Object.keys(opponents).length, 28);
  assert.ok(Object.values(opponents).every((n) => n === 2));
});

test('Americano: Spielplanprüfung erkennt Fehler', () => {
  const broken = ROUNDS.map((r, i) =>
    i === 0 ? { ...r, matches: [{ ...r.matches[0], team1: ['Tobi', 'Kevin'] }, r.matches[1]] } : r,
  );
  assert.equal(validateSchedule(broken).ok, false);
});

test('Americano: Punkteingabe bis 24, auch weniger bei Zeitablauf', () => {
  assert.equal(validateScore(15, 9).ok, true);
  assert.equal(validateScore(15, 9).complete, true);
  assert.equal(validateScore(12, 12).ok, true);
  assert.equal(validateScore(10, 8).ok, true);
  assert.equal(validateScore(10, 8).complete, false);
  assert.equal(validateScore(15, 10).ok, false);
  assert.equal(validateScore(null, 3).ok, false);
  assert.equal(validateScore(-1, 3).ok, false);
});

test('Americano: Punkte gehen an beide Partner, Wertung nach Gesamtpunkten', () => {
  const results = {
    'r1-D7': ok(16, 8), // Tobi + Freddy 16, Daniel + Jana 8
    'r1-D8': ok(12, 12), // Liza + Kevin 12, Max + Lars 12
    'r2-D7': ok(20, 4), // Liza + Jana 20, Daniel + Kevin 4
    'r2-D8': { a: 24, b: 0, confirmed: false }, // nicht bestätigt → zählt nicht
  };
  const { rows, counted } = computeRanking(results);
  const by = Object.fromEntries(rows.map((r) => [r.player, r]));
  assert.equal(counted, 3);
  assert.deepEqual([by.Liza.points, by.Liza.played], [32, 2]);
  assert.deepEqual([by.Jana.points, by.Jana.played], [28, 2]);
  assert.deepEqual([by.Tobi.points, by.Tobi.played], [16, 1]);
  assert.equal(by.Max.drawn, 1);
  assert.equal(rows[0].player, 'Liza');
  assert.equal(rows[1].player, 'Jana');
  // Gleiche Punktzahl → geteilter Platz
  assert.equal(by.Tobi.rank, 3);
  assert.equal(by.Freddy.rank, 3);
  assert.ok(by.Tobi.tied && by.Freddy.tied);
  // Mehr Punkte schlagen besseren Schnitt: Liza 32 in 2 Matches vor Tobi 16 in 1 Match
  assert.ok(by.Liza.rank < by.Tobi.rank);
});

test('Americano: Stand nach Runde und aktuelle Runde ohne Bonusrunde', () => {
  const results = { 'r1-D7': ok(15, 9), 'r1-D8': ok(14, 10), 'r2-D7': ok(13, 11) };
  assert.equal(currentRound(results), 2);
  assert.equal(computeRanking(results, { upToRound: 1 }).counted, 2);
  for (const m of MATCHES) results[m.id] = ok(12, 12);
  assert.equal(currentRound(results), 'done');
  const text = exportText(results);
  assert.ok(text.includes('Rangliste (Gesamtpunkte)'));
  assert.ok(!text.includes('Pause'));
});
