// Abgleich für das TJ Padel Masters über eine JSON-Datei im GitHub-Repository (Branch turnier-daten).
// Gleicher Token wie in den anderen Turnier-Apps, aber eine eigene Datei, damit sich die Turniere nicht
// in die Quere kommen. Jeder Eintrag (Ergebnis, Platzierungsspiel, Einstellung, Teamname …) trägt einen
// Zeitstempel; beim Zusammenführen gewinnt pro Eintrag die jüngere Änderung. Gleichzeitige Änderungen an
// verschiedenen Spielen überschreiben sich deshalb nie gegenseitig.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SYNC, loadSyncConfig, testConnection } from '../sync.js';

export const SECTIONS = ['results', 'finals', 'manualTies', 'settings'];
export const MASTERS_FILE = { ...DEFAULT_SYNC, path: 'masters-2911.json' };
const CONFIG_KEY = 'padel-sync-config'; // derselbe Speicherplatz wie in den anderen Apps: Token nur einmal pro Gerät eingeben
const POLL_MS = 8000;
const VIEW_POLL_MS = 15000;

export { testConnection };

// ---------- reine Funktionen (getestet) ----------

export function applyChange(shared, section, key, value, now = Date.now()) {
  const sectionData = { ...(shared[section] || {}) };
  if (value == null) delete sectionData[key];
  else sectionData[key] = value;
  const prev = shared.stamps?.[`${section}/${key}`] ?? 0;
  return {
    ...shared,
    [section]: sectionData,
    stamps: { ...(shared.stamps || {}), [`${section}/${key}`]: Math.max(now, prev + 1) },
  };
}

function keysOf(shared, section) {
  return new Set([
    ...Object.keys(shared?.[section] || {}),
    ...Object.keys(shared?.stamps || {})
      .filter((k) => k.startsWith(`${section}/`))
      .map((k) => k.slice(section.length + 1)),
  ]);
}

/** Löscht alle Einträge (Turnier zurücksetzen) – als Änderung, damit es auch auf anderen Geräten ankommt. */
export function clearAll(shared, { keepTeams = true } = {}, now = Date.now()) {
  let next = { ...shared };
  for (const section of SECTIONS) {
    for (const key of keysOf(shared, section)) {
      if (keepTeams && section === 'settings' && (key.startsWith('teams/') || key === 'times')) continue;
      next = applyChange(next, section, key, null, now);
    }
  }
  return next;
}

export function replaceAll(shared, incoming, now = Date.now()) {
  let next = clearAll(shared, { keepTeams: false }, now);
  for (const section of SECTIONS) {
    for (const [key, value] of Object.entries(incoming[section] || {})) next = applyChange(next, section, key, value, now);
  }
  return next;
}

export function mergeShared(a, b) {
  const out = { stamps: {} };
  for (const s of SECTIONS) out[s] = {};
  const stampsA = a?.stamps || {};
  const stampsB = b?.stamps || {};
  for (const section of SECTIONS) {
    const keys = new Set([...keysOf(a, section), ...keysOf(b, section)]);
    for (const key of keys) {
      const id = `${section}/${key}`;
      const ta = stampsA[id] ?? 0;
      const tb = stampsB[id] ?? 0;
      const winner = tb > ta ? b : a;
      const value = winner?.[section]?.[key];
      if (value != null) out[section][key] = value;
      const t = Math.max(ta, tb);
      if (t) out.stamps[id] = t;
    }
  }
  return out;
}

export function pickShared(state) {
  const out = { stamps: state?.stamps || {} };
  for (const s of SECTIONS) out[s] = state?.[s] || {};
  return out;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sameShared(a, b) {
  return canonical(pickShared(a)) === canonical(pickShared(b));
}

/** Teilnehmer-Ansicht: nur bestätigte Ergebnisse; Platzierungsspiele ohne unbestätigte Zwischenstände. */
export function publicView(data) {
  const results = Object.fromEntries(Object.entries(data?.results || {}).filter(([, v]) => v && v.confirmed));
  const finals = Object.fromEntries(
    Object.entries(data?.finals || {}).map(([k, v]) => [k, v && v.confirmed ? v : { teamA: v?.teamA, teamB: v?.teamB, started: !!v?.started }]),
  );
  return { results, finals, manualTies: data?.manualTies || {}, settings: data?.settings || {} };
}

// ---------- GitHub-Zugriff ----------

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function decodeBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function gh(cfg, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new Error('Token ungültig oder abgelaufen.');
  if (res.status === 403) throw new Error('Token hat keine Schreibrechte für dieses Repository (oder Limit erreicht).');
  return res;
}

async function pullRemote(cfg) {
  const res = await gh(cfg, `/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`);
  if (res.status === 404) return { sha: null, data: null };
  if (!res.ok) throw new Error(`GitHub-Fehler ${res.status}`);
  const json = await res.json();
  return { sha: json.sha, data: JSON.parse(decodeBase64(json.content)) };
}

async function pushRemote(cfg, shared, sha) {
  const body = {
    message: `TJ Padel Masters ${new Date().toLocaleTimeString('de-DE')}`,
    content: encodeBase64(JSON.stringify({ v: 2, ...pickShared(shared), savedAt: new Date().toISOString() }, null, 1)),
    branch: cfg.branch,
    ...(sha ? { sha } : {}),
  };
  const res = await gh(cfg, `/contents/${cfg.path}`, { method: 'PUT', body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) return { conflict: true };
  if (!res.ok) throw new Error(`Speichern fehlgeschlagen (${res.status})`);
  const json = await res.json();
  return { sha: json.content.sha };
}

// ---------- React-Hooks ----------

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

/** Turnierleitung: lokalen Stand mit GitHub abgleichen. Schnittstelle: { config, setConfig, status, syncNow }. */
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
      if (!pushed.conflict) return;
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
        setStatus((s) => ({ state: offline ? 'offline' : 'error', at: s.at, error: offline ? 'Keine Verbindung – Änderungen werden nachgeholt.' : e.message }));
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

/**
 * Teilnehmer: Stand ohne Token lesen. Bedingte Anfragen (ETag) zählen nicht gegen GitHubs Limit;
 * bei erreichtem Limit wird auf raw.githubusercontent.com ausgewichen (dort bis zu 5 Minuten Verzögerung).
 */
export function useMastersViewer(setState) {
  const [status, setStatus] = useState({ state: 'syncing', at: null, error: null });
  const etag = useRef(null);
  const cfg = MASTERS_FILE;

  const refresh = useCallback(async () => {
    const apply = (data) => setState((s) => ({ ...s, ...publicView(data) }));
    try {
      const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', ...(etag.current ? { 'If-None-Match': etag.current } : {}) },
      });
      if (res.status === 304) return setStatus({ state: 'ok', at: Date.now(), error: null });
      if (res.ok) {
        etag.current = res.headers.get('ETag');
        const json = await res.json();
        apply(JSON.parse(decodeBase64(json.content)));
        return setStatus({ state: 'ok', at: Date.now(), error: null });
      }
      if (res.status === 404) {
        apply({});
        return setStatus({ state: 'ok', at: Date.now(), error: null });
      }
      const raw = await fetch(`https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${cfg.path}?t=${Date.now()}`, { cache: 'no-store' });
      if (!raw.ok) throw new Error(`Status ${raw.status}`);
      apply(await raw.json());
      setStatus({ state: 'ok', at: Date.now(), error: 'Aktualisierung kann einige Minuten dauern.' });
    } catch {
      setStatus((s) => ({ ...s, state: 'offline', error: 'Keine Verbindung – zeige letzten Stand.' }));
    }
  }, [cfg.owner, cfg.repo, cfg.branch, cfg.path, setState]);

  useEffect(() => {
    refresh();
    const tick = () => document.visibilityState === 'visible' && refresh();
    const interval = setInterval(tick, VIEW_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [refresh]);

  return { status, refresh };
}
