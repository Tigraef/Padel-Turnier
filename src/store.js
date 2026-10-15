import { useEffect, useState } from 'react';

const KEY = 'padel-hanse-2026-10-16';
export const ROUND_MS = 20 * 60 * 1000;

export const initialState = () => ({
  v: 1,
  results: {}, // matchId -> { a, b, confirmed }
  finals: {}, // finalId -> { teamA, teamB, a, b, golden, confirmed }
  manualTies: {}, // tieKey -> [teamId, ...]
  showPlayers: false,
  timer: { running: false, endsAt: null, remaining: ROUND_MS },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

export function useTournamentStore() {
  const [state, setState] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* Speicher nicht verfügbar – App läuft trotzdem weiter */
    }
  }, [state]);
  return [state, setState];
}

export function parseBackup(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.results !== 'object') {
    throw new Error('Kein gültiges Backup.');
  }
  return { ...initialState(), ...parsed };
}
