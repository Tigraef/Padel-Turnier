import { useEffect, useState } from 'react';

const KEY = 'padel-hanse-2026-10-16';
export const VIEW_KEY = 'padel-hanse-2026-10-16-ansicht';
export const ROUND_MS = 20 * 60 * 1000;

export const initialState = () => ({
  v: 1,
  results: {}, // matchId -> { a, b, confirmed }
  finals: {}, // finalId -> { teamA, teamB, a, b, golden, confirmed }
  manualTies: {}, // tieKey -> [teamId, ...]
  stamps: {}, // 'section/key' -> Zeitstempel der letzten Änderung (für den Abgleich zwischen Geräten)
  showPlayers: false,
  timer: { running: false, endsAt: null, remaining: ROUND_MS },
});

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

export function useTournamentStore(key = KEY) {
  const [state, setState] = useState(() => load(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* Speicher nicht verfügbar – App läuft trotzdem weiter */
    }
  }, [key, state]);
  return [state, setState];
}

export function parseBackup(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.results !== 'object') {
    throw new Error('Kein gültiges Backup.');
  }
  return { ...initialState(), ...parsed };
}
