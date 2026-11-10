// Abgleich für das TJ Padel Masters: gleiche Technik und gleicher Token wie die anderen Turnier-Apps,
// aber eine eigene Datei (masters.json), damit sich die Turniere nicht in die Quere kommen.
// Liefert dieselbe Schnittstelle wie useGitHubSync ({ config, setConfig, status, syncNow }).
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SYNC, loadSyncConfig, mergeShared, pickShared, pullRemote, pushRemote, sameShared } from '../sync.js';

export const MASTERS_FILE = { ...DEFAULT_SYNC, path: 'masters.json' };
const CONFIG_KEY = 'padel-sync-config'; // derselbe Speicherplatz wie in den anderen Apps: Token nur einmal pro Gerät eingeben
const POLL_MS = 5000; // alle 5 Sekunden den Stand des anderen Handys holen

function readToken() {
  return loadSyncConfig().token || '';
}

function writeToken(token) {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...DEFAULT_SYNC, ...stored, token }));
  } catch {
    /* ignorieren */
  }
}

export function useMastersSync(state, setState) {
  const [token, setTokenState] = useState(readToken);
  const [status, setStatus] = useState({ state: token ? 'syncing' : 'off', at: null, error: null });
  const stateRef = useRef(state);
  const tokenRef = useRef(token);
  const running = useRef(null);
  const again = useRef(false);
  stateRef.current = state;
  tokenRef.current = token;

  const syncOnce = useCallback(async () => {
    const cfg = { ...MASTERS_FILE, token: tokenRef.current };
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await pullRemote(cfg);
      const local = stateRef.current;
      const merged = remote.data ? mergeShared(pickShared(local), remote.data) : pickShared(local);
      if (!sameShared(local, merged)) setState((s) => ({ ...s, ...mergeShared(pickShared(s), merged) }));
      if (remote.data && sameShared(remote.data, merged)) return;
      const pushed = await pushRemote(cfg, merged, remote.sha);
      if (!pushed.conflict && !pushed.missingBranch) return;
    }
    throw new Error('Gleichzeitige Änderungen – neuer Versuch folgt.');
  }, [setState]);

  const sync = useCallback(() => {
    if (!tokenRef.current) return Promise.resolve();
    if (running.current) {
      again.current = true;
      return running.current;
    }
    setStatus((s) => ({ ...s, state: 'syncing' }));
    running.current = (async () => {
      try {
        do {
          again.current = false;
          await syncOnce();
        } while (again.current);
        setStatus({ state: 'ok', at: Date.now(), error: null });
      } catch (e) {
        const offline = navigator.onLine === false || e instanceof TypeError;
        setStatus((s) => ({
          state: offline ? 'offline' : 'error',
          at: s.at,
          error: offline ? 'Keine Verbindung – Änderungen werden nachgeholt.' : e.message,
        }));
      } finally {
        running.current = null;
      }
    })();
    return running.current;
  }, [syncOnce]);

  const stampsKey = JSON.stringify(state.stamps || {});
  useEffect(() => {
    if (!token) return undefined;
    const t = setTimeout(sync, 400);
    return () => clearTimeout(t);
  }, [stampsKey, token, sync]);

  useEffect(() => {
    if (!token) return undefined;
    const tick = () => document.visibilityState === 'visible' && sync();
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [token, sync]);

  const setConfig = useCallback(
    (cfg) => {
      const t = (cfg.token || '').trim();
      writeToken(t);
      tokenRef.current = t;
      setTokenState(t);
      setStatus({ state: t ? 'syncing' : 'off', at: null, error: null });
      if (t) setTimeout(sync, 0);
    },
    [sync],
  );

  return { config: { ...MASTERS_FILE, token }, setConfig, status, syncNow: sync };
}
