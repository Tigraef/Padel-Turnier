import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUNDS,
  MATCHES,
  validateSchedule,
  validateScore,
  computeRanking,
  gamesPerPlayer,
  currentRound,
  formatAverage,
} from '../src/americano/data.js';

const ok = (a, b) => ({ a, b, confirmed: true });

test('Americano: Spielplan exakt wie vorgegeben und gültig', () => {
  const v = validateSchedule();
  assert.equal(v.ok, true, JSON.stringify(v.checks));
  assert.equal(ROUNDS.length, 9);
  assert.equal(MATCHES.length, 18);
  const r1 = ROUNDS[0];
  assert.deepEqual(r1.matches[0].team1, ['Bosi', 'Jana']);
  assert.deepEqual(r1.matches[0].team2, ['Tobi', 'Max']);
  assert.equal(r1.matches[1].court, 'D8');
  assert.deepEqual(r1.pause, ['Kristina', 'Daniel']);
  assert.equal(ROUNDS[8].bonus, true);
  assert.deepEqual(ROUNDS[8].pause, ['Tobi', 'Kevin']);
});

test('Americano: unterschiedlich viele Spiele pro Person', () => {
  const counts = gamesPerPlayer(ROUNDS.filter((r) => !r.bonus));
  assert.equal(counts.Jana, 7);
  assert.equal(counts.Tobi, 7);
  assert.equal(counts.Kevin, 7);
  assert.equal(counts.Liza, 7);
  assert.equal(counts.Bosi, 6);
  assert.equal(counts.Daniel, 6);
});

test('Americano: Spielplanprüfung erkennt Fehler', () => {
  const broken = ROUNDS.map((r, i) => (i === 0 ? { ...r, pause: ['Kristina', 'Jana'] } : r));
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

test('Americano: Punkte gehen an beide Partner, Wertung nach Durchschnitt', () => {
  const results = {
    'r1-D7': ok(16, 8), // Bosi + Jana 16, Tobi + Max 8
    'r1-D8': ok(12, 12), // Kevin + Freddy 12, Liza + Nina 12
    'r2-D7': ok(20, 4), // Tobi + Kevin 20, Max + Freddy 4
    'r2-D8': { a: 24, b: 0, confirmed: false }, // nicht bestätigt → zählt nicht
  };
  const { rows, counted } = computeRanking(results);
  const by = Object.fromEntries(rows.map((r) => [r.player, r]));
  assert.equal(counted, 3);
  assert.deepEqual([by.Jana.points, by.Jana.played, by.Jana.average], [16, 1, 16]);
  assert.deepEqual([by.Tobi.points, by.Tobi.played, by.Tobi.average], [28, 2, 14]);
  assert.deepEqual([by.Kevin.points, by.Kevin.played, by.Kevin.average], [32, 2, 16]);
  assert.equal(by.Liza.drawn, 1);
  assert.equal(by.Daniel.played, 0);
  assert.equal(by.Daniel.rank, null);
  // Kevin (Ø 16, 32 Punkte) vor Bosi/Jana (Ø 16, 16 Punkte): Gesamtpunkte entscheiden
  assert.equal(rows[0].player, 'Kevin');
  assert.equal(by.Bosi.rank, 2);
  assert.equal(by.Jana.rank, 2);
  assert.ok(by.Bosi.tied && by.Jana.tied);
  // Wer noch nicht gespielt hat, steht ganz unten
  assert.equal(rows[rows.length - 1].played, 0);
});

test('Americano: Durchschnitt schlägt Gesamtpunkte (Spieler mit weniger Spielen)', () => {
  const results = {};
  // Alle 8 regulären Runden: Team 1 gewinnt jeweils 13:11
  for (const m of MATCHES.filter((x) => !x.bonus)) results[m.id] = ok(13, 11);
  const { rows } = computeRanking(results);
  for (const r of rows) assert.equal(r.average, r.points / r.played);
  const sorted = rows.map((r) => r.average);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a));
});

test('Americano: Stand nach Runde und aktuelle Runde', () => {
  const results = { 'r1-D7': ok(15, 9), 'r1-D8': ok(14, 10), 'r2-D7': ok(13, 11) };
  assert.equal(currentRound(results), 2);
  assert.equal(computeRanking(results, { upToRound: 1 }).counted, 2);
  for (const m of MATCHES.filter((x) => !x.bonus)) results[m.id] = ok(12, 12);
  assert.equal(currentRound(results), 'bonus');
  for (const m of MATCHES.filter((x) => x.bonus)) results[m.id] = ok(12, 12);
  assert.equal(currentRound(results), 'done');
});

test('Americano: Durchschnitt mit Komma', () => {
  assert.equal(formatAverage(13.5), '13,50');
  assert.equal(formatAverage(null), '–');
});
