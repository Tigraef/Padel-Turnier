// TJ Padel Masters (29.11.2026): reine Turnierlogik ohne React – wird von der App und von den Tests genutzt.
// Alle Tabellenwerte werden aus den gespeicherten Ergebnissen berechnet, nie separat gespeichert.

export const TOURNAMENT = {
  name: 'TJ Padel Masters',
  date: '2026-11-29',
  dateLabel: 'Sonntag, 29. November 2026',
  startTime: '11:00',
  endTime: '14:00',
  roundMinutes: 20,
  pauseAfterRound: 4, // kurze Pause mit Gebäck in der Mitte
  pauseMinutes: 10,
};

// Platzhalter – echte Teamnamen und Spieler hier eintragen. Die IDs (t1 … t8) bitte nicht ändern,
// sonst passen bereits gespeicherte Ergebnisse nicht mehr zum Spielplan.
export const TEAMS = [
  { id: 't1', seed: 1, name: 'Team 1', players: ['Spieler 1', 'Spieler 2'] },
  { id: 't2', seed: 2, name: 'Team 2', players: ['Spieler 3', 'Spieler 4'] },
  { id: 't3', seed: 3, name: 'Team 3', players: ['Spieler 5', 'Spieler 6'] },
  { id: 't4', seed: 4, name: 'Team 4', players: ['Spieler 7', 'Spieler 8'] },
  { id: 't5', seed: 5, name: 'Team 5', players: ['Spieler 9', 'Spieler 10'] },
  { id: 't6', seed: 6, name: 'Team 6', players: ['Spieler 11', 'Spieler 12'] },
  { id: 't7', seed: 7, name: 'Team 7', players: ['Spieler 13', 'Spieler 14'] },
  { id: 't8', seed: 8, name: 'Team 8', players: ['Spieler 15', 'Spieler 16'] },
];

export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

// Reihenfolge = Blick vom Eingang (links nach rechts). Bezeichnungen bei Bedarf anpassen.
export const COURTS = [
  { id: 'C1', side: '' },
  { id: 'C2', side: '' },
  { id: 'C3', side: '' },
  { id: 'C4', side: '' },
];

export const ROUNDS = 7;
export const MATCHES_PER_ROUND = 4;
export const GROUP_MAX_GAMES = 8;
export const FINAL_FORMATS = [7, 9]; // Best of 7 oder Best of 9 Games – je nach Restzeit
export const DEFAULT_FINAL_GAMES = 9;

// Fester Spielplan (Rundenturnier, jedes Team spielt in jeder Runde).
// Die Courts sind so verteilt, dass kein Team öfter als zweimal auf demselben Court spielt.
const FIXED = [
  [['t8', 't7'], ['t1', 't6'], ['t2', 't5'], ['t3', 't4']],
  [['t8', 't1'], ['t2', 't7'], ['t3', 't6'], ['t4', 't5']],
  [['t3', 't1'], ['t5', 't6'], ['t4', 't7'], ['t8', 't2']],
  [['t4', 't2'], ['t5', 't1'], ['t8', 't3'], ['t6', 't7']],
  [['t5', 't3'], ['t8', 't4'], ['t6', 't2'], ['t7', 't1']],
  [['t6', 't4'], ['t7', 't3'], ['t8', 't5'], ['t1', 't2']],
  [['t7', 't5'], ['t2', 't3'], ['t1', 't4'], ['t8', 't6']],
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

// Platzierungsspiele parallel auf allen vier Courts (Finale auf dem ersten Court).
export const FINALS = [
  { id: 'final', court: 'C1', label: 'Finale', places: [1, 2] },
  { id: 'p3', court: 'C2', label: 'Spiel um Platz 3', places: [3, 4] },
  { id: 'p5', court: 'C3', label: 'Spiel um Platz 5', places: [5, 6] },
  { id: 'p7', court: 'C4', label: 'Spiel um Platz 7', places: [7, 8] },
];

// Gespeichert im Abschnitt „finals“ unter diesem Schlüssel, damit die Wahl auf beiden Handys
// und in der Live-Ansicht ankommt (confirmed: true, sonst filtert die Live-Ansicht sie heraus).
export const FORMAT_KEY = 'format';

export function finalMaxGames(finals) {
  const g = finals?.[FORMAT_KEY]?.games;
  return FINAL_FORMATS.includes(g) ? g : DEFAULT_FINAL_GAMES;
}

export function finalsSkipped(finals) {
  return finals?.[FORMAT_KEY]?.skip === true;
}

const toClock = (total) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Geplante Startzeit einer Runde; Runde ROUNDS + 1 = Platzierungsspiele. */
export function roundStartTime(round) {
  const [h, m] = TOURNAMENT.startTime.split(':').map(Number);
  const pause = round > TOURNAMENT.pauseAfterRound ? TOURNAMENT.pauseMinutes : 0;
  return toClock(h * 60 + m + (round - 1) * TOURNAMENT.roundMinutes + pause);
}

export function pauseTime() {
  const [h, m] = TOURNAMENT.startTime.split(':').map(Number);
  const start = h * 60 + m + TOURNAMENT.pauseAfterRound * TOURNAMENT.roundMinutes;
  return { from: toClock(start), to: toClock(start + TOURNAMENT.pauseMinutes) };
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
    const inRound = schedule.filter((m) => m.round === r);
    const ids = inRound.flatMap((m) => [m.home, m.away]);
    const courts = new Set(inRound.map((m) => m.court));
    return (
      ids.length !== teams.length ||
      new Set(ids).size !== teams.length ||
      !teams.every((t) => ids.includes(t.id)) ||
      courts.size !== inRound.length
    );
  });
  checks.push({
    label: 'Jedes Team spielt genau einmal pro Runde – niemand setzt aus',
    ok: rounds.length === ROUNDS && badRounds.length === 0,
    detail: badRounds.length ? `Fehler in Runde ${badRounds.join(', ')}` : `${rounds.length} Runden auf ${MATCHES_PER_ROUND} Courts geprüft`,
  });

  const overused = [];
  for (const t of teams) {
    for (const c of COURTS) {
      const n = schedule.filter((m) => m.court === c.id && (m.home === t.id || m.away === t.id)).length;
      if (n > 2) overused.push(`${t.name} ${n}× auf ${c.id}`);
    }
  }
  checks.push({
    label: 'Courts gleichmäßig verteilt (höchstens 2× derselbe Court)',
    ok: overused.length === 0,
    detail: overused.length ? overused.join(', ') : 'Jedes Team wechselt regelmäßig den Court',
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

export function validateFinalScore(a, b, golden, teamA, teamB, maxGames = DEFAULT_FINAL_GAMES) {
  if (a == null || b == null || a === '' || b === '') return { ok: false, error: 'Bitte beide Ergebnisse eintragen.', winner: null };
  if (!isInt(a) || !isInt(b)) return { ok: false, error: 'Nur ganze Zahlen ab 0 sind erlaubt.', winner: null };
  const toWin = Math.ceil(maxGames / 2);
  if (a + b > maxGames) {
    return { ok: false, error: `Höchstens ${maxGames} Games pro Platzierungsspiel (eingetragen: ${a + b}).`, winner: null };
  }
  if (a > toWin || b > toWin) {
    return { ok: false, error: `Best of ${maxGames}: Mit ${toWin} Games ist das Spiel gewonnen.`, winner: null };
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
 * Gesperrt, solange nicht alle 28 Spiele bestätigt sind oder ein ungeklärter
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
export function finalMatchState(pairing, stored, maxGames = DEFAULT_FINAL_GAMES) {
  if (!pairing) return { status: 'locked' };
  if (!stored || (stored.a == null && stored.b == null)) return { status: 'empty', a: null, b: null, golden: null };
  const same = stored.teamA === pairing.teamA && stored.teamB === pairing.teamB;
  const swapped = stored.teamA === pairing.teamB && stored.teamB === pairing.teamA;
  if (!same && !swapped) return { status: 'stale', stored };
  const a = same ? stored.a : stored.b;
  const b = same ? stored.b : stored.a;
  const v = validateFinalScore(a, b, stored.golden, pairing.teamA, pairing.teamB, maxGames);
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
  if (!fp.unlocked) return { complete: false, places: [], pairings: fp, skipped: false };
  // Keine Zeit mehr für Platzierungsspiele: dann zählt die Abschlusstabelle.
  if (finalsSkipped(finalsResults)) {
    const open = fp.standings.unresolved.length > 0;
    const places = fp.standings.rows.map((r) => ({ place: r.position, teamId: r.teamId, decided: !open, candidates: open ? [r.teamId] : undefined, fromTable: true }));
    return { complete: !open, places, pairings: fp, skipped: true };
  }
  const places = [];
  let done = 0;
  for (const f of FINALS) {
    const p = fp.pairings[f.id];
    const st = finalMatchState(p, finalsResults[f.id], finalMaxGames(finalsResults));
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
  return { complete: done === FINALS.length, places, pairings: fp, skipped: false };
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
    if (r === TOURNAMENT.pauseAfterRound) lines.push(`Pause (${pauseTime().from}–${pauseTime().to} Uhr)`);
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
  if (fr.pairings.unlocked && !fr.skipped) {
    lines.push('');
    lines.push(`Platzierungsspiele (Best of ${finalMaxGames(finals)} Games)`);
    for (const f of FINALS) {
      const p = fr.pairings.pairings[f.id];
      const s = finalMatchState(p, finals[f.id], finalMaxGames(finals));
      let score = 'offen';
      if (s.status === 'confirmed') {
        score = `${s.a}:${s.b}${s.a === s.b ? ` (Golden Point: ${TEAM_BY_ID[s.golden].name})` : ''}`;
      }
      lines.push(`  ${f.court} ${f.label}: ${TEAM_BY_ID[p.teamA].name} – ${TEAM_BY_ID[p.teamB].name}  ${score}`);
    }
  }
  if (fr.complete) {
    lines.push('');
    lines.push(fr.skipped ? 'Endstand (Abschlusstabelle, ohne Platzierungsspiele)' : 'Endstand');
    for (const p of fr.places) lines.push(`  ${p.place}. ${TEAM_BY_ID[p.teamId].name} (${TEAM_BY_ID[p.teamId].players.join(' & ')})`);
  }
  return lines.join('\n');
}
