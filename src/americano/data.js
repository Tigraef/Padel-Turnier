// Americano-Turnier: Spieler, fester Spielplan und Einzelwertung (reine Funktionen, getestet).

export const TITLE = 'Padel Americano';
export const POINTS_PER_MATCH = 24;
export const ROUND_MINUTES = 15;
export const START_TIME = '19:00';

export const PLAYERS = ['Liza', 'Tobi', 'Freddy', 'Daniel', 'Jana', 'Max', 'Lars', 'Kevin'];

export const COURTS = ['D7', 'D8'];

// Fester Spielplan – exakt wie vorgegeben (8 Spieler, 7 Runden, keine Pausen).
// Pro Runde: [[D7-Team1, D7-Team2], [D8-Team1, D8-Team2]]. Jeder spielt genau einmal mit jedem zusammen.
const FIXED = [
  { round: 1, matches: [[['Tobi', 'Freddy'], ['Daniel', 'Jana']], [['Liza', 'Kevin'], ['Max', 'Lars']]], pause: [] },
  { round: 2, matches: [[['Liza', 'Jana'], ['Daniel', 'Kevin']], [['Tobi', 'Max'], ['Lars', 'Freddy']]], pause: [] },
  { round: 3, matches: [[['Liza', 'Freddy'], ['Tobi', 'Kevin']], [['Lars', 'Jana'], ['Daniel', 'Max']]], pause: [] },
  { round: 4, matches: [[['Liza', 'Daniel'], ['Tobi', 'Lars']], [['Jana', 'Kevin'], ['Max', 'Freddy']]], pause: [] },
  { round: 5, matches: [[['Liza', 'Max'], ['Daniel', 'Freddy']], [['Tobi', 'Jana'], ['Lars', 'Kevin']]], pause: [] },
  { round: 6, matches: [[['Liza', 'Tobi'], ['Max', 'Jana']], [['Lars', 'Daniel'], ['Kevin', 'Freddy']]], pause: [] },
  { round: 7, matches: [[['Liza', 'Lars'], ['Freddy', 'Jana']], [['Tobi', 'Daniel'], ['Kevin', 'Max']]], pause: [] },
];

export const ROUNDS = FIXED.map((r) => ({
  round: r.round,
  bonus: !!r.bonus,
  label: r.bonus ? 'Bonusrunde' : `Runde ${r.round}`,
  short: r.bonus ? 'Bonus' : `R${r.round}`,
  pause: r.pause,
  matches: r.matches.map(([team1, team2], i) => ({
    id: `${r.bonus ? 'bonus' : `r${r.round}`}-${COURTS[i]}`,
    round: r.round,
    bonus: !!r.bonus,
    court: COURTS[i],
    team1,
    team2,
  })),
}));

export const MATCHES = ROUNDS.flatMap((r) => r.matches);
export const REGULAR_ROUNDS = ROUNDS.filter((r) => !r.bonus).length;

export function roundTime(round) {
  const [h, m] = START_TIME.split(':').map(Number);
  const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const start = h * 60 + m + (round - 1) * ROUND_MINUTES;
  return `${fmt(start)}–${fmt(start + ROUND_MINUTES)}`;
}

// ---------- Spielplanprüfung ----------

export function validateSchedule(rounds = ROUNDS, players = PLAYERS) {
  const checks = [];
  const bad = rounds.filter((r) => {
    const names = [...r.matches.flatMap((m) => [...m.team1, ...m.team2]), ...r.pause];
    return names.length !== players.length || new Set(names).size !== players.length || !players.every((p) => names.includes(p));
  });
  checks.push({
    label: `Jede Runde: alle ${players.length} Spieler genau einmal eingeteilt`,
    ok: bad.length === 0,
    detail: bad.length ? `Fehler in ${bad.map((r) => r.label).join(', ')}` : `${rounds.length} Runden geprüft`,
  });

  const pairs = rounds.flatMap((r) => r.matches.flatMap((m) => [m.team1, m.team2])).map((t) => [...t].sort().join('+'));
  const dup = pairs.filter((p, i) => pairs.indexOf(p) !== i);
  checks.push({
    label: 'Kein Paar spielt zweimal zusammen',
    ok: dup.length === 0,
    detail: dup.length ? `Doppelt: ${[...new Set(dup)].join(', ')}` : `${pairs.length} verschiedene Paare`,
  });

  const counts = gamesPerPlayer(rounds.filter((r) => !r.bonus), players);
  const values = Object.values(counts);
  checks.push({
    label: 'Spiele pro Person',
    ok: true,
    detail:
      Math.min(...values) === Math.max(...values)
        ? `alle ${values[0]}`
        : players.map((p) => `${p} ${counts[p]}`).join(', '),
  });
  return { ok: checks.every((c) => c.ok), checks };
}

export function gamesPerPlayer(rounds = ROUNDS, players = PLAYERS) {
  const counts = Object.fromEntries(players.map((p) => [p, 0]));
  for (const r of rounds) for (const m of r.matches) for (const p of [...m.team1, ...m.team2]) counts[p] += 1;
  return counts;
}

// ---------- Ergebnisse ----------

const isInt = (v) => Number.isInteger(v) && v >= 0;

export function validateScore(a, b) {
  if (a == null || b == null || a === '' || b === '') return { ok: false, error: 'Bitte beide Punktzahlen eintragen.' };
  if (!isInt(a) || !isInt(b)) return { ok: false, error: 'Nur ganze Zahlen ab 0 sind erlaubt.' };
  if (a + b > POINTS_PER_MATCH) {
    return { ok: false, error: `Höchstens ${POINTS_PER_MATCH} Punkte pro Match (eingetragen: ${a + b}).` };
  }
  return { ok: true, error: null, complete: a + b === POINTS_PER_MATCH };
}

export function isConfirmed(result) {
  return !!result && result.confirmed === true && validateScore(result.a, result.b).ok;
}

// ---------- Rangliste ----------

/**
 * Einzelwertung aus allen bestätigten Matches (optional nur bis einschließlich `upToRound`).
 * Jeder Spieler bekommt die Punkte seines Teams. Wer die meisten Punkte hat, gewinnt.
 * Bei gleicher Punktzahl teilen sich die Spieler den Platz. Wer noch nicht gespielt hat, steht unten.
 */
export function computeRanking(results, { upToRound = Infinity, players = PLAYERS, matches = MATCHES } = {}) {
  const rows = Object.fromEntries(
    players.map((p) => [p, { player: p, played: 0, won: 0, drawn: 0, lost: 0, points: 0, against: 0 }]),
  );
  let counted = 0;
  for (const m of matches) {
    if (m.round > upToRound) continue;
    const res = results[m.id];
    if (!isConfirmed(res)) continue;
    counted += 1;
    const sides = [
      [m.team1, res.a, res.b],
      [m.team2, res.b, res.a],
    ];
    for (const [team, own, opp] of sides) {
      for (const p of team) {
        const row = rows[p];
        row.played += 1;
        row.points += own;
        row.against += opp;
        if (own > opp) row.won += 1;
        else if (own === opp) row.drawn += 1;
        else row.lost += 1;
      }
    }
  }

  const list = Object.values(rows).map((r) => ({
    ...r,
    diff: r.points - r.against,
    average: r.played ? r.points / r.played : null,
  }));

  const cmp = (x, y) => {
    if (!x.played || !y.played) return !x.played - !y.played;
    return y.points - x.points;
  };
  list.sort((x, y) => cmp(x, y) || players.indexOf(x.player) - players.indexOf(y.player));

  let rank = 0;
  list.forEach((r, i) => {
    if (i === 0 || cmp(list[i - 1], r) !== 0) rank = i + 1;
    r.rank = r.played ? rank : null;
  });
  for (const r of list) r.tied = r.rank != null && list.filter((o) => o.rank === r.rank).length > 1;

  return { rows: list, counted };
}

export function formatAverage(avg) {
  return avg == null ? '–' : avg.toFixed(2).replace('.', ',');
}

export function signed(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/** Erste Runde (ohne Bonus) mit offenem Match; 'bonus' danach (falls es eine gibt); 'done' wenn alles bestätigt ist. */
export function currentRound(results) {
  for (const r of ROUNDS.filter((x) => !x.bonus)) {
    if (r.matches.some((m) => !isConfirmed(results[m.id]))) return r.round;
  }
  const bonus = ROUNDS.find((r) => r.bonus);
  if (!bonus) return 'done';
  return bonus.matches.every((m) => isConfirmed(results[m.id])) ? 'done' : 'bonus';
}

export function progress(results) {
  const regular = MATCHES.filter((m) => !m.bonus);
  const confirmed = regular.filter((m) => isConfirmed(results[m.id])).length;
  return { confirmed, total: regular.length, complete: confirmed === regular.length };
}

export function exportText(results) {
  const lines = [`${TITLE} – Ergebnisse`, ''];
  for (const r of ROUNDS) {
    lines.push(`${r.label} (${roundTime(r.round)})`);
    for (const m of r.matches) {
      const res = results[m.id];
      const score = isConfirmed(res) ? `${res.a}:${res.b}` : 'offen';
      lines.push(`  ${m.court}: ${m.team1.join(' + ')} – ${m.team2.join(' + ')}  ${score}`);
    }
    if (r.pause.length) lines.push(`  Pause: ${r.pause.join(', ')}`);
  }
  lines.push('', 'Rangliste (Gesamtpunkte)');
  for (const row of computeRanking(results).rows) {
    lines.push(
      `  ${row.rank ?? '–'}. ${row.player}: ${row.points} Punkte in ${row.played} Matches`,
    );
  }
  return lines.join('\n');
}
