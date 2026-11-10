import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULE,
  TEAMS,
  FINALS,
  FORMAT_KEY,
  validateSchedule,
  validateGroupScore,
  validateFinalScore,
  computeStandings,
  finalPairings,
  finalRanking,
  finalMatchState,
  roundStartTime,
  pauseTime,
  exportText,
} from '../src/masters/logic.js';

const ok = (a, b) => ({ a, b, confirmed: true });

// Alle 28 Spiele: das Team mit der kleineren Nummer gewinnt 5:3 (t1 wird Erster, t8 Letzter).
function allPlayed() {
  const results = {};
  for (const m of SCHEDULE) {
    const homeWins = Number(m.home.slice(1)) < Number(m.away.slice(1));
    results[m.id] = homeWins ? ok(5, 3) : ok(3, 5);
  }
  return results;
}

test('Masters-Spielplan: 28 Paarungen, 7 Runden à 4 Spiele, Courts gleichmäßig verteilt', () => {
  const v = validateSchedule();
  assert.equal(v.ok, true, JSON.stringify(v.checks));
  assert.equal(SCHEDULE.length, 28);
  assert.equal(TEAMS.length, 8);
  for (let r = 1; r <= 7; r++) assert.equal(SCHEDULE.filter((m) => m.round === r).length, 4);
});

test('Zeitplan: 11:00 Start, Pause nach Runde 4, Platzierungsspiele vor 14:00', () => {
  assert.equal(roundStartTime(1), '11:00');
  assert.equal(roundStartTime(4), '12:00');
  assert.deepEqual(pauseTime(), { from: '12:20', to: '12:30' });
  assert.equal(roundStartTime(5), '12:30');
  assert.equal(roundStartTime(7), '13:10');
  assert.equal(roundStartTime(8), '13:30');
});

test('Vorrunde: max. 8 Games, Unentschieden erlaubt', () => {
  assert.equal(validateGroupScore(4, 4).ok, true);
  assert.equal(validateGroupScore(5, 2).ok, true);
  assert.equal(validateGroupScore(5, 4).ok, false);
});

test('Platzierungsspiele: Best of 7 bzw. 9, Golden Point bei Gleichstand', () => {
  assert.equal(validateFinalScore(4, 2, null, 'a', 'b', 7).winner, 'a');
  assert.equal(validateFinalScore(5, 2, null, 'a', 'b', 7).ok, false); // bei 4 Games ist Schluss
  assert.equal(validateFinalScore(5, 4, null, 'a', 'b', 9).winner, 'a');
  assert.equal(validateFinalScore(5, 4, null, 'a', 'b', 7).ok, false);
  assert.equal(validateFinalScore(3, 3, null, 'a', 'b', 7).ok, false);
  assert.equal(validateFinalScore(3, 3, 'b', 'a', 'b', 7).winner, 'b');
});

test('Tabelle und Paarungen 1–2, 3–4, 5–6, 7–8', () => {
  const results = allPlayed();
  const st = computeStandings(results);
  assert.deepEqual(
    st.rows.map((r) => r.teamId),
    ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'],
  );
  assert.equal(st.rows[0].pts, 14);
  const fp = finalPairings(results);
  assert.equal(fp.unlocked, true);
  assert.deepEqual(
    FINALS.map((f) => [fp.pairings[f.id].teamA, fp.pairings[f.id].teamB]),
    [
      ['t1', 't2'],
      ['t3', 't4'],
      ['t5', 't6'],
      ['t7', 't8'],
    ],
  );
});

test('Endstand mit Platzierungsspielen (Best of 7)', () => {
  const results = allPlayed();
  const finals = {
    [FORMAT_KEY]: { games: 7, skip: false, confirmed: true },
    final: { teamA: 't1', teamB: 't2', a: 2, b: 4, confirmed: true },
    p3: { teamA: 't3', teamB: 't4', a: 4, b: 1, confirmed: true },
    p5: { teamA: 't5', teamB: 't6', a: 3, b: 3, golden: 't6', confirmed: true },
    p7: { teamA: 't7', teamB: 't8', a: 4, b: 0, confirmed: true },
  };
  const fr = finalRanking(results, finals);
  assert.equal(fr.complete, true);
  assert.deepEqual(
    fr.places.map((p) => p.teamId),
    ['t2', 't1', 't3', 't4', 't6', 't5', 't7', 't8'],
  );
  // Auf Best of 9 umgestellt passt 4:1 weiterhin, ein 5:x nach Best of 7 dagegen nicht.
  const st = finalMatchState({ teamA: 't1', teamB: 't2' }, { teamA: 't1', teamB: 't2', a: 5, b: 1, confirmed: true }, 7);
  assert.equal(st.status, 'entered');
  assert.match(exportText({ results, finals }), /Endstand/);
});

test('Keine Zeit für Platzierungsspiele: Abschlusstabelle zählt', () => {
  const results = allPlayed();
  const fr = finalRanking(results, { [FORMAT_KEY]: { games: 9, skip: true, confirmed: true } });
  assert.equal(fr.complete, true);
  assert.equal(fr.skipped, true);
  assert.deepEqual(
    fr.places.map((p) => p.teamId),
    ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'],
  );
});
