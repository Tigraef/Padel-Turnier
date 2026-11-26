// TJ Padel Masters (29.11.2026): reine Turnierlogik ohne React – wird von der App und von den Tests genutzt.
// Alle Tabellenwerte werden aus den gespeicherten Ergebnissen berechnet, nie separat gespeichert.

export const TOURNAMENT = {
  name: 'TJ Padel Masters',
  date: '2026-11-29',
  dateLabel: 'Sonntag, 29. November 2026',
  venue: 'Hanse Padel Hamburg',
  timeZone: 'Europe/Berlin',
};

// Standard-Zeitplan. Die Turnierleitung kann alles im Admin-Bereich ändern (gespeichert unter settings/times).
export const DEFAULT_TIMES = {
  start: '11:00',
  roundMinutes: 20,
  pauseAfterRound: 4,
  pauseMinutes: 10,
  evalMinutes: 5,
  end: '14:00',
  overrides: {}, // { 1: '11:05', …, finals: '13:40' } – abweichende Startzeiten einzelner Runden
};

// Teams laut Ausschreibung. Namen und Spieler sind im Admin-Bereich änderbar (settings „teams/<id>“);
// die IDs t1 … t8 entsprechen den Nummern 1 … 8 aus dem Spielplan und bleiben fest.
export const DEFAULT_TEAMS = [
  { id: 't1', seed: 1, name: 'Die Lobster', players: ['Tim', 'Jana'] },
  { id: 't2', seed: 2, name: 'Spannenlanger Hansel, nudeldicke Dirn', players: ['Steffi', 'Lars'] },
  { id: 't3', seed: 3, name: 'Die Schmetterlinge', players: ['Liza', 'Tobi'] },
  { id: 't4', seed: 4, name: 'Scheiben Schubser', players: ['Kevin', 'Maria'] },
  { id: 't5', seed: 5, name: 'Netzfetzer', players: ['Lennart', 'Bendix'] },
  { id: 't6', seed: 6, name: 'Poco a Poco', players: ['Alex', 'Zara'] },
  { id: 't7', seed: 7, name: 'Die Osi’s', players: ['Bosi', 'Sophie'] },
  { id: 't8', seed: 8, name: 'Der Schlägertrupp', players: ['Hannes', 'Max'] },
];
export const TEAM_IDS = DEFAULT_TEAMS.map((t) => t.id);
const SEED = Object.fromEntries(DEFAULT_TEAMS.map((t) => [t.id, t.seed]));
export const LOBSTER = 't1';
export const LOBSTER_COURT = 'D8';

export const COURTS = ['D6', 'D7', 'D8', 'D9'];

export const ROUNDS = 7;
export const MATCHES_PER_ROUND = 4;
export const GROUP_GAMES = 8;

// Verbindlicher Spielplan (Team-Nummern, Reihenfolge der Courts D6, D7, D8, D9).
const FIXED = [
  [[3, 6], [2, 7], [1, 8], [4, 5]],
  [[8, 6], [3, 4], [1, 7], [2, 5]],
  [[7, 5], [8, 4], [1, 6], [2, 3]],
  [[6, 4], [7, 3], [1, 5], [8, 2]],
  [[5, 3], [6, 2], [1, 4], [7, 8]],
  [[4, 2], [5, 8], [1, 3], [6, 7]],
  [[3, 8], [4, 7], [1, 2], [5, 6]],
];

export const SCHEDULE = FIXED.flatMap((round, r) =>
  round.map(([home, away], c) => ({
    id: `r${r + 1}-${COURTS[c]}`,
    round: r + 1,
    court: COURTS[c],
    home: `t${home}`,
    away: `t${away}`,
  })),
);

// Platzierungsspiele nach der Abschlusstabelle der Vorrunde.
export const FINALS = [
  { id: 'final', court: 'D8', label: 'Finale', places: [1, 2] },
  { id: 'p3', court: 'D7', label: 'Spiel um Platz 3', places: [3, 4] },
  { id: 'p5', court: 'D6', label: 'Spiel um Platz 5', places: [5, 6] },
  { id: 'p7', court: 'D9', label: 'Spiel um Platz 7', places: [7, 8] },
];

// ---------- Teams ----------

/** Teams mit den Änderungen der Turnierleitung (settings „teams/<id>“ = { name, players }). */
export function resolveTeams(settings = {}) {
  return DEFAULT_TEAMS.map((t) => {
    const o = settings[`teams/${t.id}`];
    if (!o) return t;
    const players = Array.isArray(o.players) ? [o.players[0] ?? t.players[0], o.players[1] ?? t.players[1]] : t.players;
    return { ...t, name: (o.name || '').trim() || t.name, players };
  });
}

export function teamMap(teams = DEFAULT_TEAMS) {
  return Object.fromEntries(teams.map((t) => [t.id, t]));
}

// ---------- Zeitplan ----------

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const toClock = (total) => {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
export const isClock = (v) => toMin(v) != null && toMin(v) < 1440;

export function resolveTimes(settings = {}) {
  const t = { ...DEFAULT_TIMES, ...(settings.times || {}) };
  return { ...t, overrides: { ...(t.overrides || {}) } };
}

/**
 * Berechnet den kompletten Zeitplan. Jede Runde beginnt nach der vorherigen (plus Pause nach
 * pauseAfterRound), außer die Turnierleitung hat für eine Runde eine eigene Startzeit gesetzt.
 */
export function timeline(times = DEFAULT_TIMES) {
  const rm = Number(times.roundMinutes) || DEFAULT_TIMES.roundMinutes;
  const pm = Math.max(0, Number(times.pauseMinutes) || 0);
  const em = Math.max(0, Number(times.evalMinutes) || 0);
  const ov = times.overrides || {};
  const rounds = [];
  let cursor = toMin(times.start) ?? toMin(DEFAULT_TIMES.start);
  let pause = null;
  for (let r = 1; r <= ROUNDS; r++) {
    const start = toMin(ov[r]) ?? cursor;
    rounds.push({ round: r, start, end: start + rm, from: toClock(start), to: toClock(start + rm) });
    cursor = start + rm;
    if (r === Number(times.pauseAfterRound) && pm > 0) {
      pause = { start: cursor, end: cursor + pm, from: toClock(cursor), to: toClock(cursor + pm) };
      cursor += pm;
    }
  }
  const evalStart = cursor;
  const finalsStart = toMin(ov.finals) ?? evalStart + em;
  const end = toMin(times.end) ?? toMin(DEFAULT_TIMES.end);
  return {
    rounds,
    pause,
    evaluation: { start: evalStart, end: finalsStart, from: toClock(evalStart), to: toClock(finalsStart) },
    finals: { start: finalsStart, from: toClock(finalsStart) },
    end: { start: end, from: toClock(end) },
    roundMinutes: rm,
    pauseMinutes: pm,
  };
}

/** Minuten seit Mitternacht in Berlin für einen Zeitpunkt. */
export function berlinMinutes(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('de-DE', { timeZone: TOURNAMENT.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return get('hour') * 60 + get('minute') + get('second') / 60;
  } catch {
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  }
}

// ---------- Spielplanprüfung ----------

export function validateSchedule(schedule = SCHEDULE) {
  const checks = [];
  const keys = schedule.map((m) => [m.home, m.away].sort().join('|'));
  const unique = new Set(keys);
  checks.push({
    label: '28 Vorrundenbegegnungen, keine doppelt',
    ok: schedule.length === 28 && unique.size === 28 && schedule.every((m) => m.home !== m.away),
    detail: `${unique.size} unterschiedliche Paarungen bei ${schedule.length} Spielen`,
  });

  const perTeam = TEAM_IDS.map((id) => schedule.filter((m) => m.home === id || m.away === id).length);
  checks.push({
    label: 'Jedes Team spielt genau 7 Vorrundenmatches',
    ok: perTeam.every((n) => n === ROUNDS),
    detail: perTeam.every((n) => n === ROUNDS) ? 'Alle 8 Teams mit 7 Matches' : `Anzahl je Team: ${perTeam.join(', ')}`,
  });

  const bad = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const inRound = schedule.filter((m) => m.round === r);
    const ids = inRound.flatMap((m) => [m.home, m.away]);
    const courts = new Set(inRound.map((m) => m.court));
    if (new Set(ids).size !== ids.length || ids.length !== 8) bad.push(`Runde ${r}: Team doppelt oder fehlt`);
    if (courts.size !== COURTS.length || !COURTS.every((c) => courts.has(c))) bad.push(`Runde ${r}: nicht alle Courts belegt`);
  }
  checks.push({
    label: 'Pro Runde jedes Team einmal, alle vier Courts belegt',
    ok: bad.length === 0,
    detail: bad.length ? bad.join(' · ') : `${ROUNDS} Runden geprüft`,
  });

  const lobsterWrong = [];
  for (let r = 1; r <= ROUNDS; r++) {
    if (!schedule.some((m) => m.round === r && m.court === LOBSTER_COURT && (m.home === LOBSTER || m.away === LOBSTER))) lobsterWrong.push(r);
  }
  checks.push({
    label: 'Die Lobster spielen jede Vorrunde auf D8',
    ok: lobsterWrong.length === 0,
    detail: lobsterWrong.length ? `Nicht auf D8 in Runde ${lobsterWrong.join(', ')}` : 'In allen 7 Runden auf D8',
  });

  return { ok: checks.every((c) => c.ok), checks };
}

// ---------- Ergebnisprüfung ----------

const isInt = (v) => Number.isInteger(v) && v >= 0;

/**
 * Vorrunde: regulär genau 8 Games. Weniger nur bei Spielabbruch wegen Zeitmangel – das muss die
 * Turnierleitung ausdrücklich bestätigen (short: true). Mehr als 8 sind nicht möglich.
 */
export function validateGroupScore(a, b, short = false) {
  if (a == null || b == null || a === '' || b === '') return { ok: false, error: 'Bitte beide Ergebnisse eintragen.' };
  if (!isInt(a) || !isInt(b)) return { ok: false, error: 'Nur ganze Zahlen ab 0 sind erlaubt.' };
  const total = a + b;
  if (total > GROUP_GAMES) return { ok: false, error: `Höchstens ${GROUP_GAMES} Games pro Vorrundenspiel (eingetragen: ${total}).` };
  if (total < GROUP_GAMES && !short) {
    return { ok: false, needsShort: true, error: `${total} von ${GROUP_GAMES} Games – nur bei Abbruch wegen Zeitmangel bestätigen.` };
  }
  return { ok: true, error: null, short: total < GROUP_GAMES };
}

/**
 * Vorrunde: Trägt man die Games eines Teams ein, schlägt die App für den Gegner
 * GROUP_GAMES minus diesen Wert vor. `suggested` merkt sich, welche Seite ('a' | 'b')
 * gerade nur ein Vorschlag ist. Nur diese Seite wird automatisch nachgeführt; ändert man
 * sie von Hand (z. B. bei Abbruch), gilt sie als eingetragen und bleibt stehen.
 */
export function applyGroupScoreChange(result, side, next) {
  const other = side === 'a' ? 'b' : 'a';
  const cur = { a: result?.a ?? null, b: result?.b ?? null, suggested: result?.suggested ?? null };
  if (cur.suggested === side) return { a: cur.a, b: cur.b, [side]: next, suggested: null };
  const out = { a: cur.a, b: cur.b, [side]: next, suggested: cur.suggested };
  const otherFree = cur[other] == null || cur.suggested === other;
  if (otherFree && next != null && isInt(next) && next <= GROUP_GAMES) {
    out[other] = GROUP_GAMES - next;
    out.suggested = other;
  }
  return out;
}

/** Obergrenze für den Plus-Knopf einer Seite: folgt der Gegner noch dem Vorschlag, bis GROUP_GAMES. */
export function groupStepperMax(result, side) {
  const other = side === 'a' ? 'b' : 'a';
  const o = result?.[other] ?? null;
  if (o == null || result?.suggested === other) return GROUP_GAMES;
  return Math.max(0, GROUP_GAMES - o);
}

export function isConfirmedGroup(result) {
  return !!result && result.confirmed === true && validateGroupScore(result.a, result.b, !!result.short).ok;
}

/** Platzierungsspiele: keine Begrenzung der Games. Bei Gleichstand legt die Turnierleitung den Sieger fest. */
export function validateFinalScore(a, b, winner, teamA, teamB) {
  if (a == null || b == null || a === '' || b === '') return { ok: false, error: 'Bitte beide Ergebnisse eintragen.', winner: null };
  if (!isInt(a) || !isInt(b)) return { ok: false, error: 'Nur ganze Zahlen ab 0 sind erlaubt.', winner: null };
  if (a === b) {
    if (winner !== teamA && winner !== teamB) {
      return { ok: false, error: 'Gleichstand: Bitte den Sieger festlegen.', winner: null, needsWinner: true };
    }
    return { ok: true, error: null, winner, needsWinner: true };
  }
  return { ok: true, error: null, winner: a > b ? teamA : teamB, needsWinner: false };
}

// ---------- Tabelle ----------

function emptyRow(id) {
  return { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, diff: 0, pts: 0 };
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

function statsFor(teamIds, matches, results) {
  const rows = Object.fromEntries(teamIds.map((id) => [id, emptyRow(id)]));
  for (const m of matches) {
    if (!(m.home in rows) || !(m.away in rows)) continue;
    const { a, b } = results[m.id];
    addResult(rows[m.home], a, b);
    addResult(rows[m.away], b, a);
  }
  return rows;
}

const cmpStats = (x, y) => y.pts - x.pts || y.diff - x.diff || y.gf - x.gf;

function splitEqual(ids, stats) {
  const sorted = [...ids].sort((a, b) => cmpStats(stats[a], stats[b]) || SEED[a] - SEED[b]);
  const groups = [];
  for (const id of sorted) {
    const last = groups[groups.length - 1];
    if (last && cmpStats(stats[last[0]], stats[id]) === 0) last.push(id);
    else groups.push([id]);
  }
  return groups;
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
export const formatDiff = signed;

function resolveHeadToHead(ids, matches, results, notes, nameOf) {
  const names = (list) => list.map(nameOf).join(', ');
  const mini = statsFor(ids, matches, results);
  const groups = splitEqual(ids, mini);
  const played = matches.filter((m) => ids.includes(m.home) && ids.includes(m.away)).length;
  const detail = ids
    .map((id) => mini[id])
    .sort(cmpStats)
    .map((r) => `${nameOf(r.teamId)} ${r.pts} Pkt, ${signed(r.diff)}, ${r.gf} Games`)
    .join(' · ');
  if (groups.length === 1) {
    notes.push({
      kind: 'unresolved',
      text: played === 0 ? `Direkter Vergleich ${names(ids)}: noch kein Spiel gegeneinander – Gleichstand bleibt.` : `Direkter Vergleich ${names(ids)}: weiterhin gleich (${detail}).`,
    });
    return [ids];
  }
  notes.push({ kind: 'h2h', text: `Direkter Vergleich ${names(ids)}: ${detail}.` });
  const slots = [];
  for (const g of groups) {
    if (g.length === 1) slots.push(g);
    else slots.push(...resolveHeadToHead(g, matches, results, notes, nameOf));
  }
  return slots;
}

export function tieKey(upToRound, row, ids) {
  return `R${upToRound}|${row.pts}|${row.diff}|${row.gf}|${[...ids].sort().join(',')}`;
}

/**
 * Tabelle nach `upToRound` aus allen bestätigten Vorrundenspielen.
 * Reihenfolge: Punkte → Game-Differenz → gewonnene Games → direkter Vergleich → manuelle Entscheidung.
 */
export function computeStandings(results, { upToRound = ROUNDS, manualTies = {}, teams = DEFAULT_TEAMS, schedule = SCHEDULE } = {}) {
  const byId = teamMap(teams);
  const nameOf = (id) => byId[id]?.name ?? id;
  const matches = schedule.filter((m) => m.round <= upToRound && isConfirmedGroup(results[m.id]));
  const stats = statsFor(TEAM_IDS, matches, results);
  const notes = [];
  const unresolved = [];
  const slots = [];

  for (const group of splitEqual(TEAM_IDS, stats)) {
    if (group.length === 1) {
      slots.push({ ids: group, method: null });
      continue;
    }
    const s = stats[group[0]];
    notes.push({ kind: 'tie', text: `Gleich nach Punkten, Game-Differenz und gewonnenen Games (${s.pts} Pkt, ${signed(s.diff)}, ${s.gf} Games): ${group.map(nameOf).join(', ')}.` });
    for (const sub of resolveHeadToHead(group, matches, results, notes, nameOf)) {
      if (sub.length === 1) {
        slots.push({ ids: sub, method: 'h2h' });
        continue;
      }
      const key = tieKey(upToRound, stats[sub[0]], sub);
      const manual = manualTies[key];
      const validManual = Array.isArray(manual) && manual.length === sub.length && sub.every((id) => manual.includes(id));
      if (validManual) {
        notes.push({ kind: 'manual', text: `Manuelle Entscheidung der Turnierleitung: ${manual.map(nameOf).join(', ')}.` });
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
    const ordered = [...slot.ids].sort((a, b) => SEED[a] - SEED[b]);
    for (const id of ordered) {
      rows.push({
        ...stats[id],
        team: byId[id],
        rank: pos,
        position: rows.length + 1,
        tied: slot.method === 'unresolved',
        tieKey: slot.key ?? null,
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

/** Erste Runde mit noch offenem Spiel; 'finals', wenn alle Vorrundenspiele bestätigt sind. */
export function currentRound(results, schedule = SCHEDULE) {
  for (let r = 1; r <= ROUNDS; r++) {
    if (schedule.some((m) => m.round === r && !isConfirmedGroup(results[m.id]))) return r;
  }
  return 'finals';
}

/** Status einer Vorrundenbegegnung: open (offen), running (läuft), done (abgeschlossen). */
export function groupMatchStatus(match, result, settings = {}) {
  if (isConfirmedGroup(result)) return 'done';
  if (result && (result.a != null || result.b != null)) return 'running';
  const r = settings[`rounds/${match.round}`];
  if (r && r.started && !r.ended) return 'running';
  return 'open';
}

// ---------- Platzierungsspiele ----------

export function finalsMode(settings = {}) {
  return settings.finalsMode?.mode === 'skip' ? 'skip' : 'play';
}

export function finalPairings(results, manualTies = {}, { teams = DEFAULT_TEAMS, schedule = SCHEDULE } = {}) {
  const progress = groupProgress(results, schedule);
  if (!progress.complete) {
    return { unlocked: false, reason: `Noch ${progress.total - progress.confirmed} Vorrundenspiele offen.`, pairings: null, standings: null, blocking: [] };
  }
  const standings = computeStandings(results, { manualTies, teams, schedule });
  const pairOf = (position) => Math.ceil(position / 2);
  const blocking = standings.unresolved.filter((g) => {
    const positions = standings.rows.filter((r) => g.ids.includes(r.teamId)).map((r) => pairOf(r.position));
    return new Set(positions).size > 1;
  });
  if (blocking.length) {
    return { unlocked: false, reason: 'Ungeklärter Gleichstand in der Tabelle – bitte in der Tabelle manuell entscheiden.', pairings: null, standings, blocking };
  }
  const byPos = (p) => standings.rows[p - 1].teamId;
  const pairings = Object.fromEntries(FINALS.map((f) => [f.id, { ...f, teamA: byPos(f.places[0]), teamB: byPos(f.places[1]) }]));
  return { unlocked: true, reason: null, pairings, standings, blocking: [] };
}

/**
 * Ordnet ein gespeichertes Platzierungsspiel der aktuellen Paarung zu.
 * status: locked | open | running | done | stale (Paarung hat sich durch eine Korrektur geändert)
 */
export function finalMatchState(pairing, stored) {
  if (!pairing) return { status: 'locked' };
  if (!stored) return { status: 'open', a: null, b: null, winner: null };
  const same = stored.teamA === pairing.teamA && stored.teamB === pairing.teamB;
  const swapped = stored.teamA === pairing.teamB && stored.teamB === pairing.teamA;
  if (!same && !swapped) return { status: 'stale', stored };
  const a = same ? stored.a ?? null : stored.b ?? null;
  const b = same ? stored.b ?? null : stored.a ?? null;
  const v = validateFinalScore(a, b, stored.winner, pairing.teamA, pairing.teamB);
  const status = stored.confirmed && v.ok ? 'done' : stored.started || a != null || b != null ? 'running' : 'open';
  return { status, a, b, winner: v.ok ? v.winner : null, manualWinner: stored.winner ?? null, validation: v };
}

/**
 * Endgültige Platzierung 1–8. Gespielte Platzierungsspiele entscheiden ihr Paar; fehlt ein Spiel
 * (übersprungen oder Turnier abgeschlossen), zählt die Reihenfolge der Abschlusstabelle.
 */
export function finalRanking(results, finals = {}, manualTies = {}, settings = {}, { teams = DEFAULT_TEAMS, schedule = SCHEDULE } = {}) {
  const fp = finalPairings(results, manualTies, { teams, schedule });
  const skipped = finalsMode(settings) === 'skip';
  const closed = !!settings.closed?.at;
  if (!fp.unlocked) return { complete: false, places: [], pairings: fp, skipped, closed };
  const places = [];
  let decided = 0;
  for (const f of FINALS) {
    const p = fp.pairings[f.id];
    const st = skipped ? { status: 'skipped' } : finalMatchState(p, finals[f.id]);
    if (st.status === 'done') {
      decided += 1;
      const loser = st.winner === p.teamA ? p.teamB : p.teamA;
      places.push({ place: f.places[0], teamId: st.winner, decided: true, by: 'final', score: [st.a, st.b], match: f.id });
      places.push({ place: f.places[1], teamId: loser, decided: true, by: 'final', score: [st.a, st.b], match: f.id });
    } else if (skipped || closed) {
      decided += 1;
      places.push({ place: f.places[0], teamId: p.teamA, decided: true, by: 'table', match: f.id });
      places.push({ place: f.places[1], teamId: p.teamB, decided: true, by: 'table', match: f.id });
    } else {
      places.push({ place: f.places[0], teamId: null, decided: false, candidates: [p.teamA, p.teamB], match: f.id });
      places.push({ place: f.places[1], teamId: null, decided: false, candidates: [p.teamA, p.teamB], match: f.id });
    }
  }
  places.sort((x, y) => x.place - y.place);
  return { complete: decided === FINALS.length, places, pairings: fp, skipped, closed };
}

// ---------- Zentraler Timer (gespeichert unter settings/timer, auf allen Geräten gleich) ----------

const MIN = 60 * 1000;

export function timerRemaining(timer, now) {
  if (!timer) return null;
  return timer.running ? Math.max(0, timer.endsAt - now) : Math.max(0, timer.remaining ?? 0);
}

export const timerOps = {
  start: (phase, round, minutes, now = Date.now()) => {
    const ms = Math.max(0, Math.round(minutes * MIN));
    return { phase, round: round ?? null, running: true, endsAt: now + ms, remaining: ms, total: ms };
  },
  pause: (t, now = Date.now()) => ({ ...t, running: false, endsAt: null, remaining: Math.max(0, t.endsAt - now) }),
  resume: (t, now = Date.now()) => ({ ...t, running: true, endsAt: now + (t.remaining || 0) }),
  reset: (t) => ({ ...t, running: false, endsAt: null, remaining: t.total }),
  adjust: (t, minutes, now = Date.now()) => {
    const d = minutes * MIN;
    if (t.running) return { ...t, endsAt: Math.max(now, t.endsAt + d), total: Math.max(0, t.total + d) };
    return { ...t, remaining: Math.max(0, (t.remaining || 0) + d), total: Math.max(0, t.total + d) };
  },
};

// ---------- Export ----------

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';

/** Alle Ergebnisse (Vorrunde und Platzierungsspiele) als CSV (Semikolon, für Excel). */
export function resultsCsv(state) {
  const { results = {}, finals = {}, manualTies = {}, settings = {} } = state;
  const teams = resolveTeams(settings);
  const byId = teamMap(teams);
  const tl = timeline(resolveTimes(settings));
  const rows = [['Phase', 'Runde', 'Uhrzeit', 'Court', 'Team A', 'Spieler A', 'Team B', 'Spieler B', 'Games A', 'Games B', 'Status', 'Hinweis']];
  for (const m of SCHEDULE) {
    const r = results[m.id];
    const done = isConfirmedGroup(r);
    rows.push([
      'Vorrunde', m.round, tl.rounds[m.round - 1].from, m.court,
      byId[m.home].name, byId[m.home].players.join(' & '), byId[m.away].name, byId[m.away].players.join(' & '),
      done ? r.a : '', done ? r.b : '', done ? 'abgeschlossen' : 'offen', done && r.short ? 'Abbruch wegen Zeitmangel' : '',
    ]);
  }
  const fp = finalPairings(results, manualTies, { teams });
  if (fp.unlocked && finalsMode(settings) !== 'skip') {
    for (const f of FINALS) {
      const p = fp.pairings[f.id];
      const st = finalMatchState(p, finals[f.id]);
      const done = st.status === 'done';
      rows.push([
        f.label, '', tl.finals.from, f.court,
        byId[p.teamA].name, byId[p.teamA].players.join(' & '), byId[p.teamB].name, byId[p.teamB].players.join(' & '),
        done ? st.a : '', done ? st.b : '', done ? 'abgeschlossen' : 'offen', done && st.a === st.b ? `Sieger festgelegt: ${byId[st.winner].name}` : '',
      ]);
    }
  }
  return csv(rows);
}

/** Abschlusstabelle der Vorrunde plus endgültige Platzierung als CSV. */
export function standingsCsv(state) {
  const { results = {}, finals = {}, manualTies = {}, settings = {} } = state;
  const teams = resolveTeams(settings);
  const byId = teamMap(teams);
  const st = computeStandings(results, { manualTies, teams });
  const fr = finalRanking(results, finals, manualTies, settings, { teams });
  const finalPlace = Object.fromEntries(fr.places.filter((p) => p.decided).map((p) => [p.teamId, p.place]));
  const rows = [['Platz Vorrunde', 'Team', 'Spieler', 'Matches', 'Siege', 'Unentschieden', 'Niederlagen', 'Games gewonnen', 'Games verloren', 'Game-Differenz', 'Punkte', 'Endplatzierung']];
  for (const r of st.rows) {
    rows.push([`${r.rank}${r.tied ? '=' : ''}`, byId[r.teamId].name, byId[r.teamId].players.join(' & '), r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.diff, r.pts, finalPlace[r.teamId] ?? '']);
  }
  return csv(rows);
}

/** Lesbare Ergebnisliste (Text), z. B. zum Teilen per Messenger. */
export function exportText(state) {
  const { results = {}, finals = {}, manualTies = {}, settings = {} } = state;
  const teams = resolveTeams(settings);
  const byId = teamMap(teams);
  const tl = timeline(resolveTimes(settings));
  const lines = [`${TOURNAMENT.name} – ${TOURNAMENT.dateLabel} – ${TOURNAMENT.venue}`, ''];
  for (let r = 1; r <= ROUNDS; r++) {
    lines.push(`Runde ${r} (${tl.rounds[r - 1].from}–${tl.rounds[r - 1].to} Uhr)`);
    for (const m of SCHEDULE.filter((x) => x.round === r)) {
      const res = results[m.id];
      const score = isConfirmedGroup(res) ? `${res.a}:${res.b}${res.short ? ' (Abbruch)' : ''}` : 'offen';
      lines.push(`  ${m.court}: ${byId[m.home].name} – ${byId[m.away].name}  ${score}`);
    }
    if (tl.pause && r === Number(resolveTimes(settings).pauseAfterRound)) lines.push(`Pause (${tl.pause.from}–${tl.pause.to} Uhr)`);
  }
  lines.push('');
  const st = computeStandings(results, { manualTies, teams });
  lines.push('Tabelle (Pl. Team | Sp S U N | Games | Diff | Pkt)');
  for (const row of st.rows) {
    lines.push(`  ${row.rank}.${row.tied ? '=' : ''} ${row.team.name} | ${row.played} ${row.won} ${row.drawn} ${row.lost} | ${row.gf}:${row.ga} | ${signed(row.diff)} | ${row.pts}`);
  }
  const fr = finalRanking(results, finals, manualTies, settings, { teams });
  if (fr.pairings.unlocked && !fr.skipped) {
    lines.push('', 'Platzierungsspiele');
    for (const f of FINALS) {
      const p = fr.pairings.pairings[f.id];
      const s = finalMatchState(p, finals[f.id]);
      const score = s.status === 'done' ? `${s.a}:${s.b}${s.a === s.b ? ` (Sieger: ${byId[s.winner].name})` : ''}` : 'nicht gespielt';
      lines.push(`  ${f.court} ${f.label}: ${byId[p.teamA].name} – ${byId[p.teamB].name}  ${score}`);
    }
  }
  if (fr.complete) {
    lines.push('', fr.skipped ? 'Endstand (Abschlusstabelle, ohne Platzierungsspiele)' : 'Endstand');
    for (const p of fr.places) lines.push(`  ${p.place}. ${byId[p.teamId].name} (${byId[p.teamId].players.join(' & ')})`);
  }
  return lines.join('\n');
}
