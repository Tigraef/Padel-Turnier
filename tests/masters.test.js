// Qualitätssicherung TJ Padel Masters (Abschnitt 14 der Spezifikation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULE,
  FINALS,
  COURTS,
  DEFAULT_TEAMS,
  validateSchedule,
  validateGroupScore,
  applyGroupScoreChange,
  groupStepperMax,
  isConfirmedGroup,
  validateFinalScore,
  computeStandings,
  finalPairings,
  finalRanking,
  finalMatchState,
  groupMatchStatus,
  resolveTeams,
  resolveTimes,
  timeline,
  timerOps,
  timerRemaining,
  resultsCsv,
  standingsCsv,
  exportText,
} from '../src/masters/logic.js';
import { applyChange, mergeShared, pickShared, clearAll, publicView, sameShared } from '../src/masters/sync.js';

const ok = (a, b) => ({ a, b, confirmed: true });
const nr = (id) => Number(id.slice(1));
const find = (x, y) => SCHEDULE.find((m) => (m.home === x && m.away === y) || (m.home === y && m.away === x));
function put(results, x, y, gx, gy, extra = {}) {
  const m = find(x, y);
  results[m.id] = m.home === x ? { a: gx, b: gy, confirmed: true, ...extra } : { a: gy, b: gx, confirmed: true, ...extra };
}
// Alle 28 Spiele: die kleinere Teamnummer gewinnt 5:3 → Tabelle t1 … t8.
function allPlayed() {
  const results = {};
  for (const m of SCHEDULE) results[m.id] = nr(m.home) < nr(m.away) ? ok(5, 3) : ok(3, 5);
  return results;
}

test('QS: alle 28 Vorrundenbegegnungen vorhanden, keine doppelt', () => {
  assert.equal(SCHEDULE.length, 28);
  const pairs = new Set(SCHEDULE.map((m) => [m.home, m.away].sort().join('|')));
  assert.equal(pairs.size, 28);
  for (let i = 1; i <= 8; i++) for (let j = i + 1; j <= 8; j++) assert.ok(find(`t${i}`, `t${j}`), `t${i} gegen t${j} fehlt`);
});

test('QS: jedes Team spielt genau 7 Vorrundenmatches', () => {
  for (const t of DEFAULT_TEAMS) assert.equal(SCHEDULE.filter((m) => m.home === t.id || m.away === t.id).length, 7, t.name);
});

test('QS: kein Team doppelt in einer Runde, alle vier Courts pro Runde belegt', () => {
  for (let r = 1; r <= 7; r++) {
    const ms = SCHEDULE.filter((m) => m.round === r);
    const ids = ms.flatMap((m) => [m.home, m.away]);
    assert.equal(new Set(ids).size, 8, `Runde ${r}`);
    assert.deepEqual(ms.map((m) => m.court).sort(), [...COURTS].sort(), `Runde ${r}`);
  }
});

test('QS: die Lobster spielen sämtliche Vorrunden auf D8', () => {
  for (let r = 1; r <= 7; r++) {
    const m = SCHEDULE.find((x) => x.round === r && x.court === 'D8');
    assert.ok(m.home === 't1' || m.away === 't1', `Runde ${r}`);
  }
  assert.equal(validateSchedule().ok, true, JSON.stringify(validateSchedule().checks));
});

test('Spielplan entspricht exakt der Vorgabe', () => {
  const want = [
    '7-6 2-3 1-8 4-5',
    '4-2 5-8 1-7 6-3',
    '3-5 8-4 1-6 2-7',
    '6-4 3-7 1-5 8-2',
    '5-7 6-2 1-4 3-8',
    '8-6 7-4 1-3 2-5',
    '7-8 4-3 1-2 5-6',
  ];
  for (let r = 1; r <= 7; r++) {
    const got = COURTS.map((c) => SCHEDULE.find((m) => m.round === r && m.court === c)).map((m) => `${nr(m.home)}-${nr(m.away)}`).join(' ');
    assert.equal(got, want[r - 1], `Runde ${r}`);
  }
});

test('Teams laut Ausschreibung und nachträglich änderbar', () => {
  assert.equal(DEFAULT_TEAMS[0].name, 'Die Lobster');
  assert.deepEqual(DEFAULT_TEAMS[0].players, ['Tim', 'Jana']);
  const teams = resolveTeams({ 'teams/t5': { name: 'Netzfetzer 2', players: ['Lenny', 'Bendix'] } });
  assert.equal(teams[4].name, 'Netzfetzer 2');
  assert.deepEqual(teams[4].players, ['Lenny', 'Bendix']);
  assert.equal(teams[0].name, 'Die Lobster');
});

test('Zeitplan: 11:00–14:00 mit Pause nach Runde 4, anpassbar', () => {
  const tl = timeline(resolveTimes({}));
  assert.deepEqual(tl.rounds.map((r) => r.from), ['11:00', '11:20', '11:40', '12:00', '12:30', '12:50', '13:10']);
  assert.deepEqual([tl.pause.from, tl.pause.to], ['12:20', '12:30']);
  assert.deepEqual([tl.evaluation.from, tl.finals.from, tl.end.from], ['13:30', '13:35', '14:00']);
  const moved = timeline(resolveTimes({ times: { pauseMinutes: 15, overrides: { 2: '11:25' } } }));
  assert.equal(moved.rounds[1].from, '11:25');
  assert.equal(moved.rounds[2].from, '11:45');
  assert.equal(moved.rounds[4].from, '12:40');
});

test('Vorrunde: 8 Games regulär, Abbruch nur mit Bestätigung, nie negativ oder mehr als 8', () => {
  assert.equal(validateGroupScore(5, 3).ok, true);
  assert.equal(validateGroupScore(4, 4).ok, true);
  assert.equal(validateGroupScore(4, 2).ok, false);
  assert.equal(validateGroupScore(4, 2).needsShort, true);
  assert.equal(validateGroupScore(4, 2, true).ok, true);
  assert.equal(validateGroupScore(5, 4, true).ok, false);
  assert.equal(validateGroupScore(-1, 9).ok, false);
  assert.equal(isConfirmedGroup({ a: 4, b: 2, confirmed: true }), false);
  assert.equal(isConfirmedGroup({ a: 4, b: 2, confirmed: true, short: true }), true);
});

test('Spielstatus: offen, läuft, abgeschlossen', () => {
  const m = SCHEDULE[0];
  assert.equal(groupMatchStatus(m, null, {}), 'open');
  assert.equal(groupMatchStatus(m, null, { 'rounds/1': { started: 1 } }), 'running');
  assert.equal(groupMatchStatus(m, { a: 3, b: null }, {}), 'running');
  assert.equal(groupMatchStatus(m, ok(5, 3), {}), 'done');
});

test('QS: Tabellenberechnung (Punkte, Games, Differenz, Reihenfolge)', () => {
  const st = computeStandings(allPlayed());
  assert.deepEqual(st.rows.map((r) => r.teamId), ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']);
  const t1 = st.rows[0];
  assert.deepEqual([t1.played, t1.won, t1.drawn, t1.lost, t1.gf, t1.ga, t1.diff, t1.pts], [7, 7, 0, 0, 35, 21, 14, 14]);
  const t8 = st.rows[7];
  assert.deepEqual([t8.won, t8.pts, t8.diff], [0, 0, -14]);
  // Unentschieden zählt 1 Punkt
  const r = {};
  put(r, 't1', 't2', 4, 4);
  const s2 = computeStandings(r);
  assert.equal(s2.rows.find((x) => x.teamId === 't1').pts, 1);
  assert.equal(s2.rows.find((x) => x.teamId === 't2').pts, 1);
});

test('Tabelle: Game-Differenz, gewonnene Games, direkter Vergleich, manuelle Entscheidung', () => {
  const r = {};
  put(r, 't7', 't6', 6, 2); // t7 +4
  put(r, 't4', 't5', 5, 3); // t4 +2
  let st = computeStandings(r, { upToRound: 1 });
  assert.deepEqual(st.rows.slice(0, 2).map((x) => x.teamId), ['t7', 't4']);
  // Gleiche Punkte und Differenz, mehr Games: 5:3 nach Abbruch 4:2 vergleichen
  const r2 = {};
  put(r2, 't7', 't6', 5, 3);
  put(r2, 't4', 't5', 4, 2, { short: true });
  st = computeStandings(r2, { upToRound: 1 });
  assert.deepEqual(st.rows.slice(0, 2).map((x) => x.teamId), ['t7', 't4']);
  // Völlig gleich und noch kein direkter Vergleich → Turnierleitung entscheidet
  const r3 = {};
  put(r3, 't7', 't6', 5, 3);
  put(r3, 't4', 't5', 5, 3);
  st = computeStandings(r3, { upToRound: 1 });
  assert.ok(st.unresolved.some((g) => g.ids.length === 2 && g.ids.includes('t4') && g.ids.includes('t7')));
  const key = st.unresolved.find((g) => g.ids.includes('t4')).key;
  const manual = computeStandings(r3, { upToRound: 1, manualTies: { [key]: ['t7', 't4'] } });
  assert.deepEqual(manual.rows.slice(0, 2).map((x) => x.teamId), ['t7', 't4']);
});

test('QS: Ergebniskorrekturen aktualisieren die Tabelle', () => {
  const r = {};
  put(r, 't1', 't8', 6, 2);
  assert.equal(computeStandings(r).rows[0].teamId, 't1');
  put(r, 't1', 't8', 2, 6); // korrigiert
  const st = computeStandings(r);
  assert.equal(st.rows[0].teamId, 't8');
  assert.equal(st.rows.find((x) => x.teamId === 't1').pts, 0);
  const m = find('t1', 't8');
  r[m.id] = { ...r[m.id], confirmed: false }; // zur Korrektur geöffnet → zählt nicht
  assert.equal(computeStandings(r).confirmedCount, 0);
});

test('QS: Platzierungsspiele korrekt aus der Tabelle (D8 1–2, D7 3–4, D6 5–6, D9 7–8)', () => {
  const fp = finalPairings(allPlayed());
  assert.equal(fp.unlocked, true);
  assert.deepEqual(
    FINALS.map((f) => [f.court, fp.pairings[f.id].teamA, fp.pairings[f.id].teamB]),
    [
      ['D8', 't1', 't2'],
      ['D7', 't3', 't4'],
      ['D6', 't5', 't6'],
      ['D9', 't7', 't8'],
    ],
  );
  assert.equal(finalPairings({}).unlocked, false);
});

test('QS: Platzierungsspiele ohne feste Game- oder Punktebegrenzung', () => {
  for (const [a, b] of [[6, 4], [7, 5], [7, 6], [5, 4], [12, 10], [25, 23], [0, 1]]) {
    const v = validateFinalScore(a, b, null, 'x', 'y');
    assert.equal(v.ok, true, `${a}:${b}`);
    assert.equal(v.winner, a > b ? 'x' : 'y');
  }
  assert.equal(validateFinalScore(5, 5, null, 'x', 'y').ok, false);
  assert.equal(validateFinalScore(5, 5, 'y', 'x', 'y').winner, 'y');
  assert.equal(validateFinalScore(-1, 2, null, 'x', 'y').ok, false);
});

test('Platzierungsspiele: Status, Endplatzierung, Vorrundentabelle bleibt unverändert', () => {
  const results = allPlayed();
  const before = JSON.stringify(computeStandings(results).rows);
  const p = { teamA: 't1', teamB: 't2' };
  assert.equal(finalMatchState(p, null).status, 'open');
  assert.equal(finalMatchState(p, { teamA: 't1', teamB: 't2', started: true }).status, 'running');
  const finals = {
    final: { teamA: 't1', teamB: 't2', a: 4, b: 6, confirmed: true },
    p3: { teamA: 't3', teamB: 't4', a: 7, b: 6, confirmed: true },
    p5: { teamA: 't5', teamB: 't6', a: 5, b: 5, winner: 't6', confirmed: true },
    p7: { teamA: 't7', teamB: 't8', a: 9, b: 7, confirmed: true },
  };
  const fr = finalRanking(results, finals);
  assert.equal(fr.complete, true);
  assert.deepEqual(fr.places.map((x) => x.teamId), ['t2', 't1', 't3', 't4', 't6', 't5', 't7', 't8']);
  assert.equal(JSON.stringify(computeStandings(results).rows), before);
});

test('Ohne Platzierungsspiele zählt die Abschlusstabelle; Abschluss wertet offene Paare nach Tabelle', () => {
  const results = allPlayed();
  const skip = finalRanking(results, {}, {}, { finalsMode: { mode: 'skip' } });
  assert.equal(skip.complete, true);
  assert.deepEqual(skip.places.map((x) => x.teamId), ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']);
  const partial = finalRanking(results, { final: { teamA: 't1', teamB: 't2', a: 3, b: 6, confirmed: true } }, {}, { closed: { at: 1 } });
  assert.equal(partial.complete, true);
  assert.deepEqual(partial.places.map((x) => x.teamId), ['t2', 't1', 't3', 't4', 't5', 't6', 't7', 't8']);
  assert.equal(finalRanking(results, {}).complete, false);
});

test('Timer: starten, pausieren, fortsetzen, verlängern, zurücksetzen', () => {
  let t = timerOps.start('round', 1, 20, 0);
  assert.equal(timerRemaining(t, 5 * 60000), 15 * 60000);
  t = timerOps.pause(t, 5 * 60000);
  assert.equal(timerRemaining(t, 99 * 60000), 15 * 60000);
  t = timerOps.adjust(t, 2);
  assert.equal(timerRemaining(t, 0), 17 * 60000);
  t = timerOps.resume(t, 10 * 60000);
  assert.equal(timerRemaining(t, 12 * 60000), 15 * 60000);
  t = timerOps.adjust(t, -1, 12 * 60000);
  assert.equal(timerRemaining(t, 12 * 60000), 14 * 60000);
  assert.equal(timerRemaining(t, 999 * 60000), 0);
  t = timerOps.reset(t);
  assert.equal(t.running, false);
  assert.equal(timerRemaining(t, 0), 21 * 60000);
});

test('QS: Live-Abgleich – zwei Geräte ändern verschiedene Spiele, nichts geht verloren', () => {
  const base = pickShared({});
  const phoneA = applyChange(base, 'results', 'r1-D6', ok(5, 3), 1000);
  const phoneB = applyChange(applyChange(base, 'results', 'r1-D7', ok(4, 4), 1001), 'settings', 'teams/t5', { name: 'Neu', players: ['A', 'B'] }, 1002);
  const merged = mergeShared(phoneA, phoneB);
  assert.deepEqual(Object.keys(merged.results).sort(), ['r1-D6', 'r1-D7']);
  assert.equal(merged.settings['teams/t5'].name, 'Neu');
  assert.equal(sameShared(mergeShared(phoneB, phoneA), merged), true);
});

test('Live-Abgleich – gleiches Spiel: jüngere Änderung gewinnt, Löschen kommt an', () => {
  const base = pickShared({});
  const a = applyChange(base, 'results', 'r1-D6', ok(5, 3), 1000);
  const b = applyChange(a, 'results', 'r1-D6', ok(3, 5), 2000);
  assert.deepEqual(mergeShared(a, b).results['r1-D6'], ok(3, 5));
  const del = applyChange(b, 'results', 'r1-D6', null, 3000);
  assert.equal(mergeShared(b, del).results['r1-D6'], undefined);
  const reset = clearAll(b, {}, 4000);
  assert.equal(mergeShared(b, reset).results['r1-D6'], undefined);
});

test('Teilnehmer-Ansicht sieht nur bestätigte Ergebnisse', () => {
  const view = publicView({ results: { x: { a: 3, b: 1, confirmed: false }, y: ok(5, 3) }, finals: { final: { teamA: 't1', teamB: 't2', a: 3, b: 2, started: true } }, settings: { 'teams/t1': { name: 'L' } } });
  assert.deepEqual(Object.keys(view.results), ['y']);
  assert.equal(view.finals.final.a, undefined);
  assert.equal(view.finals.final.started, true);
  assert.equal(view.settings['teams/t1'].name, 'L');
});

test('Export: CSV mit Ergebnissen und Abschlusstabelle', () => {
  const state = { results: allPlayed(), finals: {}, manualTies: {}, settings: { finalsMode: { mode: 'skip' } } };
  const res = resultsCsv(state);
  assert.equal(res.split('\r\n').filter(Boolean).length, 29);
  assert.match(res, /Die Lobster;Tim & Jana/);
  const tab = standingsCsv(state);
  assert.match(tab.split('\r\n')[1], /^1;Die Lobster;Tim & Jana;7;7;0;0;35;21;14;14;1$/);
  assert.match(exportText(state), /Endstand/);
});

test('Vorrunde: Gegner-Games werden mit 8 minus Eingabe vorgeschlagen und bleiben überschreibbar', () => {
  // Erste Eingabe füllt den Gegner
  let r = applyGroupScoreChange(null, 'a', 5);
  assert.deepEqual(r, { a: 5, b: 3, suggested: 'b' });
  assert.equal(groupStepperMax(r, 'a'), 8);
  // Eingabe ändern: Vorschlag wandert mit
  r = applyGroupScoreChange(r, 'a', 6);
  assert.deepEqual(r, { a: 6, b: 2, suggested: 'b' });
  // Gegner von Hand überschreiben (Abbruch): eigener Wert bleibt
  r = applyGroupScoreChange(r, 'b', 1);
  assert.deepEqual(r, { a: 6, b: 1, suggested: null });
  assert.equal(validateGroupScore(r.a, r.b).needsShort, true);
  // Danach wird nichts mehr automatisch überschrieben
  r = applyGroupScoreChange(r, 'a', 4);
  assert.deepEqual(r, { a: 4, b: 1, suggested: null });
  assert.equal(groupStepperMax(r, 'a'), 7);
  // Auch von der Gegenseite aus, und 8:0 funktioniert
  assert.deepEqual(applyGroupScoreChange({ a: null, b: null }, 'b', 8), { a: 0, b: 8, suggested: 'a' });
  // Ungültige Eingaben erzeugen keinen Vorschlag
  assert.deepEqual(applyGroupScoreChange(null, 'a', 12), { a: 12, b: null, suggested: null });
  assert.deepEqual(applyGroupScoreChange({ a: 5, b: 3, suggested: 'b' }, 'a', null), { a: null, b: 3, suggested: 'b' });
});
