import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULE,
  validateSchedule,
  validateGroupScore,
  validateFinalScore,
  computeStandings,
  finalPairings,
  finalMatchState,
  finalRanking,
  currentRound,
  tieKey,
} from '../src/logic.js';

const ok = (a, b) => ({ a, b, confirmed: true });
const find = (home, away) =>
  SCHEDULE.find((m) => (m.home === home && m.away === away) || (m.home === away && m.away === home));

// Ergebnis aus Sicht von `x` eintragen (x holt gx Games, y holt gy Games).
function put(results, x, y, gx, gy, confirmed = true) {
  const m = find(x, y);
  results[m.id] = m.home === x ? { a: gx, b: gy, confirmed } : { a: gy, b: gx, confirmed };
}

const order = (st) => st.rows.map((r) => r.teamId);

test('Spielplan: 15 Paarungen, jedes Team einmal pro Runde, Vorhand² immer auf D7', () => {
  const v = validateSchedule();
  assert.equal(v.ok, true, JSON.stringify(v.checks));
  assert.equal(SCHEDULE.length, 15);
  assert.deepEqual(
    SCHEDULE.filter((m) => m.round === 1).map((m) => [m.court, m.home, m.away]),
    [
      ['D6', 'hansel', 'schluepfer'],
      ['D7', 'vorhand', 'schmetterlinge'],
      ['D8', 'smash', 'schubser'],
    ],
  );
});

test('Spielplanprüfung erkennt Fehler', () => {
  const broken = SCHEDULE.map((m) => (m.id === 'r2-D7' ? { ...m, court: 'D6' } : m));
  broken[0] = { ...broken[0], away: 'schmetterlinge' }; // doppelte Paarung + Team doppelt in Runde 1
  const v = validateSchedule(broken);
  assert.equal(v.ok, false);
  assert.equal(v.checks.filter((c) => !c.ok).length, 3);
});

test('Ergebnisvalidierung Vorrunde', () => {
  for (const [a, b] of [[8, 0], [6, 2], [5, 3], [4, 4], [4, 2], [0, 0]]) assert.equal(validateGroupScore(a, b).ok, true);
  assert.equal(validateGroupScore(5, 4).ok, false);
  assert.equal(validateGroupScore(9, 0).ok, false);
  assert.equal(validateGroupScore(-1, 3).ok, false);
  assert.equal(validateGroupScore(2.5, 3).ok, false);
  assert.equal(validateGroupScore(null, 3).ok, false);
});

test('Unentschieden gibt je 1 Punkt, Sieg 2, Niederlage 0', () => {
  const r = {};
  put(r, 'vorhand', 'schmetterlinge', 4, 4);
  put(r, 'smash', 'schubser', 5, 3);
  const st = computeStandings(r);
  const row = (id) => st.rows.find((x) => x.teamId === id);
  assert.equal(row('vorhand').pts, 1);
  assert.equal(row('vorhand').drawn, 1);
  assert.equal(row('schmetterlinge').pts, 1);
  assert.equal(row('smash').pts, 2);
  assert.equal(row('smash').won, 1);
  assert.equal(row('schubser').pts, 0);
  assert.equal(row('schubser').lost, 1);
  assert.equal(row('schubser').diff, -2);
});

test('Nur bestätigte Ergebnisse zählen', () => {
  const r = {};
  put(r, 'vorhand', 'schmetterlinge', 6, 2, false);
  const st = computeStandings(r);
  assert.equal(st.confirmedCount, 0);
  assert.ok(st.rows.every((x) => x.played === 0));
});

test('Game-Differenz entscheidet vor gewonnenen Games', () => {
  const r = {};
  put(r, 'hansel', 'schluepfer', 8, 0); // Hansel 2 Pkt, +8
  put(r, 'vorhand', 'schmetterlinge', 5, 3); // Vorhand 2 Pkt, +2
  put(r, 'smash', 'schubser', 4, 3); // Smash 2 Pkt, +1
  const st = computeStandings(r, { upToRound: 1 });
  assert.deepEqual(order(st).slice(0, 3), ['hansel', 'vorhand', 'smash']);
});

test('Gewonnene Games entscheiden bei gleicher Differenz', () => {
  const r = {};
  put(r, 'hansel', 'schluepfer', 3, 1); // +2, 3 Games
  put(r, 'vorhand', 'schmetterlinge', 5, 3); // +2, 5 Games
  put(r, 'smash', 'schubser', 4, 4);
  const st = computeStandings(r, { upToRound: 1 });
  assert.deepEqual(order(st).slice(0, 2), ['vorhand', 'hansel']);
  assert.equal(st.rows[0].rank, 1);
  assert.equal(st.rows[1].rank, 2);
});

test('Direkter Vergleich zwischen zwei Teams', () => {
  const r = {};
  // Runde 1: Vorhand schlägt Schmetterlinge 4:3
  put(r, 'vorhand', 'schmetterlinge', 4, 3);
  put(r, 'hansel', 'schluepfer', 4, 4);
  put(r, 'smash', 'schubser', 4, 4);
  // Runde 2: Schmetterlinge 4:3 gegen Schubser, Vorhand verliert 3:4 gegen Schlüpfer
  put(r, 'schmetterlinge', 'schubser', 4, 3);
  put(r, 'vorhand', 'schluepfer', 3, 4);
  put(r, 'hansel', 'smash', 4, 4);
  const st = computeStandings(r, { upToRound: 2 });
  const v = st.rows.find((x) => x.teamId === 'vorhand');
  const s = st.rows.find((x) => x.teamId === 'schmetterlinge');
  // Beide: 2 Pkt, Diff 0, 7 Games -> direkter Vergleich für Vorhand²
  assert.deepEqual([v.pts, v.diff, v.gf], [2, 0, 7]);
  assert.deepEqual([s.pts, s.diff, s.gf], [2, 0, 7]);
  assert.ok(v.position < s.position);
  assert.equal(v.decidedBy, 'h2h');
  assert.equal(v.tied, false);
  assert.ok(st.notes.some((n) => n.kind === 'h2h'));
});

test('Gleichstand ohne direktes Duell bleibt markiert', () => {
  const r = {};
  put(r, 'hansel', 'schluepfer', 4, 4);
  put(r, 'vorhand', 'schmetterlinge', 4, 4);
  put(r, 'smash', 'schubser', 4, 4);
  const st = computeStandings(r, { upToRound: 1 });
  assert.ok(st.rows.every((x) => x.tied && x.rank === 1));
  assert.equal(st.unresolved.length, 1);
  assert.equal(st.unresolved[0].ids.length, 6);
});

// Komplette Vorrunde mit Dreier-Kreisel an der Spitze:
// Vorhand > Smash > Schmetterlinge > Vorhand, jeweils 5:3; gegen den Rest gewinnen alle drei 4:2.
function circularScenario() {
  const r = {};
  const top = ['vorhand', 'smash', 'schmetterlinge'];
  const rest = ['hansel', 'schubser', 'schluepfer'];
  put(r, 'vorhand', 'smash', 5, 3);
  put(r, 'smash', 'schmetterlinge', 5, 3);
  put(r, 'schmetterlinge', 'vorhand', 5, 3);
  for (const t of top) for (const o of rest) put(r, t, o, 4, 2);
  put(r, 'hansel', 'schubser', 6, 2);
  put(r, 'hansel', 'schluepfer', 4, 4);
  put(r, 'schubser', 'schluepfer', 5, 1);
  return r;
}

test('Dreier-Kreisel: direkter Vergleich kann nicht entscheiden → manuelle Entscheidung', () => {
  const r = circularScenario();
  const st = computeStandings(r);
  assert.equal(st.confirmedCount, 15);
  const top = st.rows.slice(0, 3);
  assert.ok(top.every((x) => x.tied && x.rank === 1 && x.pts === 8));
  assert.equal(st.unresolved.length, 1);

  // Finalrunde blockiert, weil der Gleichstand Platz 2/3 (Finale vs. Spiel um Platz 3) betrifft
  const fpBlocked = finalPairings(r);
  assert.equal(fpBlocked.unlocked, false);
  assert.equal(fpBlocked.blocking.length, 1);

  const key = st.unresolved[0].key;
  assert.equal(key, tieKey(5, top[0], ['vorhand', 'smash', 'schmetterlinge']));
  const manualTies = { [key]: ['smash', 'vorhand', 'schmetterlinge'] };
  const st2 = computeStandings(r, { manualTies });
  assert.deepEqual(order(st2).slice(0, 3), ['smash', 'vorhand', 'schmetterlinge']);
  assert.ok(st2.rows.slice(0, 3).every((x) => x.decidedBy === 'manual' && !x.tied));

  const fp = finalPairings(r, manualTies);
  assert.equal(fp.unlocked, true);
  assert.equal(fp.pairings.final.teamA, 'smash');
  assert.equal(fp.pairings.final.teamB, 'vorhand');
  assert.equal(fp.pairings.p3.teamA, 'schmetterlinge');
});

test('Dreier-Gleichstand, bei dem der direkte Vergleich ein Team heraustrennt', () => {
  // A, B, C punkt- und differenzgleich; im Mini-Vergleich gewinnt A beide Spiele,
  // B–C endet 4:4 → danach Zweiervergleich B/C ohne Sieger → Gleichstand B/C.
  const r = {};
  put(r, 'vorhand', 'smash', 4, 3);
  put(r, 'vorhand', 'schmetterlinge', 4, 3);
  put(r, 'smash', 'schmetterlinge', 4, 4);
  // Ausgleich über die übrigen Spiele, sodass alle drei 5 Pkt, −2 Diff und 10 Games haben
  put(r, 'vorhand', 'hansel', 2, 2);
  put(r, 'vorhand', 'schubser', 0, 2);
  put(r, 'vorhand', 'schluepfer', 0, 2);
  put(r, 'smash', 'hansel', 1, 0);
  put(r, 'smash', 'schubser', 1, 0);
  put(r, 'smash', 'schluepfer', 1, 4);
  put(r, 'schmetterlinge', 'hansel', 1, 0);
  put(r, 'schmetterlinge', 'schluepfer', 1, 0);
  put(r, 'schmetterlinge', 'schubser', 1, 4);
  put(r, 'hansel', 'schubser', 2, 2);
  put(r, 'hansel', 'schluepfer', 2, 2);
  put(r, 'schubser', 'schluepfer', 2, 2);
  const st = computeStandings(r);
  const rows = Object.fromEntries(st.rows.map((x) => [x.teamId, x]));
  assert.deepEqual([rows.vorhand.pts, rows.vorhand.diff, rows.vorhand.gf], [5, -2, 10]);
  assert.deepEqual([rows.smash.pts, rows.smash.diff, rows.smash.gf], [5, -2, 10]);
  assert.deepEqual([rows.schmetterlinge.pts, rows.schmetterlinge.diff, rows.schmetterlinge.gf], [5, -2, 10]);
  assert.equal(rows.vorhand.decidedBy, 'h2h');
  assert.ok(rows.vorhand.position < rows.smash.position);
  assert.ok(rows.smash.tied && rows.schmetterlinge.tied);
  assert.equal(rows.smash.rank, rows.schmetterlinge.rank);
});

test('Tabelle nach Runde berücksichtigt nur Spiele bis zu dieser Runde', () => {
  const r = circularScenario();
  const st1 = computeStandings(r, { upToRound: 1 });
  assert.equal(st1.confirmedCount, 3);
  assert.ok(st1.rows.every((x) => x.played <= 1));
  const st3 = computeStandings(r, { upToRound: 3 });
  assert.equal(st3.confirmedCount, 9);
  assert.ok(st3.rows.every((x) => x.played === 3));
});

test('Finalrunde erst nach allen 15 Spielen; Paarungen 1–2, 3–4, 5–6 automatisch', () => {
  const r = {};
  // Eindeutige Tabelle: Seed-Reihenfolge gewinnt immer 5:3
  const ids = ['vorhand', 'schmetterlinge', 'hansel', 'smash', 'schubser', 'schluepfer'];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) put(r, ids[i], ids[j], 5, 3);
  const last = SCHEDULE[14];
  const saved = r[last.id];
  delete r[last.id];
  assert.equal(finalPairings(r).unlocked, false);
  assert.equal(currentRound(r), 5);
  r[last.id] = saved;
  assert.equal(currentRound(r), 'finals');
  const fp = finalPairings(r);
  assert.equal(fp.unlocked, true);
  assert.deepEqual([fp.pairings.final.court, fp.pairings.final.teamA, fp.pairings.final.teamB], ['D8', 'vorhand', 'schmetterlinge']);
  assert.deepEqual([fp.pairings.p3.court, fp.pairings.p3.teamA, fp.pairings.p3.teamB], ['D7', 'hansel', 'smash']);
  assert.deepEqual([fp.pairings.p5.court, fp.pairings.p5.teamA, fp.pairings.p5.teamB], ['D6', 'schubser', 'schluepfer']);
});

test('Finalergebnisse: Validierung und Golden Point bei Gleichstand', () => {
  assert.equal(validateFinalScore(5, 4, null, 'x', 'y').winner, 'x');
  assert.equal(validateFinalScore(5, 5, null, 'x', 'y').ok, false);
  assert.equal(validateFinalScore(3, 3, null, 'x', 'y').ok, false);
  assert.equal(validateFinalScore(3, 3, 'y', 'x', 'y').winner, 'y');
  assert.equal(validateFinalScore(9, 1, null, 'x', 'y').ok, false);
});

test('Geänderte Vorrunde: Finalergebnisse werden nicht falschen Teams zugeordnet', () => {
  const r = {};
  const ids = ['vorhand', 'schmetterlinge', 'hansel', 'smash', 'schubser', 'schluepfer'];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) put(r, ids[i], ids[j], 5, 3);
  const fp = finalPairings(r);
  const finals = {
    final: { teamA: 'vorhand', teamB: 'schmetterlinge', a: 5, b: 4, confirmed: true },
    p3: { teamA: 'hansel', teamB: 'smash', a: 2, b: 2, golden: 'smash', confirmed: true },
    p5: { teamA: 'schubser', teamB: 'schluepfer', a: 1, b: 6, confirmed: true },
  };
  const ranking = finalRanking(r, finals);
  assert.equal(ranking.complete, true);
  assert.deepEqual(
    ranking.places.map((p) => p.teamId),
    ['vorhand', 'schmetterlinge', 'smash', 'hansel', 'schluepfer', 'schubser'],
  );
  assert.equal(finalMatchState(fp.pairings.final, finals.final).status, 'confirmed');

  // Korrektur: Smash gewinnt jetzt 8:0 gegen Hansel und 8:0 gegen Schmetterlinge → Platz 2 und 3 ändern sich
  put(r, 'smash', 'hansel', 8, 0);
  put(r, 'smash', 'schmetterlinge', 8, 0);
  const fp2 = finalPairings(r);
  assert.equal(fp2.unlocked, true);
  assert.equal(fp2.pairings.final.teamB, 'smash');
  const st = finalMatchState(fp2.pairings.final, finals.final);
  assert.equal(st.status, 'stale');
  const ranking2 = finalRanking(r, finals);
  assert.equal(ranking2.complete, false);
  // Spiel um Platz 5 ist unverändert und bleibt gültig
  assert.equal(finalMatchState(fp2.pairings.p5, finals.p5).status, 'confirmed');
});

test('Gespeichertes Finalergebnis mit vertauschter Reihenfolge wird korrekt zugeordnet', () => {
  const pairing = { teamA: 'vorhand', teamB: 'smash' };
  const st = finalMatchState(pairing, { teamA: 'smash', teamB: 'vorhand', a: 6, b: 3, confirmed: true });
  assert.equal(st.status, 'confirmed');
  assert.deepEqual([st.a, st.b, st.winner], [3, 6, 'smash']);
});
