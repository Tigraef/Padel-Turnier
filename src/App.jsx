import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  TOURNAMENT,
  TEAMS,
  TEAM_BY_ID,
  COURTS,
  SCHEDULE,
  FINALS,
  ROUNDS,
  GROUP_MAX_GAMES,
  FINAL_MAX_GAMES,
  roundStartTime,
  validateSchedule,
  validateGroupScore,
  isConfirmedGroup,
  computeStandings,
  groupProgress,
  currentRound,
  finalPairings,
  finalMatchState,
  finalRanking,
  formatDiff,
  exportText,
} from './logic.js';
import { useTournamentStore, initialState, parseBackup, ROUND_MS, VIEW_KEY } from './store.js';
import { applyChange, clearAll, replaceAll, pickShared, useGitHubSync, useViewerFeed, testConnection, DEFAULT_SYNC } from './sync.js';

// Nur-Ansicht für Teilnehmer: …/Padel-Turnier/?ansicht
const ReadOnly = createContext(false);
const viewerUrl = () => `${location.origin}${location.pathname}?ansicht`;

const TABS = [
  { id: 'start', label: 'Übersicht', icon: 'home' },
  { id: 'spielplan', label: 'Spielplan', icon: 'grid' },
  { id: 'tabelle', label: 'Tabelle', icon: 'table' },
  { id: 'finale', label: 'Finale', icon: 'trophy' },
  { id: 'ehrung', label: 'Ehrung', icon: 'medal' },
];

const courtSide = Object.fromEntries(COURTS.map((c) => [c.id, c.side]));
const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

function readHash() {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '');
  return TABS.some((t) => t.id === h) ? h : 'start';
}

export default function App({ readOnly = false }) {
  const [state, setState] = useTournamentStore(readOnly ? VIEW_KEY : undefined);
  const [tab, setTabState] = useState(readHash);
  const [planRound, setPlanRound] = useState(null);
  const [sheet, setSheet] = useState(null); // 'export' | 'reset' | null

  useEffect(() => {
    const onHash = () => setTabState(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setTab = (id) => {
    setTabState(id);
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      /* ignorieren */
    }
    window.scrollTo({ top: 0 });
  };

  const scheduleCheck = useMemo(() => validateSchedule(), []);
  const { results, finals, manualTies, showPlayers } = state;

  const update = (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  const change = (section) => (key, value) => setState((s) => ({ ...s, ...applyChange(pickShared(s), section, key, value) }));
  const setResult = change('results');
  const setFinal = change('finals');
  const setManualTie = change('manualTies');
  // readOnly ändert sich während der Laufzeit nie, daher ist der bedingte Hook-Aufruf stabil.
  const sync = readOnly ? useViewerFeed(setState) : useGitHubSync(state, setState);

  const ctx = { state, results, finals, manualTies, showPlayers, setResult, setFinal, setManualTie, setTab, update };
  const round = currentRound(results);

  return (
    <ReadOnly.Provider value={readOnly}>
    <div className={`app ${readOnly ? 'is-readonly' : ''}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => setTab('start')} aria-label="Zur Übersicht">
            <BallMark />
            <span className="brand-text">
              <span className="brand-name">Hanse Padel Cup</span>
              <span className="brand-sub">16.10.2026 · ab 19:00</span>
            </span>
          </button>
          <label className="switch" htmlFor="toggle-players">
            <input
              id="toggle-players"
              type="checkbox"
              checked={showPlayers}
              onChange={(e) => update({ showPlayers: e.target.checked })}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">Spieler</span>
          </label>
          {readOnly ? (
            <LiveBadge status={sync.status} onClick={sync.refresh} />
          ) : (
            !inFrame && <SyncBadge status={sync.status} onClick={() => setSheet('sync')} />
          )}
        </div>
      </header>

      {!scheduleCheck.ok && (
        <div className="wrap">
          <div className="alert alert-danger" role="alert">
            <strong>Spielplan fehlerhaft:</strong>{' '}
            {scheduleCheck.checks
              .filter((c) => !c.ok)
              .map((c) => `${c.label} (${c.detail})`)
              .join(' · ')}
          </div>
        </div>
      )}

      <main className="wrap main">
        {tab === 'start' && (
          <Dashboard
            {...ctx}
            round={round}
            scheduleCheck={scheduleCheck}
            onOpenPlan={(r) => {
              setPlanRound(r);
              setTab(r === 'finals' ? 'finale' : 'spielplan');
            }}
            onExport={() => setSheet('export')}
            onReset={() => setSheet('reset')}
            onSync={inFrame ? null : () => setSheet('sync')}
            setTab={setTab}
            syncOn={!!sync.config?.token}
          />
        )}
        {tab === 'spielplan' && <Schedule {...ctx} round={round} planRound={planRound} setPlanRound={setPlanRound} />}
        {tab === 'tabelle' && <Standings {...ctx} round={round} />}
        {tab === 'finale' && <Finals {...ctx} />}
        {tab === 'ehrung' && <Awards {...ctx} onExport={readOnly ? null : () => setSheet('export')} />}
      </main>

      <nav className="tabbar" aria-label="Bereiche">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {sheet === 'export' && <ExportSheet state={state} onClose={() => setSheet(null)} onRestore={(s) => setState((cur) => ({ ...cur, ...replaceAll(pickShared(cur), s) }))} />}
      {sheet === 'sync' && <SyncSheet sync={sync} onClose={() => setSheet(null)} />}
      {sheet === 'reset' && (
        <ResetDialog
          onCancel={() => setSheet(null)}
          onConfirm={() => {
            setState((cur) => ({ ...initialState(), showPlayers: cur.showPlayers, ...clearAll(pickShared(cur)) }));
            setSheet(null);
            setTab('start');
          }}
        />
      )}

      <pre className="print-only print-report">{exportText(state)}</pre>
    </div>
    </ReadOnly.Provider>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ results, finals, manualTies, showPlayers, state, update, round, scheduleCheck, onOpenPlan, onExport, onReset, onSync, syncOn, setTab }) {
  const readOnly = useContext(ReadOnly);
  const progress = groupProgress(results);
  const ranking = finalRanking(results, finals, manualTies);
  const finalsDone = FINALS.filter((f) => ranking.pairings.unlocked && finalMatchState(ranking.pairings.pairings[f.id], finals[f.id]).status === 'confirmed').length;
  const roundMatches = round === 'finals' ? [] : SCHEDULE.filter((m) => m.round === round);

  let headline;
  let sub;
  if (round !== 'finals') {
    headline = `Runde ${round}`;
    sub = `von ${ROUNDS} · Start ca. ${roundStartTime(round)} Uhr`;
  } else if (!ranking.complete) {
    headline = 'Platzierungsspiele';
    sub = ranking.pairings.unlocked ? `${finalsDone} von 3 bestätigt · ca. ${roundStartTime(6)} Uhr` : 'Gleichstand klären';
  } else {
    headline = 'Turnier beendet';
    sub = `Sieger: ${TEAM_BY_ID[ranking.places[0].teamId].name}`;
  }

  return (
    <div className="stack-lg">
      <section className="hero">
        <div className="hero-court" aria-hidden="true" />
        <div className="hero-body">
          <p className="eyebrow">{TOURNAMENT.dateLabel} · Hanse Padel</p>
          <h1 className="hero-title">{TOURNAMENT.name}</h1>
          <div className="hero-now">
            <div>
              <p className="label">Aktuell</p>
              <p className="hero-round">{headline}</p>
              <p className="hero-sub">{sub}</p>
            </div>
            <div className="hero-progress">
              <p className="label">Vorrunde</p>
              <p className="hero-count">
                <span className="num">{progress.confirmed}</span>
                <span className="of">/{progress.total}</span>
              </p>
              <p className="hero-sub">Matches bestätigt</p>
            </div>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={15} aria-valuenow={progress.confirmed}>
            <div className="bar-fill" style={{ width: `${(progress.confirmed / progress.total) * 100}%` }} />
          </div>
          {readOnly ? (
            <button className="btn btn-ball btn-block" onClick={() => setTab('tabelle')}>
              Zur Live-Tabelle
            </button>
          ) : (
            <button className="btn btn-ball btn-block" onClick={() => onOpenPlan(round)}>
              {round === 'finals' ? 'Platzierungsspiele eintragen' : `Ergebnisse Runde ${round} erfassen`}
            </button>
          )}
        </div>
      </section>

      {round !== 'finals' && (
        <section className="stack">
          <SectionHead title={`Courts · Runde ${round}`} note="Blick vom Eingang" />
          <div className="court-row">
            {roundMatches.map((m) => (
              <CourtTile key={m.id} match={m} result={results[m.id]} showPlayers={showPlayers} onClick={() => onOpenPlan(round)} />
            ))}
          </div>
        </section>
      )}
      {round === 'finals' && ranking.pairings.unlocked && (
        <section className="stack">
          <SectionHead title="Courts · Platzierungsspiele" note="Blick vom Eingang" />
          <div className="court-row">
            {[...FINALS]
              .sort((a, b) => a.court.localeCompare(b.court))
              .map((f) => {
                const p = ranking.pairings.pairings[f.id];
                const st = finalMatchState(p, finals[f.id]);
                return (
                  <CourtTile
                    key={f.id}
                    match={{ court: f.court, home: p.teamA, away: p.teamB, label: f.label }}
                    result={st.status === 'confirmed' || st.status === 'entered' ? { a: st.a, b: st.b, confirmed: st.status === 'confirmed' } : null}
                    showPlayers={showPlayers}
                    onClick={() => onOpenPlan('finals')}
                  />
                );
              })}
          </div>
        </section>
      )}

      {!readOnly && round !== 'finals' && <RoundTimer timer={state.timer} round={round} onChange={(timer) => update({ timer })} />}

      <section className="stack">
        <SectionHead title="Teams" />
        <ul className="team-list">
          {TEAMS.map((t) => (
            <li key={t.id}>
              <span className="team-name">{t.name}</span>
              <span className="team-players">{t.players.join(' & ')}</span>
            </li>
          ))}
        </ul>
      </section>

      {!readOnly && (
      <section className="stack">
        <SectionHead title="Spielplanprüfung" note={scheduleCheck.ok ? 'Alles in Ordnung' : 'Fehler gefunden'} />
        <ul className="checks">
          {scheduleCheck.checks.map((c) => (
            <li key={c.label} className={c.ok ? 'is-ok' : 'is-bad'}>
              <Icon name={c.ok ? 'check' : 'x'} />
              <span>
                {c.label}
                <span className="muted"> · {c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      )}

      {readOnly && (
        <p className="muted small center">Live-Ansicht · Ergebnisse erscheinen, sobald die Turnierleitung sie bestätigt.</p>
      )}

      {!readOnly && (
      <section className="stack">
        <SectionHead
          title="Verwaltung"
          note={syncOn ? 'Ergebnisse werden mit dem zweiten Handy abgeglichen' : 'Ergebnisse werden automatisch auf diesem Gerät gespeichert'}
        />
        <div className="btn-row">
          {onSync && (
            <button className="btn btn-ghost" onClick={onSync}>
              <Icon name="sync" /> {syncOn ? 'Abgleich' : 'Zweites Handy verbinden'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onExport}>
            <Icon name="share" /> Exportieren{inFrame ? '' : ' / Drucken'}
          </button>
          <button className="btn btn-danger-ghost" onClick={onReset}>
            <Icon name="reset" /> Turnier zurücksetzen
          </button>
        </div>
        {!inFrame && syncOn && <ViewerLink />}
      </section>
      )}
    </div>
  );
}

function CourtTile({ match, result, showPlayers, onClick }) {
  const status = matchStatus(result);
  return (
    <button className={`court-tile status-${status}`} onClick={onClick}>
      <span className="court-tile-head">
        <CourtBadge court={match.court} />
        <StatusChip status={status} />
      </span>
      {match.label && <span className="court-tile-label">{match.label}</span>}
      <span className="court-tile-teams">
        <TileTeam id={match.home} score={result?.a} showPlayers={showPlayers} />
        <TileTeam id={match.away} score={result?.b} showPlayers={showPlayers} />
      </span>
    </button>
  );
}

function TileTeam({ id, score, showPlayers }) {
  return (
    <span className="tile-team">
      <span className="tile-team-name">
        {TEAM_BY_ID[id].name}
        {showPlayers && <span className="players">{TEAM_BY_ID[id].players.join(' & ')}</span>}
      </span>
      <span className="tile-score num">{score ?? '–'}</span>
    </span>
  );
}

/* ---------------- Timer ---------------- */

function RoundTimer({ timer, round, onChange }) {
  const [now, setNow] = useState(Date.now());
  const beeped = useRef(false);
  const audio = useRef(null);
  const wake = useRef(null);
  const remaining = timer.running ? Math.max(0, timer.endsAt - now) : timer.remaining;

  useEffect(() => {
    if (!timer.running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timer.running]);

  useEffect(() => {
    if (timer.running && remaining === 0 && !beeped.current) {
      beeped.current = true;
      beep(audio.current);
      try {
        navigator.vibrate?.([300, 150, 300]);
      } catch {
        /* nicht unterstützt */
      }
    }
  }, [timer.running, remaining]);

  const start = () => {
    try {
      audio.current = audio.current ?? new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      audio.current = null;
    }
    navigator.wakeLock?.request?.('screen').then((l) => (wake.current = l)).catch(() => {});
    beeped.current = remaining === 0;
    setNow(Date.now());
    onChange({ running: true, endsAt: Date.now() + (remaining || ROUND_MS), remaining: remaining || ROUND_MS });
  };
  const pause = () => {
    wake.current?.release?.().catch(() => {});
    onChange({ running: false, endsAt: null, remaining });
  };
  const reset = () => {
    wake.current?.release?.().catch(() => {});
    beeped.current = false;
    onChange({ running: false, endsAt: null, remaining: ROUND_MS });
  };

  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
  const over = remaining === 0;
  const pct = 100 - (remaining / ROUND_MS) * 100;

  return (
    <section className={`timer ${over ? 'is-over' : ''} ${timer.running ? 'is-running' : ''}`}>
      <div className="timer-head">
        <SectionHead title="Rundenuhr" note={`20 Minuten · Runde ${round}`} />
      </div>
      <div className="timer-body">
        <p className="timer-clock num" aria-live="polite">
          {mm}:{ss}
        </p>
        <div className="timer-actions">
          {timer.running ? (
            <button className="btn btn-ghost" onClick={pause}>
              Pause
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start}>
              {remaining === ROUND_MS ? 'Start' : over ? 'Neu starten' : 'Weiter'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={reset} disabled={remaining === ROUND_MS && !timer.running}>
            Zurücksetzen
          </button>
        </div>
      </div>
      <div className="bar thin">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {over && <p className="timer-msg">Zeit abgelaufen – laufendes Game zu Ende spielen und Ergebnis eintragen.</p>}
    </section>
  );
}

function beep(ctx) {
  if (!ctx) return;
  try {
    [0, 0.35, 0.7].forEach((offset) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + offset);
      o.stop(ctx.currentTime + offset + 0.3);
    });
  } catch {
    /* Audio nicht verfügbar */
  }
}

/* ---------------- Spielplan ---------------- */

function Schedule({ results, setResult, showPlayers, round, planRound, setPlanRound }) {
  const selected = planRound && planRound !== 'finals' ? planRound : round === 'finals' ? 'all' : round;
  const rounds = selected === 'all' ? [1, 2, 3, 4, 5] : [selected];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Spielplan</h2>
        <p className="muted">5 Vorrunden à 20 Minuten · max. 8 Games · Golden Point bei 40:40</p>
      </div>
      <div className="seg" role="tablist" aria-label="Runde wählen">
        {[1, 2, 3, 4, 5].map((r) => {
          const done = SCHEDULE.filter((m) => m.round === r).every((m) => isConfirmedGroup(results[m.id]));
          return (
            <button
              key={r}
              role="tab"
              aria-selected={selected === r}
              className={`seg-btn ${selected === r ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
              onClick={() => setPlanRound(r)}
            >
              R{r}
              {done && <span className="seg-dot" aria-label="abgeschlossen" />}
            </button>
          );
        })}
        <button role="tab" aria-selected={selected === 'all'} className={`seg-btn ${selected === 'all' ? 'is-active' : ''}`} onClick={() => setPlanRound('all')}>
          Alle
        </button>
      </div>

      {rounds.map((r) => (
        <section key={r} className="stack">
          <div className="round-head">
            <h3 className="round-title">Runde {r}</h3>
            <span className="round-time num">{roundStartTime(r)} Uhr</span>
            <span className="round-count muted">
              {SCHEDULE.filter((m) => m.round === r && isConfirmedGroup(results[m.id])).length}/3 bestätigt
            </span>
          </div>
          <div className="match-list">
            {SCHEDULE.filter((m) => m.round === r).map((m) => (
              <GroupMatchCard key={m.id} match={m} result={results[m.id]} showPlayers={showPlayers} onChange={(v) => setResult(m.id, v)} />
            ))}
          </div>
          {selected !== 'all' && r < 5 && (
            <button className="btn btn-ghost btn-block" onClick={() => setPlanRound(r + 1)}>
              Weiter zu Runde {r + 1} →
            </button>
          )}
        </section>
      ))}
    </div>
  );
}

function matchStatus(result) {
  if (!result || (result.a == null && result.b == null)) return 'open';
  return result.confirmed ? 'done' : 'entered';
}

function GroupMatchCard({ match, result, showPlayers, onChange }) {
  const readOnly = useContext(ReadOnly);
  if (readOnly) return <ViewMatchCard court={match.court} home={match.home} away={match.away} result={result} showPlayers={showPlayers} />;
  const status = matchStatus(result);
  const confirmed = isConfirmedGroup(result);
  const a = result?.a ?? null;
  const b = result?.b ?? null;
  const v = validateGroupScore(a, b);
  const total = (a ?? 0) + (b ?? 0);
  const set = (patch) => onChange({ a, b, confirmed: false, ...patch });

  return (
    <article className={`match status-${status}`}>
      <header className="match-head">
        <CourtBadge court={match.court} />
        <StatusChip status={status} />
      </header>

      <div className="match-body">
        <TeamScore id={match.home} value={a} showPlayers={showPlayers} locked={confirmed} max={GROUP_MAX_GAMES - (b ?? 0)} onChange={(n) => set({ a: n })} winner={confirmed && a > b} />
        <TeamScore id={match.away} value={b} showPlayers={showPlayers} locked={confirmed} max={GROUP_MAX_GAMES - (a ?? 0)} onChange={(n) => set({ b: n })} winner={confirmed && b > a} />
      </div>

      <footer className="match-foot">
        {confirmed ? (
          <>
            <span className="muted">
              {a === b ? 'Unentschieden · je 1 Punkt' : `${TEAM_BY_ID[a > b ? match.home : match.away].name} +2 Punkte`}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => onChange({ a, b, confirmed: false })}>
              Korrigieren
            </button>
          </>
        ) : (
          <>
            <span className={`hint ${a != null && b != null && !v.ok ? 'is-error' : ''}`}>
              {a == null && b == null ? `Games eintragen (max. ${GROUP_MAX_GAMES})` : v.ok ? `${total} von ${GROUP_MAX_GAMES} Games` : v.error}
            </span>
            <div className="btn-row tight">
              {status !== 'open' && (
                <button className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
                  Leeren
                </button>
              )}
              <button className="btn btn-primary btn-sm" disabled={!v.ok} onClick={() => onChange({ a, b, confirmed: true })}>
                Bestätigen
              </button>
            </div>
          </>
        )}
      </footer>
    </article>
  );
}

function TeamScore({ id, value, showPlayers, locked, max, onChange, winner, extra }) {
  const team = TEAM_BY_ID[id];
  return (
    <div className={`team-score ${winner ? 'is-winner' : ''}`}>
      <div className="team-score-name">
        <span className="team-name">{team.name}</span>
        {showPlayers && <span className="players">{team.players.join(' & ')}</span>}
        {extra}
      </div>
      {locked ? <span className="score-locked num">{value}</span> : <Stepper value={value} max={max} onChange={onChange} label={team.name} />}
    </div>
  );
}

function Stepper({ value, max, onChange, label }) {
  const v = value ?? null;
  return (
    <div className="stepper">
      <button className="step" onClick={() => onChange(v == null || v <= 0 ? 0 : v - 1)} disabled={v == null || v <= 0} aria-label={`${label}: ein Game weniger`}>
        −
      </button>
      <input
        className="step-input num"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Games ${label}`}
        value={v ?? ''}
        placeholder="–"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '').slice(-2);
          onChange(raw === '' ? null : Number(raw));
        }}
      />
      <button className="step" onClick={() => onChange(v == null ? 1 : v + 1)} disabled={v != null && v >= max} aria-label={`${label}: ein Game mehr`}>
        +
      </button>
    </div>
  );
}

/* ---------------- Tabelle ---------------- */

function Standings({ results, manualTies, setManualTie, showPlayers, round }) {
  const readOnly = useContext(ReadOnly);
  const lastWithResults = useMemo(() => {
    let r = 1;
    for (const m of SCHEDULE) if (isConfirmedGroup(results[m.id])) r = Math.max(r, m.round);
    return r;
  }, [results]);
  const [sel, setSel] = useState(lastWithResults);
  const st = computeStandings(results, { upToRound: sel, manualTies });
  const roundDone = SCHEDULE.filter((m) => m.round <= sel).every((m) => isConfirmedGroup(results[m.id]));

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Tabelle</h2>
        <p className="muted">Sieg 2 · Unentschieden 1 · Niederlage 0 Punkte</p>
      </div>
      <p className="label muted">Tabellenstand nach Runde</p>
      <div className="seg seg-tight" role="tablist" aria-label="Tabellenstand nach Runde">
        {[1, 2, 3, 4, 5].map((r) => (
          <button key={r} role="tab" aria-selected={sel === r} className={`seg-btn ${sel === r ? 'is-active' : ''}`} onClick={() => setSel(r)}>
            R{r}
          </button>
        ))}
      </div>
      <p className="muted small">
        Stand nach Runde {sel}: {st.confirmedCount} von {sel * 3} Matches bestätigt
        {!roundDone && ' · noch nicht vollständig'}
        {round !== 'finals' && sel === lastWithResults && ' · live'}
      </p>

      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="c-rank" scope="col">Pl.</th>
              <th className="c-team" scope="col">Team</th>
              <th scope="col" title="Spiele">Sp</th>
              <th scope="col" title="Siege">S</th>
              <th scope="col" title="Unentschieden">U</th>
              <th scope="col" title="Niederlagen">N</th>
              <th scope="col" title="Gewonnene Games">G+</th>
              <th scope="col" title="Verlorene Games">G−</th>
              <th scope="col" title="Game-Differenz">Diff</th>
              <th scope="col" className="c-pts" title="Tabellenpunkte">Pkt</th>
            </tr>
          </thead>
          <tbody>
            {st.rows.map((r) => (
              <tr key={r.teamId} className={`${r.position <= 2 ? 'is-top' : ''} ${r.tied ? 'is-tied' : ''}`}>
                <td className="c-rank num">
                  <span className={`rank-pill rank-${r.position}`}>
                    {r.rank}
                    {r.tied ? '=' : ''}
                  </span>
                </td>
                <td className="c-team">
                  <span className="team-name">{r.team.name}</span>
                  {showPlayers && <span className="players">{r.team.players.join(' & ')}</span>}
                  {r.decidedBy === 'h2h' && <span className="tag">dir. Vergleich</span>}
                  {r.decidedBy === 'manual' && <span className="tag">manuell</span>}
                  {r.tied && <span className="tag tag-warn">Gleichstand</span>}
                </td>
                <td className="num">{r.played}</td>
                <td className="num">{r.won}</td>
                <td className="num">{r.drawn}</td>
                <td className="num">{r.lost}</td>
                <td className="num">{r.gf}</td>
                <td className="num">{r.ga}</td>
                <td className={`num diff ${r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}`}>{formatDiff(r.diff)}</td>
                <td className="num c-pts">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="legend muted small">
        <span className="legend-swatch" /> Platz 1 und 2 spielen das Finale. Reihenfolge: Punkte → Game-Differenz → gewonnene Games → direkter Vergleich.
      </p>

      {st.notes.length > 0 && (
        <section className="stack">
          <SectionHead title="Entscheidungen bei Punktgleichheit" />
          <ul className="notes">
            {st.notes.map((n, i) => (
              <li key={i} className={`note note-${n.kind}`}>
                {n.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {readOnly && st.unresolved.length > 0 && (
        <p className="alert">Gleichstand nach allen Kriterien – die Turnierleitung entscheidet die Reihenfolge.</p>
      )}

      {!readOnly && st.unresolved.map((g) => (
        <TieDecision key={g.key} group={g} rows={st.rows} onSave={(ids) => setManualTie(g.key, ids)} />
      ))}

      {!readOnly && [...new Set(st.rows.filter((r) => r.decidedBy === 'manual').map((r) => r.tieKey))].map((key) => (
        <div key={key} className="alert">
          Manuelle Reihenfolge festgelegt für{' '}
          {st.rows
            .filter((r) => r.tieKey === key)
            .map((r) => r.team.name)
            .join(', ')}
          .{' '}
          <button className="link" onClick={() => setManualTie(key, null)}>
            Aufheben
          </button>
        </div>
      ))}
    </div>
  );
}

function TieDecision({ group, rows, onSave }) {
  const [order, setOrder] = useState(group.ids);
  const firstPos = rows.find((r) => group.ids.includes(r.teamId)).position;
  const move = (i, d) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  return (
    <section className="tie-box">
      <h3 className="tie-title">Gleichstand – Entscheidung durch den Organisator</h3>
      <p className="small">
        Nach allen Kriterien gleichauf. Reihenfolge festlegen (z. B. nach Losentscheid oder Golden-Point-Duell):
      </p>
      <ol className="tie-list">
        {order.map((id, i) => (
          <li key={id}>
            <span className="num tie-pos">{firstPos + i}.</span>
            <span className="team-name">{TEAM_BY_ID[id].name}</span>
            <span className="tie-btns">
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${TEAM_BY_ID[id].name} nach oben`}>
                ↑
              </button>
              <button className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`${TEAM_BY_ID[id].name} nach unten`}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button className="btn btn-primary btn-block" onClick={() => onSave(order)}>
        Reihenfolge festlegen
      </button>
    </section>
  );
}

/* ---------------- Finalrunde ---------------- */

function Finals({ results, finals, manualTies, setFinal, showPlayers, setTab }) {
  const readOnly = useContext(ReadOnly);
  const ranking = finalRanking(results, finals, manualTies);
  const fp = ranking.pairings;
  const progress = groupProgress(results);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Platzierungsspiele</h2>
        <p className="muted">9 Games · Einstand/Vorteil, bei Zeitdruck Golden Point · kein Unentschieden</p>
      </div>

      {!fp.unlocked && (
        <section className="locked">
          <Icon name="lock" />
          <div>
            <p className="locked-title">Noch gesperrt</p>
            <p>{fp.reason}</p>
            {!progress.complete && (
              <div className="bar">
                <div className="bar-fill" style={{ width: `${(progress.confirmed / progress.total) * 100}%` }} />
              </div>
            )}
            {fp.blocking.length > 0 && !readOnly && (
              <button className="btn btn-primary" onClick={() => setTab('tabelle')}>
                Zur Tabelle
              </button>
            )}
          </div>
        </section>
      )}

      {!fp.unlocked && (
        <ul className="preview-list">
          {FINALS.map((f) => (
            <li key={f.id}>
              <CourtBadge court={f.court} />
              <span>
                <strong>{f.label}</strong>
                <span className="muted"> · Platz {f.places[0]} gegen Platz {f.places[1]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {fp.unlocked && (
        <div className="match-list">
          {FINALS.map((f) => (
            <FinalMatchCard key={f.id} final={f} pairing={fp.pairings[f.id]} stored={finals[f.id]} showPlayers={showPlayers} onChange={(v) => setFinal(f.id, v)} />
          ))}
        </div>
      )}

      {fp.unlocked && (
        <section className="stack">
          <SectionHead title="Endgültige Platzierungen" note={ranking.complete ? 'Alle Spiele bestätigt' : 'Wird mit jedem bestätigten Spiel ergänzt'} />
          <ol className="final-list">
            {ranking.places.map((p) => (
              <li key={p.place} className={`place-${p.place}`}>
                <span className="num final-place">{p.place}.</span>
                {p.decided ? (
                  <span className="team-name">{TEAM_BY_ID[p.teamId].name}</span>
                ) : (
                  <span className="muted">{p.candidates.map((id) => TEAM_BY_ID[id].name).join(' / ')}</span>
                )}
              </li>
            ))}
          </ol>
          {ranking.complete && (
            <button className="btn btn-ball btn-block" onClick={() => setTab('ehrung')}>
              Zur Siegerehrung
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function FinalMatchCard({ final, pairing, stored, showPlayers, onChange }) {
  const readOnly = useContext(ReadOnly);
  const st = finalMatchState(pairing, stored);
  const { teamA, teamB } = pairing;
  if (readOnly) {
    const done = st.status === 'confirmed';
    return (
      <ViewMatchCard
        court={final.court}
        label={final.label}
        home={teamA}
        away={teamB}
        result={done ? { a: st.a, b: st.b, confirmed: true } : null}
        winner={done ? st.winner : null}
        golden={done && st.a === st.b ? st.golden : null}
        showPlayers={showPlayers}
      />
    );
  }

  if (st.status === 'stale') {
    return (
      <article className="match status-stale">
        <header className="match-head">
          <CourtBadge court={final.court} />
          <span className="final-label">{final.label}</span>
        </header>
        <div className="alert alert-warn">
          Die Paarung hat sich durch eine Korrektur in der Vorrunde geändert. Das gespeicherte Ergebnis{' '}
          <strong>
            {TEAM_BY_ID[st.stored.teamA].name} {st.stored.a}:{st.stored.b} {TEAM_BY_ID[st.stored.teamB].name}
          </strong>{' '}
          gehört nicht zu {TEAM_BY_ID[teamA].name} gegen {TEAM_BY_ID[teamB].name} und wird nicht gewertet.
        </div>
        <footer className="match-foot">
          <span className="muted small">Wird die Korrektur zurückgenommen, gilt es wieder.</span>
          <button className="btn btn-primary btn-sm" onClick={() => onChange(null)}>
            Verwerfen
          </button>
        </footer>
      </article>
    );
  }

  const a = st.a ?? null;
  const b = st.b ?? null;
  const confirmed = st.status === 'confirmed';
  const status = st.status === 'empty' ? 'open' : confirmed ? 'done' : 'entered';
  const v = st.validation;
  const set = (patch) => onChange({ teamA, teamB, a, b, golden: st.golden ?? null, confirmed: false, ...patch });
  const isDraw = a != null && b != null && a === b;

  return (
    <article className={`match match-final final-${final.id} status-${status}`}>
      <header className="match-head">
        <CourtBadge court={final.court} />
        <span className="final-label">{final.label}</span>
        <StatusChip status={status} />
      </header>
      <p className="final-sub muted small">
        Platz {final.places[0]} gegen Platz {final.places[1]} der Vorrunde
      </p>
      <div className="match-body">
        <TeamScore id={teamA} value={a} showPlayers={showPlayers} locked={confirmed} max={FINAL_MAX_GAMES - (b ?? 0)} onChange={(n) => set({ a: n, golden: null })} winner={confirmed && st.winner === teamA} extra={confirmed && isDraw && st.golden === teamA ? <span className="tag">Golden Point</span> : null} />
        <TeamScore id={teamB} value={b} showPlayers={showPlayers} locked={confirmed} max={FINAL_MAX_GAMES - (a ?? 0)} onChange={(n) => set({ b: n, golden: null })} winner={confirmed && st.winner === teamB} extra={confirmed && isDraw && st.golden === teamB ? <span className="tag">Golden Point</span> : null} />
      </div>

      {!confirmed && isDraw && (
        <div className="golden">
          <p className="golden-title">Gleichstand nach Zeitablauf – entscheidender Golden Point</p>
          <div className="golden-btns">
            {[teamA, teamB].map((id) => (
              <button key={id} className={`btn btn-sm ${st.golden === id ? 'btn-ball' : 'btn-ghost'}`} aria-pressed={st.golden === id} onClick={() => set({ golden: id })}>
                {TEAM_BY_ID[id].name}
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="match-foot">
        {confirmed ? (
          <>
            <span className="muted">Sieger: {TEAM_BY_ID[st.winner].name}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onChange({ ...stored, confirmed: false })}>
              Korrigieren
            </button>
          </>
        ) : (
          <>
            <span className={`hint ${a != null && b != null && !v?.ok && !v?.needsGolden ? 'is-error' : ''}`}>
              {a == null && b == null ? `Games eintragen (max. ${FINAL_MAX_GAMES})` : v?.ok ? `${a + b} von ${FINAL_MAX_GAMES} Games` : v?.error}
            </span>
            <div className="btn-row tight">
              {status !== 'open' && (
                <button className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
                  Leeren
                </button>
              )}
              <button className="btn btn-primary btn-sm" disabled={!v?.ok} onClick={() => set({ confirmed: true, golden: isDraw ? st.golden : null })}>
                Bestätigen
              </button>
            </div>
          </>
        )}
      </footer>
    </article>
  );
}

/* ---------------- Siegerehrung ---------------- */

function Awards({ results, finals, manualTies, showPlayers, setTab, onExport }) {
  const ranking = finalRanking(results, finals, manualTies);
  if (!ranking.complete) {
    return (
      <div className="stack-lg">
        <div className="page-head">
          <h2 className="page-title">Siegerehrung</h2>
        </div>
        <section className="locked">
          <Icon name="medal" />
          <div>
            <p className="locked-title">Noch nicht entschieden</p>
            <p>Die Siegerehrung erscheint, sobald alle drei Platzierungsspiele bestätigt sind.</p>
            <button className="btn btn-primary" onClick={() => setTab('finale')}>
              Zu den Platzierungsspielen
            </button>
          </div>
        </section>
      </div>
    );
  }
  const team = (place) => TEAM_BY_ID[ranking.places[place - 1].teamId];
  const podium = [2, 1, 3];
  return (
    <div className="stack-lg awards">
      <div className="page-head center">
        <p className="eyebrow">{TOURNAMENT.dateLabel}</p>
        <h2 className="page-title">Siegerehrung</h2>
      </div>
      <div className="podium">
        {podium.map((p) => (
          <div key={p} className={`podium-col podium-${p}`}>
            <div className="podium-team">
              <Medal place={p} />
              <span className="podium-name">{team(p).name}</span>
              <span className="players">{team(p).players.join(' & ')}</span>
            </div>
            <div className="podium-block">
              <span className="num">{p}</span>
            </div>
          </div>
        ))}
      </div>
      <ol className="final-list rest">
        {[4, 5, 6].map((p) => (
          <li key={p}>
            <span className="num final-place">{p}.</span>
            <span className="team-name">{team(p).name}</span>
            {showPlayers && <span className="players">{team(p).players.join(' & ')}</span>}
          </li>
        ))}
      </ol>
      <p className="muted small center">Herzlichen Glückwunsch an alle sechs Teams – danke fürs Mitspielen!</p>
      {!onExport ? null : (
        <button className="btn btn-ghost btn-block" onClick={onExport}>
          <Icon name="share" /> Ergebnisse exportieren
        </button>
      )}
    </div>
  );
}

function Medal({ place }) {
  return (
    <svg className={`medal medal-${place}`} viewBox="0 0 48 56" aria-label={`Platz ${place}`} role="img">
      <path d="M14 0h8l6 18h-8z" className="ribbon-a" />
      <path d="M34 0h-8l-6 18h8z" className="ribbon-b" />
      <circle cx="24" cy="36" r="17" className="medal-disc" />
      <circle cx="24" cy="36" r="12.5" className="medal-ring" />
      <text x="24" y="42" textAnchor="middle" className="medal-num">
        {place}
      </text>
    </svg>
  );
}

/* ---------------- Export & Zurücksetzen ---------------- */

function ExportSheet({ state, onClose, onRestore }) {
  const [mode, setMode] = useState('text');
  const [copied, setCopied] = useState(false);
  const [restoreText, setRestoreText] = useState('');
  const [restoreMsg, setRestoreMsg] = useState(null);
  const ref = useRef(null);
  const text = mode === 'text' ? exportText(state) : JSON.stringify(state, null, 1);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      ref.current?.select();
      setCopied(false);
    }
  };

  return (
    <Modal title="Ergebnisse exportieren" onClose={onClose}>
      <div className="seg">
        <button className={`seg-btn ${mode === 'text' ? 'is-active' : ''}`} onClick={() => setMode('text')}>
          Ergebnisliste
        </button>
        <button className={`seg-btn ${mode === 'json' ? 'is-active' : ''}`} onClick={() => setMode('json')}>
          Backup
        </button>
      </div>
      <textarea id="export-text" ref={ref} className="export-text" readOnly value={text} rows={12} onFocus={(e) => e.target.select()} />
      <div className="btn-row">
        <button className="btn btn-primary" onClick={copy}>
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
        {!inFrame && (
          <button className="btn btn-ghost" onClick={() => window.print()}>
            Drucken
          </button>
        )}
      </div>
      {mode === 'json' && (
        <div className="stack">
          <label className="small" htmlFor="restore-text">
            Backup auf diesem Gerät wiederherstellen (ersetzt alle aktuellen Ergebnisse):
          </label>
          <textarea id="restore-text" className="export-text" rows={4} value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder="Backup hier einfügen" />
          <button
            className="btn btn-ghost"
            disabled={!restoreText.trim()}
            onClick={() => {
              try {
                onRestore(parseBackup(restoreText));
                setRestoreMsg('Backup wiederhergestellt.');
              } catch {
                setRestoreMsg('Das eingefügte Backup konnte nicht gelesen werden.');
              }
            }}
          >
            Wiederherstellen
          </button>
          {restoreMsg && <p className="small">{restoreMsg}</p>}
        </div>
      )}
    </Modal>
  );
}

function ResetDialog({ onCancel, onConfirm }) {
  const [step, setStep] = useState(1);
  return (
    <Modal title="Turnier zurücksetzen?" onClose={onCancel}>
      <p>Alle Ergebnisse der Vorrunde und der Platzierungsspiele sowie manuelle Entscheidungen werden auf diesem Gerät gelöscht. Teams und Spielplan bleiben erhalten.</p>
      {step === 2 && <p className="alert alert-danger">Wirklich alles löschen? Das kann nicht rückgängig gemacht werden.</p>}
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        {step === 1 ? (
          <button className="btn btn-danger" onClick={() => setStep(2)}>
            Zurücksetzen …
          </button>
        ) : (
          <button className="btn btn-danger" onClick={onConfirm}>
            Ja, endgültig löschen
          </button>
        )}
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="stack">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Abgleich ---------------- */

function SyncBadge({ status, onClick }) {
  const label = { off: 'Lokal', syncing: 'Sync …', ok: 'Sync', offline: 'Offline', error: 'Sync-Fehler' }[status.state];
  return (
    <button className={`sync-badge sync-${status.state}`} onClick={onClick} aria-label={`Abgleich: ${label}`}>
      <span className="sync-dot" aria-hidden="true" />
      {label}
    </button>
  );
}

function SyncSheet({ sync, onClose }) {
  const { config, setConfig, status, syncNow } = sync;
  const [token, setToken] = useState(config.token);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const ago = status.at ? Math.max(0, Math.round((Date.now() - status.at) / 1000)) : null;

  const connect = async () => {
    setBusy(true);
    setCheck(null);
    try {
      await testConnection({ ...config, token });
      setConfig({ ...config, token: token.trim() });
      setCheck({ ok: true, text: 'Verbunden. Ergebnisse werden jetzt abgeglichen.' });
    } catch (e) {
      setCheck({ ok: false, text: e instanceof TypeError ? 'Keine Verbindung zu GitHub.' : e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Zweites Handy verbinden" onClose={onClose}>
      <p className="small">
        Beide Handys speichern die Ergebnisse zusätzlich in der Datei <code>{config.path}</code> im Repository{' '}
        <strong>
          {config.owner}/{config.repo}
        </strong>{' '}
        (Branch <code>{config.branch}</code>). Änderungen erscheinen nach wenigen Sekunden auf dem anderen Handy.
      </p>
      {config.token && (
        <div className={`alert ${status.state === 'error' ? 'alert-danger' : ''}`}>
          <strong>Status:</strong>{' '}
          {status.state === 'ok' && `abgeglichen${ago != null ? ` vor ${ago} s` : ''}`}
          {status.state === 'syncing' && 'gleiche ab …'}
          {(status.state === 'offline' || status.state === 'error') && status.error}{' '}
          <button className="link" onClick={() => syncNow()}>
            Jetzt abgleichen
          </button>
        </div>
      )}
      <label className="small" htmlFor="sync-token">
        GitHub-Token (Fine-grained, nur Repository „{config.repo}“, Contents: Read and write)
      </label>
      <input
        id="sync-token"
        className="text-input"
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="github_pat_…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      {check && <p className={`small ${check.ok ? 'ok-text' : 'error-text'}`}>{check.text}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" disabled={!token.trim() || busy} onClick={connect}>
          {busy ? 'Prüfe …' : config.token ? 'Token speichern' : 'Verbinden'}
        </button>
        {config.token && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setConfig({ ...DEFAULT_SYNC, token: '' });
              setToken('');
              setCheck(null);
            }}
          >
            Trennen
          </button>
        )}
      </div>
      <p className="muted small">Der Token bleibt nur auf diesem Handy gespeichert. Nach dem Turnier kannst du ihn auf GitHub löschen.</p>
    </Modal>
  );
}

function LiveBadge({ status, onClick }) {
  const label = status.state === 'offline' ? 'Offline' : 'Live';
  return (
    <button className={`sync-badge sync-${status.state === 'ok' ? 'ok' : status.state}`} onClick={onClick} aria-label="Stand aktualisieren">
      <span className="sync-dot" aria-hidden="true" />
      {label}
    </button>
  );
}

function ViewerLink() {
  const [copied, setCopied] = useState(false);
  const url = viewerUrl();
  return (
    <div className="viewer-link">
      <p className="small">
        <strong>Link für die Teilnehmer</strong> (nur ansehen, ohne Token):
      </p>
      <input id="viewer-url" className="text-input" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button
        className="btn btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            document.getElementById('viewer-url')?.select();
          }
        }}
      >
        {copied ? 'Kopiert ✓' : 'Link kopieren'}
      </button>
    </div>
  );
}

function ViewMatchCard({ court, label, home, away, result, winner, golden, showPlayers }) {
  const done = isConfirmedGroup(result) || (result?.confirmed && result.a != null);
  const a = done ? result.a : null;
  const b = done ? result.b : null;
  const win = winner ?? (done && a !== b ? (a > b ? home : away) : null);
  return (
    <article className={`match status-${done ? 'done' : 'open'}`}>
      <header className="match-head">
        <CourtBadge court={court} />
        {label && <span className="final-label">{label}</span>}
        <StatusChip status={done ? 'done' : 'open'} />
      </header>
      <div className="match-body">
        {[
          [home, a],
          [away, b],
        ].map(([id, score]) => (
          <div key={id} className={`team-score ${win === id ? 'is-winner' : ''}`}>
            <div className="team-score-name">
              <span className="team-name">{TEAM_BY_ID[id].name}</span>
              {showPlayers && <span className="players">{TEAM_BY_ID[id].players.join(' & ')}</span>}
              {golden === id && <span className="tag">Golden Point</span>}
            </div>
            <span className="score-locked num">{score ?? '–'}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

/* ---------------- Kleinteile ---------------- */

function SectionHead({ title, note }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {note && <span className="section-note">{note}</span>}
    </div>
  );
}

function CourtBadge({ court }) {
  return (
    <span className={`court-badge court-${court}`}>
      <span className="court-id">{court}</span>
      <span className="court-side">{courtSide[court]}</span>
    </span>
  );
}

function StatusChip({ status }) {
  const label = { open: 'Offen', entered: 'Nicht bestätigt', done: 'Abgeschlossen' }[status];
  return <span className={`chip chip-${status}`}>{label}</span>;
}

function BallMark() {
  return (
    <svg className="ball-mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" className="ball-fill" />
      <path d="M5 9c6 3 6 11 0 14M27 9c-6 3-6 11 0 14" className="ball-seam" />
    </svg>
  );
}

function Icon({ name }) {
  const paths = {
    home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    table: 'M4 5h16M4 10h16M4 15h16M4 20h16M9 5v15',
    trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8',
    medal: 'M8 3l4 7 4-7M12 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
    check: 'M5 12l5 5L19 7',
    x: 'M6 6l12 12M18 6 6 18',
    share: 'M12 4v12M7 9l5-5 5 5M5 14v6h14v-6',
    reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
    sync: 'M20 11a8 8 0 0 0-14.3-4.9M4 5v4h4M4 13a8 8 0 0 0 14.3 4.9M20 19v-4h-4',
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
