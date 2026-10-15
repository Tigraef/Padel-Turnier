// Abgleich zwischen mehreren Handys über eine JSON-Datei in einem GitHub-Repository.
// Jeder Eintrag (Ergebnis, Finalergebnis, manuelle Entscheidung) trägt einen Zeitstempel;
// beim Zusammenführen gewinnt pro Eintrag die jüngere Änderung. Löschungen bleiben als
// Zeitstempel ohne Wert erhalten, damit sie auf dem anderen Handy ebenfalls ankommen.

import { useCallback, useEffect, useRef, useState } from 'react';

export const SECTIONS = ['results', 'finals', 'manualTies'];

export const DEFAULT_SYNC = {
  owner: 'Tigraef',
  repo: 'Padel-Turnier',
  branch: 'turnier-daten',
  path: 'turnier.json',
  token: '',
};

const CONFIG_KEY = 'padel-sync-config';
const POLL_MS = 8000;

// ---------- reine Funktionen (getestet) ----------

/** Setzt einen Eintrag (value null = löschen) und vermerkt den Zeitstempel. */
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

/** Löscht alle Einträge (Turnier zurücksetzen) – als Änderung, damit es auch auf anderen Geräten ankommt. */
export function clearAll(shared, now = Date.now()) {
  let next = { ...shared };
  for (const section of SECTIONS) {
    const keys = new Set([
      ...Object.keys(shared[section] || {}),
      ...Object.keys(shared.stamps || {})
        .filter((k) => k.startsWith(`${section}/`))
        .map((k) => k.slice(section.length + 1)),
    ]);
    for (const key of keys) next = applyChange(next, section, key, null, now);
  }
  return next;
}

/** Ersetzt den kompletten Inhalt (Backup wiederherstellen). */
export function replaceAll(shared, incoming, now = Date.now()) {
  let next = clearAll(shared, now);
  for (const section of SECTIONS) {
    for (const [key, value] of Object.entries(incoming[section] || {})) next = applyChange(next, section, key, value, now);
  }
  return next;
}

/** Führt zwei Stände zusammen: pro Eintrag gewinnt der jüngere Zeitstempel. */
export function mergeShared(a, b) {
  const out = { results: {}, finals: {}, manualTies: {}, stamps: {} };
  const stampsA = a?.stamps || {};
  const stampsB = b?.stamps || {};
  for (const section of SECTIONS) {
    const keys = new Set([
      ...Object.keys(a?.[section] || {}),
      ...Object.keys(b?.[section] || {}),
      ...[...Object.keys(stampsA), ...Object.keys(stampsB)]
        .filter((k) => k.startsWith(`${section}/`))
        .map((k) => k.slice(section.length + 1)),
    ]);
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
  return {
    results: state.results || {},
    finals: state.finals || {},
    manualTies: state.manualTies || {},
    stamps: state.stamps || {},
  };
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

// ---------- GitHub-Zugriff ----------

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function decodeBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

class SyncError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
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
  if (res.status === 401) throw new SyncError('Token ungültig oder abgelaufen.', 401);
  if (res.status === 403) throw new SyncError('Token hat keine Schreibrechte für dieses Repository (oder Limit erreicht).', 403);
  return res;
}

async function ensureBranch(cfg) {
  const ref = await gh(cfg, `/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
  if (ref.ok) return;
  if (ref.status !== 404) throw new SyncError(`GitHub-Fehler ${ref.status}`, ref.status);
  const repoRes = await gh(cfg, '');
  if (!repoRes.ok) throw new SyncError('Repository nicht gefunden – Token für dieses Repository freigeben.', repoRes.status);
  const repo = await repoRes.json();
  const base = await gh(cfg, `/git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
  if (!base.ok) throw new SyncError('Standard-Branch nicht lesbar.', base.status);
  const { object } = await base.json();
  const created = await gh(cfg, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${cfg.branch}`, sha: object.sha }),
  });
  if (!created.ok && created.status !== 422) throw new SyncError('Daten-Branch konnte nicht angelegt werden.', created.status);
}

/** Liest den gemeinsamen Stand. Ergibt { sha, data } bzw. { sha: null, data: null }, wenn die Datei noch fehlt. */
export async function pullRemote(cfg) {
  const res = await gh(cfg, `/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`);
  if (res.status === 404) return { sha: null, data: null, missing: true };
  if (!res.ok) throw new SyncError(`GitHub-Fehler ${res.status}`, res.status);
  const json = await res.json();
  return { sha: json.sha, data: JSON.parse(decodeBase64(json.content)) };
}

export async function pushRemote(cfg, shared, sha) {
  const body = {
    message: `Turnierstand ${new Date().toLocaleTimeString('de-DE')}`,
    content: encodeBase64(JSON.stringify({ v: 1, ...pickShared(shared), savedAt: new Date().toISOString() }, null, 1)),
    branch: cfg.branch,
    ...(sha ? { sha } : {}),
  };
  const res = await gh(cfg, `/contents/${cfg.path}`, { method: 'PUT', body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) return { conflict: true };
  if (res.status === 404) return { missingBranch: true };
  if (!res.ok) throw new SyncError(`Speichern fehlgeschlagen (${res.status})`, res.status);
  const json = await res.json();
  return { sha: json.content.sha };
}

// ---------- React-Hook ----------

export function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_SYNC, ...JSON.parse(raw) } : { ...DEFAULT_SYNC };
  } catch {
    return { ...DEFAULT_SYNC };
  }
}

function saveSyncConfig(cfg) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignorieren */
  }
}

/**
 * Hält den lokalen Stand mit GitHub abgeglichen.
 * status: 'off' | 'syncing' | 'ok' | 'offline' | 'error'
 */
export function useGitHubSync(state, setState) {
  const [config, setConfigState] = useState(loadSyncConfig);
  const [status, setStatus] = useState({ state: config.token ? 'syncing' : 'off', at: null, error: null });
  const stateRef = useRef(state);
  const configRef = useRef(config);
  const running = useRef(null);
  const again = useRef(false);
  stateRef.current = state;
  configRef.current = config;

  const syncOnce = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg.token) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      let remote = await pullRemote(cfg);
      const local = stateRef.current;
      const merged = remote.data ? mergeShared(pickShared(local), remote.data) : pickShared(local);
      if (!sameShared(local, merged)) {
        setState((s) => ({ ...s, ...mergeShared(pickShared(s), merged) }));
      }
      if (remote.data && sameShared(remote.data, merged)) return;
      let pushed = await pushRemote(cfg, merged, remote.sha);
      if (pushed.missingBranch) {
        await ensureBranch(cfg);
        pushed = await pushRemote(cfg, merged, remote.sha);
      }
      if (!pushed.conflict && !pushed.missingBranch) return;
    }
    throw new SyncError('Gleichzeitige Änderungen – neuer Versuch folgt.', 409);
  }, [setState]);

  const sync = useCallback(() => {
    if (!configRef.current.token) return Promise.resolve();
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
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const network = e instanceof TypeError;
        setStatus((s) => ({
          state: offline || network ? 'offline' : 'error',
          at: s.at,
          error: offline || network ? 'Keine Verbindung – Änderungen werden nachgeholt.' : e.message,
        }));
      } finally {
        running.current = null;
      }
    })();
    return running.current;
  }, [syncOnce]);

  // Lokale Änderungen kurz gesammelt hochladen
  const sharedKey = JSON.stringify(state.stamps || {});
  useEffect(() => {
    if (!config.token) return undefined;
    const t = setTimeout(sync, 400);
    return () => clearTimeout(t);
  }, [sharedKey, config.token, sync]);

  // Regelmäßig den Stand des anderen Handys holen
  useEffect(() => {
    if (!config.token) return undefined;
    const tick = () => document.visibilityState === 'visible' && sync();
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [config.token, sync]);

  const setConfig = useCallback(
    (cfg) => {
      const next = { ...DEFAULT_SYNC, ...cfg };
      saveSyncConfig(next);
      configRef.current = next;
      setConfigState(next);
      setStatus({ state: next.token ? 'syncing' : 'off', at: null, error: null });
      if (next.token) setTimeout(sync, 0);
    },
    [sync],
  );

  return { config, setConfig, status, syncNow: sync };
}

/** Verbindung testen, ohne etwas zu verändern. */
export async function testConnection(cfg) {
  const res = await gh(cfg, '');
  if (res.status === 404) throw new SyncError('Repository nicht gefunden – Token für „Padel-Turnier“ freigeben.', 404);
  if (!res.ok) throw new SyncError(`GitHub-Fehler ${res.status}`, res.status);
  const repo = await res.json();
  if (repo.permissions && !repo.permissions.push) throw new SyncError('Token darf nicht schreiben (Contents: Read and write nötig).', 403);
  return true;
}

// ---------- Nur-Ansicht für Teilnehmer (ohne Token) ----------

/** Für die Ansicht nur bestätigte Ergebnisse übernehmen. */
export function publicView(data) {
  const keep = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v && v.confirmed));
  return { results: keep(data?.results), finals: keep(data?.finals), manualTies: data?.manualTies || {} };
}

const VIEW_POLL_MS = 15000;

/**
 * Liest den Turnierstand ohne Token. Bedingte Anfragen (ETag) zählen bei GitHub nicht
 * gegen das Limit von 60 Anfragen pro Stunde; bei erreichtem Limit wird auf
 * raw.githubusercontent.com ausgewichen (dort bis zu 5 Minuten Verzögerung).
 */
export function useViewerFeed(setState, cfg = DEFAULT_SYNC) {
  const [status, setStatus] = useState({ state: 'syncing', at: null, error: null });
  const etag = useRef(null);

  const refresh = useCallback(async () => {
    const apply = (data) => setState((s) => ({ ...s, ...publicView(data) }));
    try {
      const res = await fetch(
        `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`,
        { cache: 'no-store', headers: { Accept: 'application/vnd.github+json', ...(etag.current ? { 'If-None-Match': etag.current } : {}) } },
      );
      if (res.status === 304) {
        setStatus({ state: 'ok', at: Date.now(), error: null });
        return;
      }
      if (res.ok) {
        etag.current = res.headers.get('ETag');
        const json = await res.json();
        apply(JSON.parse(decodeBase64(json.content)));
        setStatus({ state: 'ok', at: Date.now(), error: null });
        return;
      }
      if (res.status === 404) {
        apply({});
        setStatus({ state: 'ok', at: Date.now(), error: null });
        return;
      }
      const raw = await fetch(
        `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${cfg.path}?t=${Date.now()}`,
        { cache: 'no-store' },
      );
      if (!raw.ok) throw new Error(`Status ${raw.status}`);
      apply(await raw.json());
      setStatus({ state: 'ok', at: Date.now(), error: 'Aktualisierung kann einige Minuten dauern.' });
    } catch (e) {
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
