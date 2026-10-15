// Reine Turnierlogik ohne React – wird von der App und von den Tests genutzt.
// Alle Tabellenwerte werden aus den gespeicherten Ergebnissen berechnet, nie separat gespeichert.

export const TOURNAMENT = {
  name: 'Padel-Turnier bei Hanse Padel',
  date: '2026-10-16',
  dateLabel: 'Freitag, 16. Oktober 2026',
  startTime: '19:00',
  roundMinutes: 20,
};

export const TEAMS = [
  { id: 'vorhand', seed: 1, name: 'Vorhand²', players: ['Tim', 'Jana'] },
  { id: 'schmetterlinge', seed: 2, name: 'Schmetterlinge', players: ['Liza', 'Tobi'] },
  { id: 'hansel', seed: 3, name: 'Spannenlanger Hansel, nudeldicke Dirn', players: ['Lars', 'Steffi'] },
  { id: 'smash', seed: 4, name: 'Super Smash Bros', players: ['Max', 'Bosi'] },
  { id: 'schubser', seed: 5, name: 'Scheiben Schubser', players: ['Kevin', 'Maria'] },
  { id: 'schluepfer', seed: 6, name: 'Schlüpfer', players: ['Tjaark', 'Hannes'] },
];

export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

export const COURTS = [
  { id: 'D6', side: 'links' },
  { id: 'D7', side: 'Mitte' },
  { id: 'D8', side: 'rechts' },
];

export const ROUNDS = 5;
export const GROUP_MAX_GAMES = 8;
export const FINAL_MAX_GAMES = 9;

// Fester Vorrundenspielplan – exakt wie vorgegeben, keine Auslosung.
const FIXED = [
  [['hansel', 'schluepfer'], ['vorhand', 'schmetterlinge'], ['smash', 'schubser']],
  [['hansel', 'smash'], ['vorhand', 'schluepfer'], ['schmetterlinge', 'schubser']],
  [['schluepfer', 'schubser'], ['vorhand', 'hansel'], ['smash', 'schmetterlinge']],
  [['schluepfer', 'schmetterlinge'], ['vorhand', 'smash'], ['hansel', 'schubser']],
  [['schluepfer', 'smash'], ['vorhand', 'schubser'], ['hansel', 'schmetterlinge']],
];

export const SCHEDULE = FIXED.flatMap((round, r) =>
  round.map(([home, away], c) => ({
    id: `r${r + 1}-${COURTS[c].id}`,
    round: r + 1,
    court: COURTS[c].id,
    home,
    away,
  })),
);

export const FINALS = [
  { id: 'final', court: 'D8', label: 'Finale', places: [1, 2] },
  { id: 'p3', court: 'D7', label: 'Spiel um Platz 3', places: [3, 4] },
  { id: 'p5', court: 'D6', label: 'Spiel um Platz 5', places: [5, 6] },
];

export function roundStartTime(round) {
  const [h, m] = TOURNAMENT.startTime.split(':').map(Number);
  const total = h * 60 + m + (round - 1) * TOURNAMENT.roundMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ---------- Spielplanprüfung ----------

export function validateSchedule(schedule = SCHEDULE, teams = TEAMS) {
  const checks = [];
  const keys = schedule.map((m) => [m.home, m.away].sort().join('|'));
  const unique = new Set(keys);
  const expectedPairs = (teams.length * (teams.length - 1)) / 2;
  checks.push({
    label: `${expectedPairs} unterschiedliche Paarungen`,
    ok: schedule.length === expectedPairs && unique.size === expectedPairs && schedule.every((m) => m.home !== m.away),
    detail: `${unique.size} unterschiedliche Paarungen bei ${schedule.length} Spielen`,
  });

  const rounds = [...new Set(schedule.map((m) => m.round))].sort((a, b) => a - b);
  const badRounds = rounds.filter((r) => {
    const ids = schedule.filter((m) => m.round === r).flatMap((m) => [m.home, m.away]);
    return ids.length !== teams.length || new Set(ids).size !== teams.length || !teams.every((t) => ids.includes(t.id));
  });
  checks.push({
    label: 'Jedes Team spielt genau einmal pro Runde',
    ok: rounds.length === ROUNDS && badRounds.length === 0,
    detail: badRounds.length ? `Fehler in Runde ${badRounds.join(', ')}` : `${rounds.length} Runden geprüft`,
  });

  const vorhandWrong = rounds.filter(
    (r) => !schedule.some((m) => m.round === r && m.court === 'D7' && (m.home === 'vorhand' || m.away === 'vorhand')),
  );
  checks.push({
    label: 'Vorhand² spielt in jeder Vorrunde auf D7',
    ok: vorhandWrong.length === 0,
    detail: vorhandWrong.length ? `Nicht auf D7 in Runde ${vorhandWrong.join(', ')}` : 'In allen Runden auf D7',
  });

  return { ok: checks.every((c) => c.ok), checks };
}

// ---------- Ergebnisprüfung ----------

const isInt = (v) => Number.isInteger(v) && v >= 0;

export function validateGroupScore(a, b) {
  if (a == null || b == null || a === '' || b === '') return { ok: false, error: 'Bitte beide Ergebnisse eintragen.' };
  if (!isInt(a) || !isInt(b)) return { ok: false, error: 'Nur ganze Zahlen ab 0 sind erlaubt.' };
  if (a + b > GROUP_MAX_GAMES) {
    return { ok: false, error: `Höchstens ${GROUP_MAX_GAMES} Games pro Vorrundenspiel (eingetragen: ${a + b}).` };
  }
  return { ok: true, error: null };
}

export function validateFinalScore(a, b, golden, teamA, teamB) {
  if (a == null || b == null || a === '' || b === '') return { ok: false, error: 'Bitte beide Ergebnisse eintragen.', winner: null };
  if (!isInt(a) || !isInt(b)) return { ok: false, error: 'Nur ganze Zahlen ab 0 sind erlaubt.', winner: null };
  if (a + b > FINAL_MAX_GAMES) {
    return { ok: false, error: `Höchstens ${FINAL_MAX_GAMES} Games pro Platzierungsspiel (eingetragen: ${a + b}).`, winner: null };
  }
  if (a === b) {
    if (golden !== teamA && golden !== teamB) {
      return { ok: false, error: 'Unentschieden: Bitte den Gewinner des entscheidenden Golden Points wählen.', winner: null, needsGolden: true };
    }
    return { ok: true, error: null, winner: golden, needsGolden: true };
  }
  return { ok: true, error: null, winner: a > b ? teamA : teamB, needsGolden: false };
}

export function isConfirmedGroup(result) {
  return !!result && result.confirmed === true && validateGroupScore(result.a, result.b).ok;
}

// ---------- Tabelle ----------

function emptyRow(team) {
  return { teamId: team.id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, diff: 0, pts: 0 };
}

function addResult(row, gf, ga) {
  row.played += 1;
  row.gf += gf;
  row.ga += ga;
  row.diff = row.gf - row.ga;
  if (gf > ga) {
    row.won += 1;
    row.pts += 2;
  } else if (gf === ga) {
    row.drawn += 1;
    row.pts += 1;
  } else {
    row.lost += 1;
  }
}

function confirmedMatches(schedule, results, upToRound) {
  return schedule.filter((m) => m.round <= upToRound && isConfirmedGroup(results[m.id]));
}

function statsFor(teamIds, matches, results) {
  const rows = Object.fromEntries(teamIds.map((id) => [id, emptyRow(TEAM_BY_ID[id] ?? { id })]));
  for (const m of matches) {
    if (!(m.home in rows) || !(m.away in rows)) continue;
    const { a, b } = results[m.id];
    addResult(rows[m.home], a, b);
    addResult(rows[m.away], b, a);
  }
  return rows;
}

const cmpStats = (x, y) => y.pts - x.pts || y.diff - x.diff || y.gf - x.gf;

// Teilt eine sortierte Liste in Gruppen mit identischen Werten.
function splitEqual(ids, stats) {
  const sorted = [...ids].sort((a, b) => cmpStats(stats[a], stats[b]) || TEAM_BY_ID[a].seed - TEAM_BY_ID[b].seed);
  const groups = [];
  for (const id of sorted) {
    const last = groups[groups.length - 1];
    if (last && cmpStats(stats[last[0]], stats[id]) === 0) last.push(id);
    else groups.push([id]);
  }
  return groups;
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const names = (ids) => ids.map((id) => TEAM_BY_ID[id].name).join(', ');

// Direkter Vergleich: Mini-Tabelle nur aus den Spielen der punktgleichen Teams untereinander
// (Punkte, dann Game-Differenz, dann gewonnene Games). Bleibt eine Teilgruppe gleich,
// wird der direkte Vergleich nur unter diesen Teams wiederholt.
function resolveHeadToHead(ids, matches, results, notes) {
  const mini = statsFor(ids, matches, results);
  const groups = splitEqual(ids, mini);
  const played = matches.filter((m) => ids.includes(m.home) && ids.includes(m.away)).length;
  const detail = ids
    .map((id) => mini[id])
    .sort(cmpStats)
    .map((r) => `${TEAM_BY_ID[r.teamId].name} ${r.pts} Pkt, ${signed(r.diff)}, ${r.gf} Games`)
    .join(' · ');

  if (groups.length === 1) {
    notes.push({
      kind: 'unresolved',
      text:
        played === 0
          ? `Direkter Vergleich ${names(ids)}: noch kein Spiel gegeneinander – Gleichstand bleibt.`
          : `Direkter Vergleich ${names(ids)}: weiterhin gleich (${detail}).`,
    });
    return [ids];
  }
  notes.push({ kind: 'h2h', text: `Direkter Vergleich ${names(ids)}: ${detail}.` });
  const slots = [];
  for (const g of groups) {
    if (g.length === 1) slots.push(g);
    else slots.push(...resolveHeadToHead(g, matches, results, notes));
  }
  return slots;
}

export function tieKey(upToRound, row, ids) {
  return `R${upToRound}|${row.pts}|${row.diff}|${row.gf}|${[...ids].sort().join(',')}`;
}

/**
 * Berechnet die Tabelle nach `upToRound` aus allen bestätigten Matches bis einschließlich dieser Runde.
 * manualTies: { [tieKey]: [teamId, ...] } – manuelle Entscheidung des Organisators bei echtem Gleichstand.
 */
export function computeStandings(results, { upToRound = ROUNDS, manualTies = {}, schedule = SCHEDULE, teams = TEAMS } = {}) {
  const matches = confirmedMatches(schedule, results, upToRound);
  const stats = statsFor(
    teams.map((t) => t.id),
    matches,
    results,
  );
  const notes = [];
  const unresolved = [];
  const slots = [];

  for (const group of splitEqual(
    teams.map((t) => t.id),
    stats,
  )) {
    if (group.length === 1) {
      slots.push({ ids: group, method: null });
      continue;
    }
    const s = stats[group[0]];
    notes.push({
      kind: 'tie',
      text: `Gleich nach Punkten, Game-Differenz und gewonnenen Games (${s.pts} Pkt, ${signed(s.diff)}, ${s.gf} Games): ${names(group)}.`,
    });
    for (const sub of resolveHeadToHead(group, matches, results, notes)) {
      if (sub.length === 1) {
        slots.push({ ids: sub, method: 'h2h' });
        continue;
      }
      const key = tieKey(upToRound, stats[sub[0]], sub);
      const manual = manualTies[key];
      const validManual =
        Array.isArray(manual) && manual.length === sub.length && sub.every((id) => manual.includes(id));
      if (validManual) {
        notes.push({ kind: 'manual', text: `Manuelle Entscheidung des Organisators: ${names(manual)}.` });
        for (const id of manual) slots.push({ ids: [id], method: 'manual', key });
      } else {
        unresolved.push({ key, ids: sub });
        slots.push({ ids: sub, method: 'unresolved', key });
      }
    }
  }

  const rows = [];
  let pos = 1;
  for (const slot of slots) {
    const ordered = [...slot.ids].sort((a, b) => TEAM_BY_ID[a].seed - TEAM_BY_ID[b].seed);
    for (const id of ordered) {
      rows.push({
        ...stats[id],
        team: TEAM_BY_ID[id],
        rank: pos,
        position: rows.length + 1,
        tied: slot.method === 'unresolved',
        tieKey: slot.key ?? null,
        tieIds: slot.method === 'unresolved' ? ordered : null,
        decidedBy: slot.method,
      });
    }
    pos += slot.ids.length;
  }

  return { rows, notes, unresolved, confirmedCount: matches.length, upToRound };
}

export function groupProgress(results, schedule = SCHEDULE) {
  const confirmed = schedule.filter((m) => isConfirmedGroup(results[m.id])).length;
  return { confirmed, total: schedule.length, complete: confirmed === schedule.length };
}

// Erste Runde mit noch offenem Spiel; 'finals' wenn alle Vorrundenspiele bestätigt sind.
export function currentRound(results, schedule = SCHEDULE) {
  for (let r = 1; r <= ROUNDS; r++) {
    if (schedule.some((m) => m.round === r && !isConfirmedGroup(results[m.id]))) return r;
  }
  return 'finals';
}

// Letzte Runde, deren Spiele alle bestätigt sind (0 = noch keine).
export function lastCompleteRound(results, schedule = SCHEDULE) {
  let last = 0;
  for (let r = 1; r <= ROUNDS; r++) {
    if (schedule.filter((m) => m.round === r).every((m) => isConfirmedGroup(results[m.id]))) last = r;
    else break;
  }
  return last;
}

// ---------- Platzierungsspiele ----------

/**
 * Erzeugt die Platzierungsspiele aus der endgültigen Vorrundentabelle.
 * Gesperrt, solange nicht alle 15 Spiele bestätigt sind oder ein ungeklärter
 * Gleichstand über die Grenze zweier Platzierungsspiele hinweg besteht.
 */
export function finalPairings(results, manualTies = {}, schedule = SCHEDULE) {
  const progress = groupProgress(results, schedule);
  if (!progress.complete) {
    return { unlocked: false, reason: `Noch ${progress.total - progress.confirmed} Vorrundenspiele offen.`, pairings: null, standings: null, blocking: [] };
  }
  const standings = computeStandings(results, { upToRound: ROUNDS, manualTies, schedule });
  const pairOf = (position) => Math.ceil(position / 2);
  const blocking = standings.unresolved.filter((g) => {
    const positions = standings.rows.filter((r) => g.ids.includes(r.teamId)).map((r) => pairOf(r.position));
    return new Set(positions).size > 1;
  });
  if (blocking.length) {
    return {
      unlocked: false,
      reason: 'Ungeklärter Gleichstand in der Vorrundentabelle – bitte in der Tabelle manuell entscheiden.',
      pairings: null,
      standings,
      blocking,
    };
  }
  const byPos = (p) => standings.rows[p - 1].teamId;
  const pairings = Object.fromEntries(
    FINALS.map((f) => [f.id, { ...f, teamA: byPos(f.places[0]), teamB: byPos(f.places[1]) }]),
  );
  return { unlocked: true, reason: null, pairings, standings, blocking: [] };
}

/**
 * Ordnet ein gespeichertes Finalergebnis der aktuellen Paarung zu.
 * Gespeicherte Ergebnisse enthalten immer die Team-IDs. Passt die Paarung nicht mehr,
 * wird das Ergebnis als „veraltet“ markiert und nicht gewertet.
 */
export function finalMatchState(pairing, stored) {
  if (!pairing) return { status: 'locked' };
  if (!stored || (stored.a == null && stored.b == null)) return { status: 'empty', a: null, b: null, golden: null };
  const same = stored.teamA === pairing.teamA && stored.teamB === pairing.teamB;
  const swapped = stored.teamA === pairing.teamB && stored.teamB === pairing.teamA;
  if (!same && !swapped) return { status: 'stale', stored };
  const a = same ? stored.a : stored.b;
  const b = same ? stored.b : stored.a;
  const v = validateFinalScore(a, b, stored.golden, pairing.teamA, pairing.teamB);
  return {
    status: stored.confirmed && v.ok ? 'confirmed' : 'entered',
    a,
    b,
    golden: stored.golden ?? null,
    winner: v.ok ? v.winner : null,
    validation: v,
  };
}

export function finalRanking(results, finalsResults, manualTies = {}, schedule = SCHEDULE) {
  const fp = finalPairings(results, manualTies, schedule);
  if (!fp.unlocked) return { complete: false, places: [], pairings: fp };
  const places = [];
  let done = 0;
  for (const f of FINALS) {
    const p = fp.pairings[f.id];
    const st = finalMatchState(p, finalsResults[f.id]);
    if (st.status === 'confirmed') {
      done += 1;
      const loser = st.winner === p.teamA ? p.teamB : p.teamA;
      places.push({ place: f.places[0], teamId: st.winner, decided: true, score: [st.a, st.b], match: f.id });
      places.push({ place: f.places[1], teamId: loser, decided: true, score: [st.a, st.b], match: f.id });
    } else {
      places.push({ place: f.places[0], teamId: null, decided: false, candidates: [p.teamA, p.teamB], match: f.id });
      places.push({ place: f.places[1], teamId: null, decided: false, candidates: [p.teamA, p.teamB], match: f.id });
    }
  }
  places.sort((x, y) => x.place - y.place);
  return { complete: done === FINALS.length, places, pairings: fp };
}

// ---------- Export ----------

export function formatDiff(n) {
  return signed(n);
}

export function exportText(state) {
  const { results = {}, finals = {}, manualTies = {} } = state;
  const lines = [];
  lines.push(`${TOURNAMENT.name} – ${TOURNAMENT.dateLabel}`);
  lines.push('');
  for (let r = 1; r <= ROUNDS; r++) {
    lines.push(`Runde ${r} (${roundStartTime(r)} Uhr)`);
    for (const m of SCHEDULE.filter((x) => x.round === r)) {
      const res = results[m.id];
      const score = isConfirmedGroup(res) ? `${res.a}:${res.b}` : res && res.a != null ? `${res.a ?? '–'}:${res.b ?? '–'} (unbestätigt)` : 'offen';
      lines.push(`  ${m.court}: ${TEAM_BY_ID[m.home].name} – ${TEAM_BY_ID[m.away].name}  ${score}`);
    }
  }
  lines.push('');
  const st = computeStandings(results, { manualTies });
  lines.push('Vorrundentabelle (Pl. Team | Sp S U N | Games | Diff | Pkt)');
  for (const row of st.rows) {
    lines.push(
      `  ${row.rank}.${row.tied ? '=' : ''} ${row.team.name} | ${row.played} ${row.won} ${row.drawn} ${row.lost} | ${row.gf}:${row.ga} | ${signed(row.diff)} | ${row.pts}`,
    );
  }
  const fr = finalRanking(results, finals, manualTies);
  if (fr.pairings.unlocked) {
    lines.push('');
    lines.push('Platzierungsspiele');
    for (const f of FINALS) {
      const p = fr.pairings.pairings[f.id];
      const s = finalMatchState(p, finals[f.id]);
      let score = 'offen';
      if (s.status === 'confirmed') {
        score = `${s.a}:${s.b}${s.a === s.b ? ` (Golden Point: ${TEAM_BY_ID[s.golden].name})` : ''}`;
      }
      lines.push(`  ${f.court} ${f.label}: ${TEAM_BY_ID[p.teamA].name} – ${TEAM_BY_ID[p.teamB].name}  ${score}`);
    }
  }
  if (fr.complete) {
    lines.push('');
    lines.push('Endstand');
    for (const p of fr.places) lines.push(`  ${p.place}. ${TEAM_BY_ID[p.teamId].name} (${TEAM_BY_ID[p.teamId].players.join(' & ')})`);
  }
  return lines.join('\n');
}
