import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  TOURNAMENT,
  COURTS,
  SCHEDULE,
  FINALS,
  ROUNDS,
  MATCHES_PER_ROUND,
  GROUP_GAMES,
  DEFAULT_TIMES,
  DEFAULT_TEAMS,
  resolveTeams,
  teamMap,
  resolveTimes,
  timeline,
  toClock,
  isClock,
  berlinMinutes,
  validateSchedule,
  validateGroupScore,
  applyGroupScoreChange,
  groupStepperMax,
  isConfirmedGroup,
  groupMatchStatus,
  computeStandings,
  groupProgress,
  currentRound,
  finalsMode,
  finalPairings,
  finalMatchState,
  finalRanking,
  formatDiff,
  timerOps,
  timerRemaining,
  exportText,
  resultsCsv,
  standingsCsv,
} from './logic.js';
import { useTournamentStore, initialState, parseBackup } from '../store.js';
import { applyChange, clearAll, replaceAll, pickShared, useMastersSync, useMastersViewer, testConnection, MASTERS_FILE } from './sync.js';

// TJ Padel Masters (29.11.2026). Turnierleitung: …/Padel-Turnier/masters/ · Teilnehmer: …/masters/?ansicht · TV: …/masters/?ansicht&tv
const STORE_KEY = 'padel-masters-2911';
const VIEW_KEY = 'padel-masters-2911-ansicht';
const ROUND_LIST = Array.from({ length: ROUNDS }, (_, i) => i + 1);
const MIN = 60 * 1000;

const ReadOnly = createContext(false);
const Data = createContext(null); // { teams, byId, times, tl }
const viewerUrl = () => `${location.origin}${location.pathname}?ansicht`;
const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const TABS = [
  { id: 'start', label: 'Übersicht', icon: 'home' },
  { id: 'spielplan', label: 'Spielplan', icon: 'grid' },
  { id: 'tabelle', label: 'Tabelle', icon: 'table' },
  { id: 'finale', label: 'Finale', icon: 'trophy' },
  { id: 'ergebnis', label: 'Ergebnis', icon: 'medal' },
  { id: 'admin', label: 'Admin', icon: 'gear', admin: true },
];

function readHash(readOnly) {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '');
  return TABS.some((t) => t.id === h && !(t.admin && readOnly)) ? h : 'start';
}

const masterInitial = () => ({ ...initialState(), settings: {}, showPlayers: true });

export default function App({ readOnly = false, tv = false }) {
  const [state, setState] = useTournamentStore(readOnly ? VIEW_KEY : STORE_KEY);
  const [tab, setTabState] = useState(() => readHash(readOnly));
  const [sheet, setSheet] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const [tvMode, setTvMode] = useState(tv);
  const online = useOnline();
  const now = useNow(1000);

  useEffect(() => {
    const onHash = () => setTabState(readHash(readOnly));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [readOnly]);

  const setTab = (id) => {
    setTabState(id);
    try {
      history.replaceState(null, '', `${location.search}#${id}`);
    } catch {
      /* ignorieren */
    }
    window.scrollTo({ top: 0 });
  };

  const results = state.results || {};
  const finals = state.finals || {};
  const manualTies = state.manualTies || {};
  const settings = state.settings || {};
  const showPlayers = state.showPlayers !== false;

  const teams = useMemo(() => resolveTeams(settings), [settings]);
  const byId = useMemo(() => teamMap(teams), [teams]);
  const times = useMemo(() => resolveTimes(settings), [settings]);
  const tl = useMemo(() => timeline(times), [times]);
  const data = { teams, byId, times, tl };

  const update = (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  const change = (section) => (key, value) => setState((s) => ({ ...s, ...applyChange(pickShared(s), section, key, value) }));
  const setResult = change('results');
  const setFinal = change('finals');
  const setManualTie = change('manualTies');
  const setSetting = change('settings');
  // readOnly ändert sich während der Laufzeit nie, daher ist der bedingte Hook-Aufruf stabil.
  const sync = readOnly ? useMastersViewer(setState) : useMastersSync(state, setState);

  const timer = settings.timer || null;
  const setTimer = (t) => setSetting('timer', t);
  useTimerAlarm(timer, now, !readOnly);

  const print = (job) => {
    setPrintJob(job);
    setTimeout(() => window.print(), 50);
  };

  const ctx = { state, results, finals, manualTies, settings, showPlayers, setResult, setFinal, setManualTie, setSetting, setTab, update, timer, setTimer, now, print };

  useEffect(() => {
    document.documentElement.classList.toggle('mx-tv-mode', tvMode);
  }, [tvMode]);

  if (tvMode) {
    return (
      <ReadOnly.Provider value={true}>
        <Data.Provider value={data}>
          <TvBoard {...ctx} sync={sync} online={online} onExit={() => exitTv(setTvMode)} />
        </Data.Provider>
      </ReadOnly.Provider>
    );
  }

  const tabs = TABS.filter((t) => !(t.admin && readOnly));

  return (
    <ReadOnly.Provider value={readOnly}>
      <Data.Provider value={data}>
        <div className={`app mx-app ${readOnly ? 'is-readonly' : ''}`}>
          <header className="topbar">
            <div className="topbar-inner">
              <button className="brand" onClick={() => setTab('start')} aria-label="Zur Übersicht">
                <Logo />
                <span className="brand-text">
                  <span className="brand-name">TJ Masters</span>
                  <span className="brand-sub">29.11. · 11–14 Uhr</span>
                </span>
              </button>
              <label className="switch" htmlFor="toggle-players">
                <input id="toggle-players" type="checkbox" checked={showPlayers} onChange={(e) => update({ showPlayers: e.target.checked })} />
                <span className="switch-track" aria-hidden="true" />
                <span className="switch-label">Spieler</span>
              </label>
              {readOnly ? (
                <SyncBadge status={sync.status} online={online} label="Live" onClick={sync.refresh} />
              ) : (
                !inFrame && <SyncBadge status={sync.status} online={online} onClick={() => setTab('admin')} />
              )}
            </div>
          </header>

          <main className="wrap main">
            {tab === 'start' && <Dashboard {...ctx} onTv={() => enterTv(setTvMode)} />}
            {tab === 'spielplan' && <Schedule {...ctx} />}
            {tab === 'tabelle' && <Standings {...ctx} />}
            {tab === 'finale' && <Finals {...ctx} />}
            {tab === 'ergebnis' && <Result {...ctx} />}
            {tab === 'admin' && !readOnly && <Admin {...ctx} sync={sync} onExport={() => setSheet('export')} onReset={() => setSheet('reset')} />}
          </main>

          <nav className="tabbar" aria-label="Bereiche">
            <div className={`tabbar-inner mx-tabs-${tabs.length}`}>
              {tabs.map((t) => (
                <button key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                  <Icon name={t.icon} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {sheet === 'export' && (
            <ExportSheet state={state} onClose={() => setSheet(null)} onRestore={(s) => setState((cur) => ({ ...cur, ...replaceAll(pickShared(cur), s) }))} />
          )}
          {sheet === 'reset' && (
            <ResetDialog
              onCancel={() => setSheet(null)}
              onConfirm={() => {
                setState((cur) => ({ ...masterInitial(), showPlayers: cur.showPlayers, ...clearAll(pickShared(cur)) }));
                setSheet(null);
                setTab('start');
              }}
            />
          )}

          <div className="print-only print-report mx-print">
            <PrintArea job={printJob} state={state} />
          </div>
        </div>
      </Data.Provider>
    </ReadOnly.Provider>
  );
}

function enterTv(setTvMode) {
  setTvMode(true);
  try {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } catch {
    /* Vollbild nicht verfügbar */
  }
}

function exitTv(setTvMode) {
  setTvMode(false);
  try {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } catch {
    /* ignorieren */
  }
}

/* ---------------- Hooks ---------------- */

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Verfolgt, ob das Gerät laut Browser online ist (reagiert sofort auf Flugmodus/WLAN-Verlust). */
function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

// Audio darf erst nach einer Berührung starten – deshalb beim ersten Tippen freischalten.
let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });
}

function beep() {
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    [0, 0.35, 0.7, 1.05].forEach((offset) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + offset);
      o.stop(ctx.currentTime + offset + 0.3);
    });
  } catch {
    /* Audio nicht verfügbar */
  }
}

/** Signal bei Ablauf – einmal pro Timerlauf. Der Timer schließt keine Begegnung ab. */
function useTimerAlarm(timer, now, enabled) {
  const fired = useRef(null);
  const rem = timerRemaining(timer, now);
  useEffect(() => {
    if (!timer || !timer.running) return;
    const id = `${timer.phase}-${timer.round}-${timer.endsAt}`;
    if (rem === 0 && fired.current !== id) {
      fired.current = id;
      beep();
      try {
        navigator.vibrate?.([300, 150, 300]);
      } catch {
        /* nicht unterstützt */
      }
    }
  }, [timer, rem, enabled]);
}

/* ---------------- Timer-Logik ---------------- */

const fmtMs = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function phaseLabel(timer) {
  if (!timer) return 'Kein Timer';
  if (timer.phase === 'pause') return 'Pause';
  if (timer.phase === 'finals') return 'Platzierungsspiele';
  return `Runde ${timer.round}`;
}

/** Turniertag in Berlin: vorher, währenddessen, danach. */
function dayInfo(now, tl) {
  let date = '';
  try {
    date = new Intl.DateTimeFormat('en-CA', { timeZone: TOURNAMENT.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  } catch {
    date = new Date(now).toISOString().slice(0, 10);
  }
  const mins = berlinMinutes(new Date(now));
  if (date < TOURNAMENT.date) return { phase: 'before', text: `Start am 29.11. um ${tl.rounds[0].from} Uhr` };
  if (date > TOURNAMENT.date) return { phase: 'after', text: 'Turnier beendet' };
  const left = tl.end.start - mins;
  if (mins < tl.rounds[0].start) return { phase: 'before', text: `Start um ${tl.rounds[0].from} Uhr (in ${fmtHm(tl.rounds[0].start - mins)})` };
  if (left <= 0) return { phase: 'after', text: `Turnierende ${tl.end.from} Uhr erreicht` };
  return { phase: 'during', text: `Noch ${fmtHm(left)} bis ${tl.end.from} Uhr`, left };
}
const fmtHm = (m) => {
  const total = Math.max(0, Math.floor(m));
  const h = Math.floor(total / 60);
  return h ? `${h}:${String(total % 60).padStart(2, '0')} h` : `${total} min`;
};

/* ---------------- Dashboard ---------------- */

function Dashboard({ results, finals, manualTies, settings, showPlayers, setSetting, timer, setTimer, now, setTab, onTv }) {
  const readOnly = useContext(ReadOnly);
  const { tl, teams, byId, times } = useContext(Data);
  const progress = groupProgress(results);
  const round = currentRound(results);
  const ranking = finalRanking(results, finals, manualTies, settings, { teams });
  const day = dayInfo(now, tl);
  const scheduleCheck = useMemo(() => validateSchedule(), []);
  const roundMatches = round === 'finals' ? [] : SCHEDULE.filter((m) => m.round === round);
  const nextRound = round === 'finals' ? null : round < ROUNDS ? round + 1 : null;
  const pauseNext = round !== 'finals' && round === Number(times.pauseAfterRound) + 1 && roundMatches.every((m) => !results[m.id]);

  let headline;
  let sub;
  if (timer && timer.running && timer.phase === 'pause') {
    headline = 'Pause';
    sub = tl.pause ? `${tl.pause.from}–${tl.pause.to} Uhr · danach Runde ${round}` : `danach Runde ${round}`;
  } else if (round !== 'finals') {
    headline = `Runde ${round}`;
    sub = `von ${ROUNDS} · ${tl.rounds[round - 1].from}–${tl.rounds[round - 1].to} Uhr${pauseNext ? ' · nach der Pause' : ''}`;
  } else if (ranking.complete) {
    headline = 'Turnier beendet';
    sub = `Sieger: ${byId[ranking.places[0].teamId].name}`;
  } else if (ranking.pairings.unlocked) {
    headline = 'Platzierungsspiele';
    sub = `ab ca. ${tl.finals.from} Uhr`;
  } else {
    headline = 'Auswertung';
    sub = 'Gleichstand in der Tabelle klären';
  }

  return (
    <div className="stack-lg">
      <section className="hero mx-hero">
        <div className="hero-court" aria-hidden="true" />
        <div className="hero-body">
          <div className="mx-hero-top">
            <Logo big />
            <div>
              <p className="eyebrow">{TOURNAMENT.dateLabel} · {TOURNAMENT.venue}</p>
              <h1 className="hero-title">{TOURNAMENT.name}</h1>
            </div>
          </div>
          <div className="hero-now">
            <div>
              <p className="label">Aktuell</p>
              <p className="hero-round">{headline}</p>
              <p className="hero-sub">{sub}</p>
            </div>
            <div className="hero-progress">
              <p className="label">Countdown</p>
              <p className={`mx-countdown num ${timer && timerRemaining(timer, now) === 0 ? 'is-over' : ''}`}>{timer ? fmtMs(timerRemaining(timer, now)) : '--:--'}</p>
              <p className="hero-sub">{timer ? `${phaseLabel(timer)}${timer.running ? '' : ' · angehalten'}` : 'Timer nicht gestartet'}</p>
            </div>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.confirmed}>
            <div className="bar-fill" style={{ width: `${(progress.confirmed / progress.total) * 100}%` }} />
          </div>
          <p className="hero-sub mx-hero-meta">
            <span>
              Vorrunde {progress.confirmed}/{progress.total} Matches
            </span>
            <span>{day.text}</span>
          </p>
          {readOnly ? (
            <button className="btn btn-ball btn-block" onClick={() => setTab('tabelle')}>
              Zur Live-Tabelle
            </button>
          ) : (
            <button className="btn btn-ball btn-block" onClick={() => setTab(round === 'finals' ? 'finale' : 'spielplan')}>
              {round === 'finals' ? 'Platzierungsspiele' : `Ergebnisse Runde ${round} erfassen`}
            </button>
          )}
        </div>
      </section>

      {!readOnly && <TimerPanel timer={timer} setTimer={setTimer} now={now} round={round} settings={settings} setSetting={setSetting} />}

      {round !== 'finals' && (
        <section className="stack">
          <SectionHead title={`Läuft gerade · Runde ${round}`} note={`${tl.rounds[round - 1].from}–${tl.rounds[round - 1].to} Uhr`} />
          <div className="court-row mx-court-row">
            {roundMatches.map((m) => (
              <CourtTile key={m.id} match={m} result={results[m.id]} status={groupMatchStatus(m, results[m.id], settings)} showPlayers={showPlayers} onClick={() => setTab('spielplan')} />
            ))}
          </div>
        </section>
      )}

      {round === 'finals' && ranking.pairings.unlocked && !ranking.skipped && (
        <section className="stack">
          <SectionHead title="Platzierungsspiele" note={`ab ${tl.finals.from} Uhr`} />
          <div className="court-row mx-court-row">
            {FINALS.map((f) => {
              const p = ranking.pairings.pairings[f.id];
              const st = finalMatchState(p, finals[f.id]);
              return (
                <CourtTile
                  key={f.id}
                  match={{ court: f.court, home: p.teamA, away: p.teamB, label: f.label }}
                  result={st.status === 'done' || (!readOnly && st.status === 'running') ? { a: st.a, b: st.b } : null}
                  status={st.status === 'stale' ? 'open' : st.status}
                  showPlayers={showPlayers}
                  onClick={() => setTab('finale')}
                />
              );
            })}
          </div>
        </section>
      )}

      {nextRound && (
        <section className="stack">
          <SectionHead title={`Als Nächstes · Runde ${nextRound}`} note={`${Number(times.pauseAfterRound) === round && tl.pause ? `nach der Pause · ` : ''}${tl.rounds[nextRound - 1].from} Uhr`} />
          <ul className="mx-next">
            {SCHEDULE.filter((m) => m.round === nextRound).map((m) => (
              <li key={m.id}>
                <CourtBadge court={m.court} />
                <span>
                  <strong>{byId[m.home].name}</strong> <span className="muted">gegen</span> <strong>{byId[m.away].name}</strong>
                  {showPlayers && (
                    <span className="players">
                      {byId[m.home].players.join(' & ')} · {byId[m.away].players.join(' & ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack">
        <SectionHead title="Zeitplan" note="Europe/Berlin" />
        <ul className="mx-timeline">
          {tl.rounds.map((r) => (
            <li key={r.round} className={round === r.round ? 'is-now' : round === 'finals' || r.round < round ? 'is-done' : ''}>
              <span className="num">{r.from}–{r.to}</span>
              <span>Runde {r.round}</span>
              {tl.pause && r.round === Number(times.pauseAfterRound) && <PauseRow pause={tl.pause} />}
            </li>
          ))}
          <li>
            <span className="num">
              {tl.evaluation.from}–{tl.evaluation.to}
            </span>
            <span>Auswertung</span>
          </li>
          <li>
            <span className="num">ab {tl.finals.from}</span>
            <span>Optionale Platzierungsspiele</span>
          </li>
          <li>
            <span className="num">{tl.end.from}</span>
            <span>Turnierende</span>
          </li>
        </ul>
      </section>

      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onTv}>
          <Icon name="tv" /> Vollbild / TV-Ansicht
        </button>
      </div>

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

      {readOnly && <p className="muted small center">Live-Ansicht · Ergebnisse erscheinen, sobald die Turnierleitung sie bestätigt.</p>}
    </div>
  );
}

function PauseRow({ pause }) {
  return (
    <span className="mx-timeline-pause">
      <span className="num">
        {pause.from}–{pause.to}
      </span>{' '}
      Gemeinsame Pause
    </span>
  );
}

/* ---------------- Timer ---------------- */

function TimerPanel({ timer, setTimer, now, round, settings, setSetting }) {
  const { times } = useContext(Data);
  const [finalMinutes, setFinalMinutes] = useState(20);
  const rem = timerRemaining(timer, now);
  const over = timer && rem === 0;
  const pct = timer && timer.total ? 100 - (rem / timer.total) * 100 : 0;
  const nextRoundToStart = round === 'finals' ? null : round;
  const roundState = nextRoundToStart ? settings[`rounds/${nextRoundToStart}`] : null;
  const pauseDue = round !== 'finals' && round === Number(times.pauseAfterRound) + 1;

  const startRound = (r) => {
    unlockAudio();
    setSetting(`rounds/${r}`, { started: Date.now(), ended: null });
    setTimer(timerOps.start('round', r, Number(times.roundMinutes) || 20));
  };
  const endRound = (r) => {
    setSetting(`rounds/${r}`, { ...(settings[`rounds/${r}`] || {}), ended: Date.now() });
    if (timer && timer.phase === 'round' && timer.round === r && timer.running) setTimer(timerOps.pause(timer));
  };

  return (
    <section className={`timer mx-timer ${over ? 'is-over' : ''} ${timer?.running ? 'is-running' : ''}`}>
      <div className="timer-head">
        <SectionHead title="Turniertimer" note={timer ? phaseLabel(timer) : 'bereit'} />
      </div>
      <div className="timer-body">
        <p className="timer-clock num" aria-live="polite">
          {timer ? fmtMs(rem) : fmtMs((Number(times.roundMinutes) || 20) * MIN)}
        </p>
        <div className="timer-actions">
          {timer && (timer.running ? (
            <button className="btn btn-ghost" onClick={() => setTimer(timerOps.pause(timer))}>
              Pausieren
            </button>
          ) : (
            rem > 0 && (
              <button className="btn btn-primary" onClick={() => (unlockAudio(), setTimer(timerOps.resume(timer)))}>
                Fortsetzen
              </button>
            )
          ))}
          {timer && (
            <button className="btn btn-ghost" onClick={() => setTimer(timerOps.reset(timer))} disabled={!timer.running && rem === timer.total}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>
      {timer && (
        <div className="btn-row tight mx-adjust">
          {[-5, -1, 1, 5].map((d) => (
            <button key={d} className="btn btn-ghost btn-sm" onClick={() => setTimer(timerOps.adjust(timer, d))}>
              {d > 0 ? `+${d}` : `−${-d}`} min
            </button>
          ))}
        </div>
      )}
      <div className="bar thin">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {over && <p className="timer-msg">Zeit abgelaufen – nur noch das laufende Game zu Ende spielen, dann Ergebnisse eintragen.</p>}
      <div className="mx-timer-starts">
        {nextRoundToStart && !(roundState?.started && !roundState?.ended) && !(pauseDue && !settings['pause/done'] && !(timer?.phase === 'pause')) && (
          <button className="btn btn-primary" onClick={() => startRound(nextRoundToStart)}>
            Runde {nextRoundToStart} starten ({times.roundMinutes} min)
          </button>
        )}
        {nextRoundToStart && roundState?.started && !roundState?.ended && (
          <button className="btn btn-ghost" onClick={() => endRound(nextRoundToStart)}>
            Runde {nextRoundToStart} beenden
          </button>
        )}
        {pauseDue && !(timer?.phase === 'pause') && !settings['pause/done'] && (
          <>
            <button className="btn btn-ball" onClick={() => (unlockAudio(), setTimer(timerOps.start('pause', null, Number(times.pauseMinutes) || 10)), setSetting('pause/done', { at: Date.now() }))}>
              Pause starten ({times.pauseMinutes} min)
            </button>
            <button className="btn btn-ghost" onClick={() => setSetting('pause/done', { at: Date.now(), skipped: true })}>
              Ohne Pause weiter
            </button>
          </>
        )}
        {round === 'finals' && (
          <span className="mx-final-timer">
            <label className="small" htmlFor="final-min">
              Platzierungsspiele:
            </label>
            <input id="final-min" className="text-input mx-num-input" type="number" min="1" max="120" value={finalMinutes} onChange={(e) => setFinalMinutes(Math.max(1, Number(e.target.value) || 1))} />
            <span className="small">min</span>
            <button className="btn btn-primary" onClick={() => (unlockAudio(), setTimer(timerOps.start('finals', null, finalMinutes)))}>
              Timer starten
            </button>
          </span>
        )}
      </div>
      <p className="muted small">Der Timer beendet keine Begegnung – Ergebnisse bestätigt immer die Turnierleitung.</p>
    </section>
  );
}

function CourtTile({ match, result, status, showPlayers, onClick }) {
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
  const { byId } = useContext(Data);
  return (
    <span className="tile-team">
      <span className="tile-team-name">
        {byId[id].name}
        {showPlayers && <span className="players">{byId[id].players.join(' & ')}</span>}
      </span>
      <span className="tile-score num">{score ?? '–'}</span>
    </span>
  );
}

/* ---------------- Spielplan ---------------- */

function Schedule({ results, manualTies, settings, setResult, showPlayers, print }) {
  const { tl, teams, byId, times } = useContext(Data);
  const [view, setView] = useState('runden');
  const [fTeam, setFTeam] = useState('');
  const [fRound, setFRound] = useState(() => {
    const r = currentRound(results);
    return r === 'finals' ? 'all' : r;
  });
  const [fCourt, setFCourt] = useState('');
  const [court, setCourt] = useState('D8');
  const [teamSel, setTeamSel] = useState('t1');

  const filtered = SCHEDULE.filter((m) => (fRound === 'all' || m.round === fRound) && (!fCourt || m.court === fCourt) && (!fTeam || m.home === fTeam || m.away === fTeam));
  const rounds = [...new Set(filtered.map((m) => m.round))];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Spielplan</h2>
        <p className="muted">
          {ROUNDS} Runden à {times.roundMinutes} Minuten inkl. Courtwechsel · {GROUP_GAMES} Games pro Match · Golden Point bei 40:40
        </p>
      </div>
      <div className="seg" role="tablist" aria-label="Ansicht">
        {[
          ['runden', 'Runden'],
          ['courts', 'Courts'],
          ['teams', 'Teams'],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={`seg-btn ${view === id ? 'is-active' : ''}`} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'runden' && (
        <>
          <div className="mx-filters">
            <label>
              <span className="label muted">Runde</span>
              <select className="text-input" value={fRound} onChange={(e) => setFRound(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">Alle Runden</option>
                {ROUND_LIST.map((r) => (
                  <option key={r} value={r}>
                    Runde {r} · {tl.rounds[r - 1].from}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label muted">Court</span>
              <select className="text-input" value={fCourt} onChange={(e) => setFCourt(e.target.value)}>
                <option value="">Alle Courts</option>
                {COURTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label muted">Team</span>
              <select className="text-input" value={fTeam} onChange={(e) => setFTeam(e.target.value)}>
                <option value="">Alle Teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {rounds.length === 0 && <p className="muted">Keine Begegnung passt zum Filter.</p>}
          {rounds.map((r) => (
            <section key={r} className="stack">
              {tl.pause && r === Number(times.pauseAfterRound) + 1 && (
                <div className="mx-pause">
                  <strong>
                    Gemeinsame Pause {tl.pause.from}–{tl.pause.to} Uhr
                  </strong>
                </div>
              )}
              <div className="round-head">
                <h3 className="round-title">Runde {r}</h3>
                <span className="round-time num">
                  {tl.rounds[r - 1].from}–{tl.rounds[r - 1].to}
                </span>
                <span className="round-count muted">
                  {SCHEDULE.filter((m) => m.round === r && isConfirmedGroup(results[m.id])).length}/{MATCHES_PER_ROUND} abgeschlossen
                </span>
              </div>
              <div className="match-list mx-match-list">
                {filtered
                  .filter((m) => m.round === r)
                  .map((m) => (
                    <GroupMatchCard key={m.id} match={m} result={results[m.id]} settings={settings} showPlayers={showPlayers} onChange={(v) => setResult(m.id, v)} />
                  ))}
              </div>
            </section>
          ))}
          <button className="btn btn-ghost" onClick={() => print({ kind: 'schedule' })}>
            <Icon name="print" /> Spielplan drucken
          </button>
        </>
      )}

      {view === 'courts' && (
        <>
          <div className="seg" role="tablist" aria-label="Court wählen">
            {COURTS.map((c) => (
              <button key={c} role="tab" aria-selected={court === c} className={`seg-btn ${court === c ? 'is-active' : ''}`} onClick={() => setCourt(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="match-list mx-match-list">
            {SCHEDULE.filter((m) => m.court === court).map((m) => (
              <div key={m.id} className="stack mx-court-entry">
                <p className="label muted">
                  Runde {m.round} · {tl.rounds[m.round - 1].from}–{tl.rounds[m.round - 1].to} Uhr
                </p>
                <GroupMatchCard match={m} result={results[m.id]} settings={settings} showPlayers={showPlayers} onChange={(v) => setResult(m.id, v)} />
              </div>
            ))}
          </div>
          <p className="muted small">Platzierungsspiel auf {court}: {FINALS.find((f) => f.court === court)?.label} ab {tl.finals.from} Uhr</p>
          <button className="btn btn-ghost" onClick={() => print({ kind: 'court', court })}>
            <Icon name="print" /> Court-Plan {court} drucken (DIN A4)
          </button>
        </>
      )}

      {view === 'teams' && <TeamView teamId={teamSel} setTeamId={setTeamSel} results={results} manualTies={manualTies} />}
    </div>
  );
}

function TeamView({ teamId, setTeamId, results, manualTies }) {
  const { teams, byId, tl } = useContext(Data);
  const st = computeStandings(results, { manualTies, teams });
  const row = st.rows.find((r) => r.teamId === teamId);
  const matches = SCHEDULE.filter((m) => m.home === teamId || m.away === teamId);
  const team = byId[teamId];
  return (
    <div className="stack">
      <label>
        <span className="label muted">Team wählen</span>
        <select className="text-input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mx-team-card">
        <div>
          <p className="mx-team-title">{team.name}</p>
          <p className="muted">{team.players.join(' & ')}</p>
        </div>
        <div className="mx-team-rank">
          <span className="label muted">Platz</span>
          <span className="num">
            {row.rank}
            {row.tied ? '=' : ''}
          </span>
          <span className="small muted">
            {row.pts} Pkt · {formatDiff(row.diff)}
          </span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="mx-results-table">
          <thead>
            <tr>
              <th scope="col">Runde</th>
              <th scope="col">Zeit</th>
              <th scope="col">Court</th>
              <th scope="col" className="c-team">
                Gegner
              </th>
              <th scope="col">Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const opp = m.home === teamId ? m.away : m.home;
              const r = results[m.id];
              const done = isConfirmedGroup(r);
              const own = done ? (m.home === teamId ? r.a : r.b) : null;
              const other = done ? (m.home === teamId ? r.b : r.a) : null;
              return (
                <tr key={m.id}>
                  <td className="num">{m.round}</td>
                  <td className="num">{tl.rounds[m.round - 1].from}</td>
                  <td>{m.court}</td>
                  <td className="c-team">
                    <span className="team-name">{byId[opp].name}</span>
                    <span className="players">{byId[opp].players.join(' & ')}</span>
                  </td>
                  <td className={`num ${done ? (own > other ? 'mx-win' : own < other ? 'mx-loss' : '') : 'muted'}`}>{done ? `${own}:${other}` : 'offen'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupMatchCard({ match, result, settings, showPlayers, onChange }) {
  const readOnly = useContext(ReadOnly);
  const { byId } = useContext(Data);
  const status = groupMatchStatus(match, result, settings);
  if (readOnly) return <ViewMatchCard court={match.court} home={match.home} away={match.away} result={isConfirmedGroup(result) ? result : null} status={status} showPlayers={showPlayers} />;
  const confirmed = isConfirmedGroup(result);
  const a = result?.a ?? null;
  const b = result?.b ?? null;
  const v = validateGroupScore(a, b, false);
  const total = (a ?? 0) + (b ?? 0);
  const set = (patch) => onChange({ a, b, suggested: result?.suggested ?? null, confirmed: false, short: false, ...patch });

  return (
    <article className={`match status-${status}`}>
      <header className="match-head">
        <CourtBadge court={match.court} />
        <StatusChip status={status} />
      </header>
      <div className="match-body">
        <TeamScore id={match.home} value={a} showPlayers={showPlayers} locked={confirmed} max={groupStepperMax(result, 'a')} onChange={(n) => set(applyGroupScoreChange(result, 'a', n))} winner={confirmed && a > b} />
        <TeamScore id={match.away} value={b} showPlayers={showPlayers} locked={confirmed} max={groupStepperMax(result, 'b')} onChange={(n) => set(applyGroupScoreChange(result, 'b', n))} winner={confirmed && b > a} />
      </div>
      <footer className="match-foot">
        {confirmed ? (
          <>
            <span className="muted">
              {a === b ? 'Unentschieden · je 1 Punkt' : `${byId[a > b ? match.home : match.away].name} +2 Punkte`}
              {result.short && ' · Abbruch (Zeit)'}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => onChange({ a, b, confirmed: false, short: false })}>
              Korrigieren
            </button>
          </>
        ) : (
          <>
            <span className={`hint ${a != null && b != null && !v.ok && !v.needsShort ? 'is-error' : ''}`}>
              {a == null && b == null ? `Games eintragen (${GROUP_GAMES} insgesamt)` : v.ok ? `${total} von ${GROUP_GAMES} Games` : v.error}
            </span>
            <div className="btn-row tight">
              {(a != null || b != null) && (
                <button className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
                  Leeren
                </button>
              )}
              {v.needsShort && a != null && b != null ? (
                <button className="btn btn-warn btn-sm" onClick={() => onChange({ a, b, confirmed: true, short: true })}>
                  Abbruch bestätigen
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={!v.ok} onClick={() => onChange({ a, b, confirmed: true, short: false })}>
                  Bestätigen
                </button>
              )}
            </div>
          </>
        )}
      </footer>
    </article>
  );
}

function TeamScore({ id, value, showPlayers, locked, max, onChange, winner, extra }) {
  const { byId } = useContext(Data);
  const team = byId[id];
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
  const limited = Number.isFinite(max);
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
      <button className="step" onClick={() => onChange(v == null ? 1 : v + 1)} disabled={limited && v != null && v >= max} aria-label={`${label}: ein Game mehr`}>
        +
      </button>
    </div>
  );
}

/* ---------------- Tabelle ---------------- */

function Standings({ results, manualTies, setManualTie, showPlayers }) {
  const readOnly = useContext(ReadOnly);
  const { teams, byId } = useContext(Data);
  const lastWithResults = useMemo(() => {
    let r = 1;
    for (const m of SCHEDULE) if (isConfirmedGroup(results[m.id])) r = Math.max(r, m.round);
    return r;
  }, [results]);
  const [sel, setSel] = useState(null);
  const shown = sel ?? lastWithResults;
  const st = computeStandings(results, { upToRound: shown, manualTies, teams });
  const roundDone = SCHEDULE.filter((m) => m.round <= shown).every((m) => isConfirmedGroup(results[m.id]));

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Live-Tabelle</h2>
        <p className="muted">Sieg 2 · Unentschieden 1 · Niederlage 0 Punkte</p>
      </div>
      <div className="seg" role="tablist" aria-label="Tabellenstand nach Runde">
        {ROUND_LIST.map((r) => (
          <button key={r} role="tab" aria-selected={shown === r} className={`seg-btn ${shown === r ? 'is-active' : ''}`} onClick={() => setSel(r)}>
            R{r}
          </button>
        ))}
      </div>
      <p className="muted small">
        Stand nach Runde {shown}: {st.confirmedCount} von {shown * MATCHES_PER_ROUND} Matches abgeschlossen
        {!roundDone && ' · noch nicht vollständig'}
        {sel == null && ' · live'}
      </p>
      <StandingsTable rows={st.rows} showPlayers={showPlayers} />
      <p className="legend muted small">Reihenfolge: Punkte → Game-Differenz → gewonnene Games → direkter Vergleich → Entscheidung der Turnierleitung.</p>

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
      {readOnly && st.unresolved.length > 0 && <p className="alert">Gleichstand nach allen Kriterien – die Turnierleitung legt die Reihenfolge fest.</p>}
      {!readOnly && st.unresolved.map((g) => <TieDecision key={g.key} group={g} rows={st.rows} byId={byId} onSave={(ids) => setManualTie(g.key, ids)} />)}
      {!readOnly &&
        [...new Set(st.rows.filter((r) => r.decidedBy === 'manual').map((r) => r.tieKey))].map((key) => (
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

function StandingsTable({ rows, showPlayers, compact = false }) {
  return (
    <div className="table-scroll">
      <table className={`standings mx-standings ${compact ? 'is-compact' : ''}`}>
        <thead>
          <tr>
            <th className="c-rank" scope="col">
              Pl.
            </th>
            <th className="c-team" scope="col">
              Team
            </th>
            <th scope="col" title="Absolvierte Matches">
              Sp
            </th>
            <th scope="col" title="Siege">
              S
            </th>
            <th scope="col" title="Unentschieden">
              U
            </th>
            <th scope="col" title="Niederlagen">
              N
            </th>
            <th scope="col" title="Gewonnene Games">
              G+
            </th>
            <th scope="col" title="Verlorene Games">
              G−
            </th>
            <th scope="col" title="Game-Differenz">
              Diff
            </th>
            <th scope="col" className="c-pts" title="Tabellenpunkte">
              Pkt
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamId} className={`mx-pos-${r.position} ${r.tied ? 'is-tied' : ''}`}>
              <td className="c-rank num">
                <span className={`rank-pill mx-rank-${r.position}`}>
                  {r.rank}
                  {r.tied ? '=' : ''}
                </span>
              </td>
              <td className="c-team">
                <span className="team-name">{r.team.name}</span>
                {showPlayers && <span className="players">{r.team.players.join(' & ')}</span>}
                {r.decidedBy === 'h2h' && <span className="tag">dir. Vergleich</span>}
                {r.decidedBy === 'manual' && <span className="tag">Turnierleitung</span>}
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
  );
}

function TieDecision({ group, rows, byId, onSave }) {
  const [order, setOrder] = useState(group.ids);
  const firstPos = rows.find((r) => group.ids.includes(r.teamId)).position;
  const move = (i, d) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  return (
    <section className="tie-box">
      <h3 className="tie-title">Gleichstand – Entscheidung der Turnierleitung</h3>
      <p className="small">Nach allen Kriterien gleichauf. Reihenfolge festlegen (z. B. Losentscheid oder Golden-Point-Duell):</p>
      <ol className="tie-list">
        {order.map((id, i) => (
          <li key={id}>
            <span className="num tie-pos">{firstPos + i}.</span>
            <span className="team-name">{byId[id].name}</span>
            <span className="tie-btns">
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${byId[id].name} nach oben`}>
                ↑
              </button>
              <button className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`${byId[id].name} nach unten`}>
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

/* ---------------- Platzierungsspiele ---------------- */

function Finals({ results, finals, manualTies, settings, setFinal, setSetting, showPlayers, setTab, timer, setTimer, now }) {
  const readOnly = useContext(ReadOnly);
  const { teams, byId, tl } = useContext(Data);
  const ranking = finalRanking(results, finals, manualTies, settings, { teams });
  const fp = ranking.pairings;
  const progress = groupProgress(results);
  const skipped = ranking.skipped;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Platzierungsspiele</h2>
        <p className="muted">
          Optional, ab ca. {tl.finals.from} Uhr · Spielmodus nach Restzeit (Satz, feste Anzahl Games oder auf Zeit) · keine Game-Begrenzung · Sieger bestätigt die Turnierleitung
        </p>
      </div>

      {!readOnly && (
        <section className="stack">
          <SectionHead title="Finden Platzierungsspiele statt?" />
          <div className="seg" role="tablist" aria-label="Platzierungsspiele">
            <button role="tab" aria-selected={!skipped} className={`seg-btn ${!skipped ? 'is-active' : ''}`} onClick={() => setSetting('finalsMode', { mode: 'play' })}>
              Ja, spielen
            </button>
            <button role="tab" aria-selected={skipped} className={`seg-btn ${skipped ? 'is-active' : ''}`} onClick={() => setSetting('finalsMode', { mode: 'skip' })}>
              Überspringen
            </button>
          </div>
          {skipped && <p className="muted small">Ohne Platzierungsspiele zählt die Abschlusstabelle der Vorrunde als Endergebnis.</p>}
        </section>
      )}
      {readOnly && skipped && <p className="alert">Die Platzierungsspiele entfallen – es zählt die Abschlusstabelle der Vorrunde.</p>}

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
                <span className="muted">
                  {' '}
                  · Platz {f.places[0]} gegen Platz {f.places[1]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {fp.unlocked && !skipped && (
        <div className="match-list mx-match-list">
          {FINALS.map((f) => (
            <FinalMatchCard key={f.id} final={f} pairing={fp.pairings[f.id]} stored={finals[f.id]} showPlayers={showPlayers} onChange={(v) => setFinal(f.id, v)} />
          ))}
        </div>
      )}

      {fp.unlocked && (
        <section className="stack">
          <SectionHead title="Endgültige Platzierungen" note={ranking.complete ? 'Stehen fest' : 'Wird mit jedem abgeschlossenen Spiel ergänzt'} />
          <ol className="final-list">
            {ranking.places.map((p) => (
              <li key={p.place} className={`place-${p.place}`}>
                <span className="num final-place">{p.place}.</span>
                {p.decided ? <span className="team-name">{byId[p.teamId].name}</span> : <span className="muted">{p.candidates.map((id) => byId[id].name).join(' / ')}</span>}
                {p.decided && p.by === 'table' && !skipped && <span className="tag">nach Tabelle</span>}
              </li>
            ))}
          </ol>
          {ranking.complete && (
            <button className="btn btn-ball btn-block" onClick={() => setTab('ergebnis')}>
              Zum Turnierergebnis
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function FinalMatchCard({ final, pairing, stored, showPlayers, onChange }) {
  const readOnly = useContext(ReadOnly);
  const { byId } = useContext(Data);
  const st = finalMatchState(pairing, stored);
  const { teamA, teamB } = pairing;

  if (readOnly) {
    const done = st.status === 'done';
    return (
      <ViewMatchCard
        court={final.court}
        label={final.label}
        home={teamA}
        away={teamB}
        result={done ? { a: st.a, b: st.b } : null}
        winner={done ? st.winner : null}
        manualWinner={done && st.a === st.b ? st.winner : null}
        status={st.status === 'stale' ? 'open' : st.status}
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
            {byId[st.stored.teamA].name} {st.stored.a ?? '–'}:{st.stored.b ?? '–'} {byId[st.stored.teamB].name}
          </strong>{' '}
          gehört nicht zu {byId[teamA].name} gegen {byId[teamB].name} und wird nicht gewertet.
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
  const done = st.status === 'done';
  const v = st.validation;
  const base = { teamA, teamB, a, b, winner: st.manualWinner ?? null, started: true, confirmed: false };
  const set = (patch) => onChange({ ...base, ...patch });
  const isDraw = a != null && b != null && a === b;

  return (
    <article className={`match match-final final-${final.id} status-${st.status}`}>
      <header className="match-head">
        <CourtBadge court={final.court} />
        <span className="final-label">{final.label}</span>
        <StatusChip status={st.status} />
      </header>
      <p className="final-sub muted small">
        Platz {final.places[0]} gegen Platz {final.places[1]} der Vorrunde
      </p>
      <div className="match-body">
        <TeamScore id={teamA} value={a} showPlayers={showPlayers} locked={done} max={Infinity} onChange={(n) => set({ a: n, winner: null })} winner={done && st.winner === teamA} extra={done && isDraw && st.winner === teamA ? <span className="tag">Sieger festgelegt</span> : null} />
        <TeamScore id={teamB} value={b} showPlayers={showPlayers} locked={done} max={Infinity} onChange={(n) => set({ b: n, winner: null })} winner={done && st.winner === teamB} extra={done && isDraw && st.winner === teamB ? <span className="tag">Sieger festgelegt</span> : null} />
      </div>

      {!done && isDraw && (
        <div className="golden">
          <p className="golden-title">Gleichstand – Sieger festlegen</p>
          <div className="golden-btns">
            {[teamA, teamB].map((id) => (
              <button key={id} className={`btn btn-sm ${st.manualWinner === id ? 'btn-ball' : 'btn-ghost'}`} aria-pressed={st.manualWinner === id} onClick={() => set({ winner: id })}>
                {byId[id].name}
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="match-foot">
        {done ? (
          <>
            <span className="muted">Sieger: {byId[st.winner].name}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onChange({ ...stored, confirmed: false })}>
              Korrigieren
            </button>
          </>
        ) : st.status === 'open' ? (
          <>
            <span className="hint">Noch nicht gestartet</span>
            <button className="btn btn-primary btn-sm" onClick={() => onChange({ teamA, teamB, a: null, b: null, winner: null, started: true, confirmed: false })}>
              Spiel starten
            </button>
          </>
        ) : (
          <>
            <span className={`hint ${a != null && b != null && !v?.ok && !v?.needsWinner ? 'is-error' : ''}`}>{a == null && b == null ? 'Läuft – Spielstand eintragen' : v?.ok ? `${a}:${b}` : v?.error}</span>
            <div className="btn-row tight">
              <button className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
                Zurücksetzen
              </button>
              <button className="btn btn-primary btn-sm" disabled={!v?.ok} onClick={() => set({ confirmed: true, winner: isDraw ? st.manualWinner : null })}>
                Beenden & bestätigen
              </button>
            </div>
          </>
        )}
      </footer>
    </article>
  );
}

/* ---------------- Turnierergebnis ---------------- */

function Result({ results, finals, manualTies, settings, showPlayers, setTab, print }) {
  const { teams, byId, tl } = useContext(Data);
  const ranking = finalRanking(results, finals, manualTies, settings, { teams });
  const st = computeStandings(results, { manualTies, teams });

  return (
    <div className="stack-lg awards">
      <div className="page-head center">
        <p className="eyebrow">
          {TOURNAMENT.dateLabel} · {TOURNAMENT.venue}
        </p>
        <h2 className="page-title">Turnierergebnis</h2>
      </div>

      {!ranking.complete ? (
        <section className="locked">
          <Icon name="medal" />
          <div>
            <p className="locked-title">Noch nicht entschieden</p>
            <p>Das Ergebnis steht fest, sobald alle Platzierungsspiele abgeschlossen sind – oder die Turnierleitung sie überspringt bzw. das Turnier abschließt (dann zählt für offene Paare die Tabelle).</p>
            <button className="btn btn-primary" onClick={() => setTab('finale')}>
              Zu den Platzierungsspielen
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="mx-winner">
            <p className="label">Turniersieger</p>
            <p className="mx-winner-name">{byId[ranking.places[0].teamId].name}</p>
            <p className="muted">{byId[ranking.places[0].teamId].players.join(' & ')}</p>
          </div>
          <div className="podium">
            {[2, 1, 3].map((p) => {
              const t = byId[ranking.places[p - 1].teamId];
              return (
                <div key={p} className={`podium-col podium-${p}`}>
                  <div className="podium-team">
                    <Medal place={p} />
                    <span className="podium-name">{t.name}</span>
                    <span className="players">{t.players.join(' & ')}</span>
                  </div>
                  <div className="podium-block">
                    <span className="num">{p}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <ol className="final-list rest">
            {ranking.places.slice(3).map((p) => (
              <li key={p.place}>
                <span className="num final-place">{p.place}.</span>
                <span className="team-name">{byId[p.teamId].name}</span>
                {showPlayers && <span className="players">{byId[p.teamId].players.join(' & ')}</span>}
              </li>
            ))}
          </ol>
          {ranking.skipped && <p className="muted small center">Ohne Platzierungsspiele – Endstand nach der Abschlusstabelle der Vorrunde.</p>}
        </>
      )}

      <section className="stack">
        <SectionHead title="Abschlusstabelle Vorrunde" />
        <StandingsTable rows={st.rows} showPlayers={false} />
      </section>

      <section className="stack">
        <SectionHead title="Alle Ergebnisse" />
        <div className="table-scroll">
          <table className="mx-results-table">
            <thead>
              <tr>
                <th scope="col">R</th>
                <th scope="col">Court</th>
                <th scope="col" className="c-team">
                  Begegnung
                </th>
                <th scope="col">Erg.</th>
              </tr>
            </thead>
            <tbody>
              {SCHEDULE.map((m) => {
                const r = results[m.id];
                const done = isConfirmedGroup(r);
                return (
                  <tr key={m.id}>
                    <td className="num">{m.round}</td>
                    <td>{m.court}</td>
                    <td className="c-team">
                      {byId[m.home].name} – {byId[m.away].name}
                    </td>
                    <td className="num">{done ? `${r.a}:${r.b}` : '–'}</td>
                  </tr>
                );
              })}
              {ranking.pairings.unlocked &&
                !ranking.skipped &&
                FINALS.map((f) => {
                  const p = ranking.pairings.pairings[f.id];
                  const s = finalMatchState(p, finals[f.id]);
                  return (
                    <tr key={f.id} className="mx-final-row">
                      <td>{f.places.join('/')}</td>
                      <td>{f.court}</td>
                      <td className="c-team">
                        {f.label}: {byId[p.teamA].name} – {byId[p.teamB].name}
                      </td>
                      <td className="num">{s.status === 'done' ? `${s.a}:${s.b}` : '–'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="muted small">Platzierungsspiele ab {tl.finals.from} Uhr.</p>
      </section>
      <button className="btn btn-ghost" onClick={() => print({ kind: 'report' })}>
        <Icon name="print" /> Ergebnis drucken
      </button>
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

/* ---------------- Administration ---------------- */

function Admin({ state, settings, setSetting, sync, onExport, onReset, results, finals, manualTies }) {
  const { teams, times, tl } = useContext(Data);
  const closed = !!settings.closed?.at;
  const download = (name, text) => {
    try {
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      /* Download nicht möglich */
    }
  };
  const fr = finalRanking(results, finals, manualTies, settings, { teams });

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Turnierleitung</h2>
        <p className="muted">Nur auf den Geräten der Turnierleitung. Teilnehmer sehen den Link ohne Bearbeitung.</p>
      </div>

      {!inFrame && <SyncPanel sync={sync} />}

      <section className="stack">
        <SectionHead title="Teams bearbeiten" note="Namen und Spieler" />
        {teams.map((t) => (
          <TeamEditor key={t.id} team={t} onSave={(v) => setSetting(`teams/${t.id}`, v)} onResetDefault={() => setSetting(`teams/${t.id}`, null)} isDefault={!settings[`teams/${t.id}`]} />
        ))}
      </section>

      <TimesEditor times={times} tl={tl} onSave={(v) => setSetting('times', v)} onResetDefault={() => setSetting('times', null)} />

      <section className="stack">
        <SectionHead title="Turnier abschließen" note={closed ? 'abgeschlossen' : 'offen'} />
        <p className="small muted">Schließt das Turnier ab: nicht gespielte Platzierungsspiele werden nach der Abschlusstabelle gewertet. Kann rückgängig gemacht werden.</p>
        {closed ? (
          <button className="btn btn-ghost" onClick={() => setSetting('closed', null)}>
            Abschluss aufheben
          </button>
        ) : (
          <button className="btn btn-primary" disabled={!fr.pairings.unlocked} onClick={() => setSetting('closed', { at: Date.now() })}>
            Turnier jetzt abschließen
          </button>
        )}
      </section>

      <section className="stack">
        <SectionHead title="Export" />
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => download('tj-padel-masters-ergebnisse.csv', resultsCsv(state))}>
            <Icon name="share" /> Ergebnisse (CSV)
          </button>
          <button className="btn btn-ghost" onClick={() => download('tj-padel-masters-tabelle.csv', standingsCsv(state))}>
            <Icon name="share" /> Abschlusstabelle (CSV)
          </button>
          <button className="btn btn-ghost" onClick={onExport}>
            <Icon name="share" /> Text / Backup
          </button>
        </div>
      </section>

      <section className="stack">
        <SectionHead title="Zurücksetzen" />
        <button className="btn btn-danger-ghost" onClick={onReset}>
          <Icon name="reset" /> Turnier zurücksetzen
        </button>
      </section>
    </div>
  );
}

function TeamEditor({ team, onSave, onResetDefault, isDefault }) {
  const [name, setName] = useState(team.name);
  const [p1, setP1] = useState(team.players[0]);
  const [p2, setP2] = useState(team.players[1]);
  useEffect(() => {
    setName(team.name);
    setP1(team.players[0]);
    setP2(team.players[1]);
  }, [team.name, team.players[0], team.players[1]]);
  const dirty = name !== team.name || p1 !== team.players[0] || p2 !== team.players[1];
  const nr = team.id.slice(1);
  return (
    <div className="mx-team-edit">
      <span className="mx-team-nr num">{nr}</span>
      <div className="mx-team-fields">
        <input className="text-input" aria-label={`Teamname ${nr}`} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="mx-two">
          <input className="text-input" aria-label={`Spieler 1 Team ${nr}`} value={p1} onChange={(e) => setP1(e.target.value)} />
          <input className="text-input" aria-label={`Spieler 2 Team ${nr}`} value={p2} onChange={(e) => setP2(e.target.value)} />
        </div>
        {(dirty || !isDefault) && (
          <div className="btn-row tight">
            {dirty && (
              <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), players: [p1.trim(), p2.trim()] })}>
                Speichern
              </button>
            )}
            {!isDefault && !dirty && (
              <button className="btn btn-ghost btn-sm" onClick={onResetDefault}>
                Ursprünglichen Namen wiederherstellen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TimesEditor({ times, tl, onSave, onResetDefault }) {
  const [draft, setDraft] = useState(times);
  useEffect(() => setDraft(times), [JSON.stringify(times)]);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setOv = (k, v) => setDraft((d) => ({ ...d, overrides: { ...(d.overrides || {}), [k]: v } }));
  const preview = timeline(draft);
  const valid = isClock(draft.start) && isClock(draft.end) && Number(draft.roundMinutes) > 0 && Object.values(draft.overrides || {}).every((v) => !v || isClock(v));
  const dirty = JSON.stringify(draft) !== JSON.stringify(times);
  const clean = () => ({
    ...draft,
    roundMinutes: Number(draft.roundMinutes),
    pauseMinutes: Number(draft.pauseMinutes),
    evalMinutes: Number(draft.evalMinutes),
    pauseAfterRound: Number(draft.pauseAfterRound),
    overrides: Object.fromEntries(Object.entries(draft.overrides || {}).filter(([, v]) => v && isClock(v))),
  });
  return (
    <section className="stack">
      <SectionHead title="Uhrzeiten" note="Europe/Berlin" />
      <div className="mx-times">
        <label>
          <span className="label muted">Start</span>
          <input className="text-input" type="time" value={draft.start} onChange={(e) => set('start', e.target.value)} />
        </label>
        <label>
          <span className="label muted">Rundendauer (min)</span>
          <input className="text-input" type="number" min="5" max="60" value={draft.roundMinutes} onChange={(e) => set('roundMinutes', e.target.value)} />
        </label>
        <label>
          <span className="label muted">Pause nach Runde</span>
          <input className="text-input" type="number" min="0" max="7" value={draft.pauseAfterRound} onChange={(e) => set('pauseAfterRound', e.target.value)} />
        </label>
        <label>
          <span className="label muted">Pause (min)</span>
          <input className="text-input" type="number" min="0" max="60" value={draft.pauseMinutes} onChange={(e) => set('pauseMinutes', e.target.value)} />
        </label>
        <label>
          <span className="label muted">Auswertung (min)</span>
          <input className="text-input" type="number" min="0" max="30" value={draft.evalMinutes} onChange={(e) => set('evalMinutes', e.target.value)} />
        </label>
        <label>
          <span className="label muted">Turnierende</span>
          <input className="text-input" type="time" value={draft.end} onChange={(e) => set('end', e.target.value)} />
        </label>
      </div>
      <details className="mx-details">
        <summary>Einzelne Startzeiten verschieben</summary>
        <div className="mx-times">
          {ROUND_LIST.map((r) => (
            <label key={r}>
              <span className="label muted">
                Runde {r} (berechnet {timeline({ ...draft, overrides: {} }).rounds[r - 1].from})
              </span>
              <input className="text-input" type="time" value={draft.overrides?.[r] || ''} onChange={(e) => setOv(r, e.target.value)} />
            </label>
          ))}
          <label>
            <span className="label muted">Platzierungsspiele</span>
            <input className="text-input" type="time" value={draft.overrides?.finals || ''} onChange={(e) => setOv('finals', e.target.value)} />
          </label>
        </div>
      </details>
      <p className="small muted">
        Vorschau: Runde 1 {preview.rounds[0].from} · {preview.pause ? `Pause ${preview.pause.from}–${preview.pause.to} · ` : ''}Runde 7 bis {preview.rounds[ROUNDS - 1].to} · Platzierungsspiele ab {preview.finals.from} · Ende {preview.end.from}
      </p>
      <div className="btn-row">
        <button className="btn btn-primary" disabled={!dirty || !valid} onClick={() => onSave(clean())}>
          Uhrzeiten speichern
        </button>
        <button className="btn btn-ghost" onClick={onResetDefault}>
          Standard (11:00–14:00)
        </button>
      </div>
      {!valid && <p className="small error-text">Bitte gültige Uhrzeiten (HH:MM) und Minuten eintragen.</p>}
    </section>
  );
}

function SyncPanel({ sync }) {
  const { config, setConfig, status, syncNow } = sync;
  const [token, setToken] = useState(config.token);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = viewerUrl();
  const connect = async () => {
    setBusy(true);
    setCheck(null);
    try {
      await testConnection({ ...config, token });
      setConfig({ ...config, token: token.trim() });
      setCheck({ ok: true, text: 'Verbunden. Alle Geräte der Turnierleitung gleichen jetzt ab.' });
    } catch (e) {
      setCheck({ ok: false, text: e instanceof TypeError ? 'Keine Verbindung zu GitHub.' : e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="stack">
      <SectionHead title="Live-Abgleich" note={config.token ? { ok: 'verbunden', syncing: 'gleicht ab …', offline: 'kein Netz', error: 'Fehler', off: 'aus' }[status.state] : 'nicht verbunden'} />
      <p className="small">
        Alle Geräte der Turnierleitung speichern in <code>{config.path}</code> (Repository {config.owner}/{config.repo}, Branch <code>{config.branch}</code>). Nur wer den Token hat, kann Ergebnisse ändern.
      </p>
      {config.token && status.error && <p className="alert">{status.error}</p>}
      <label className="small" htmlFor="sync-token">
        GitHub-Token (Fine-grained, nur Repository „{config.repo}“, Contents: Read and write)
      </label>
      <input id="sync-token" className="text-input" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
      {check && <p className={`small ${check.ok ? 'ok-text' : 'error-text'}`}>{check.text}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" disabled={!token.trim() || busy} onClick={connect}>
          {busy ? 'Prüfe …' : config.token ? 'Token speichern' : 'Verbinden'}
        </button>
        {config.token && (
          <>
            <button className="btn btn-ghost" onClick={() => syncNow()}>
              Jetzt abgleichen
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setConfig({ token: '' });
                setToken('');
                setCheck(null);
              }}
            >
              Trennen
            </button>
          </>
        )}
      </div>
      <div className="viewer-link">
        <p className="small">
          <strong>Link für die Teilnehmer</strong> (nur ansehen):
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
        <p className="small muted">Für einen Fernseher: {url}&amp;tv</p>
      </div>
    </section>
  );
}

/* ---------------- TV-/Vollbild-Ansicht ---------------- */

function TvBoard({ results, finals, manualTies, settings, timer, now, sync, online, onExit }) {
  const { teams, byId, tl } = useContext(Data);
  const round = currentRound(results);
  const st = computeStandings(results, { manualTies, teams });
  const ranking = finalRanking(results, finals, manualTies, settings, { teams });
  const day = dayInfo(now, tl);
  const matches =
    round !== 'finals'
      ? SCHEDULE.filter((m) => m.round === round).map((m) => ({ court: m.court, home: m.home, away: m.away, r: isConfirmedGroup(results[m.id]) ? results[m.id] : null }))
      : ranking.pairings.unlocked && !ranking.skipped
        ? FINALS.map((f) => {
            const p = ranking.pairings.pairings[f.id];
            const s = finalMatchState(p, finals[f.id]);
            return { court: f.court, home: p.teamA, away: p.teamB, label: f.label, r: s.status === 'done' ? { a: s.a, b: s.b } : null };
          })
        : [];
  return (
    <div className="mx-tv">
      <header className="mx-tv-head">
        <Logo big />
        <div className="mx-tv-title">
          <h1>{TOURNAMENT.name}</h1>
          <p>
            {TOURNAMENT.dateLabel} · {TOURNAMENT.venue} · {day.text}
          </p>
        </div>
        <div className="mx-tv-clock">
          <span className="label">{timer ? phaseLabel(timer) : round === 'finals' ? 'Platzierungsspiele' : `Runde ${round}`}</span>
          <span className={`num ${timer && timerRemaining(timer, now) === 0 ? 'is-over' : ''}`}>{timer ? fmtMs(timerRemaining(timer, now)) : '--:--'}</span>
        </div>
        <SyncBadge status={sync.status} online={online} label="Live" onClick={sync.refresh} />
        <button className="btn btn-ghost btn-sm mx-tv-exit" onClick={onExit}>
          Schließen
        </button>
      </header>
      <div className="mx-tv-grid">
        <section>
          <h2 className="mx-tv-h">{round === 'finals' ? 'Platzierungsspiele' : `Runde ${round} · ${tl.rounds[round - 1].from}–${tl.rounds[round - 1].to}`}</h2>
          <div className="mx-tv-matches">
            {matches.map((m) => (
              <div key={m.court} className={`mx-tv-match ${m.r ? 'is-done' : ''}`}>
                <span className="mx-tv-court">{m.court}</span>
                {m.label && <span className="mx-tv-label">{m.label}</span>}
                <span className="mx-tv-team">
                  {byId[m.home].name}
                  <b className="num">{m.r ? m.r.a : ''}</b>
                </span>
                <span className="mx-tv-team">
                  {byId[m.away].name}
                  <b className="num">{m.r ? m.r.b : ''}</b>
                </span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mx-tv-h">Live-Tabelle</h2>
          <StandingsTable rows={st.rows} showPlayers={false} compact />
        </section>
      </div>
    </div>
  );
}

/* ---------------- Druck ---------------- */

function PrintArea({ job, state }) {
  const { byId, tl } = useContext(Data);
  const results = state.results || {};
  if (!job || job.kind === 'report') return <pre>{exportText(state)}</pre>;
  const list = job.kind === 'court' ? SCHEDULE.filter((m) => m.court === job.court) : SCHEDULE;
  const fin = job.kind === 'court' ? FINALS.filter((f) => f.court === job.court) : FINALS;
  return (
    <div className="mx-print-sheet">
      <h1>
        {TOURNAMENT.name} – {job.kind === 'court' ? `Court ${job.court}` : 'Spielplan'}
      </h1>
      <p>
        {TOURNAMENT.dateLabel} · {TOURNAMENT.venue}
      </p>
      <table>
        <thead>
          <tr>
            <th>Runde</th>
            <th>Zeit</th>
            {job.kind !== 'court' && <th>Court</th>}
            <th>Team A</th>
            <th>Team B</th>
            <th>Ergebnis</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => {
            const r = results[m.id];
            return (
              <tr key={m.id}>
                <td>{m.round}</td>
                <td>
                  {tl.rounds[m.round - 1].from}–{tl.rounds[m.round - 1].to}
                </td>
                {job.kind !== 'court' && <td>{m.court}</td>}
                <td>
                  <strong>{byId[m.home].name}</strong>
                  <br />
                  {byId[m.home].players.join(' & ')}
                </td>
                <td>
                  <strong>{byId[m.away].name}</strong>
                  <br />
                  {byId[m.away].players.join(' & ')}
                </td>
                <td className="mx-print-score">{isConfirmedGroup(r) ? `${r.a} : ${r.b}` : '___ : ___'}</td>
              </tr>
            );
          })}
          {fin.map((f) => (
            <tr key={f.id}>
              <td colSpan={job.kind !== 'court' ? 3 : 2}>
                {f.label} · ab {tl.finals.from}
                {job.kind !== 'court' ? ` · ${f.court}` : ''}
              </td>
              <td>Platz {f.places[0]}</td>
              <td>Platz {f.places[1]}</td>
              <td className="mx-print-score">___ : ___</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tl.pause && <p>Gemeinsame Pause {tl.pause.from}–{tl.pause.to} Uhr · Pro Match 8 Games · Golden Point bei 40:40</p>}
    </div>
  );
}

/* ---------------- Export & Zurücksetzen ---------------- */

function ExportSheet({ state, onClose, onRestore }) {
  const [mode, setMode] = useState('text');
  const [copied, setCopied] = useState(false);
  const [restoreText, setRestoreText] = useState('');
  const [restoreMsg, setRestoreMsg] = useState(null);
  const ref = useRef(null);
  const text = mode === 'text' ? exportText(state) : JSON.stringify(pickShared(state), null, 1);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      ref.current?.select();
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
      <textarea ref={ref} className="export-text" readOnly value={text} rows={12} onFocus={(e) => e.target.select()} />
      <button className="btn btn-primary" onClick={copy}>
        {copied ? 'Kopiert ✓' : 'Kopieren'}
      </button>
      {mode === 'json' && (
        <div className="stack">
          <label className="small" htmlFor="restore-text">
            Backup wiederherstellen (ersetzt alle aktuellen Daten):
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
      <p>Alle Ergebnisse, Platzierungsspiele, Timer und manuellen Entscheidungen werden gelöscht – auf allen verbundenen Geräten. Teamnamen und Uhrzeiten bleiben erhalten.</p>
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

/* ---------------- Kleinteile ---------------- */

// Grün = Internet und Abgleich in Ordnung, rot = keine Verbindung (oder Abgleich-Fehler).
function SyncBadge({ status, online, label, onClick }) {
  const down = !online || status.state === 'offline';
  const text = down ? 'Kein Netz' : label || { off: 'Lokal', syncing: 'Sync …', ok: 'Sync', error: 'Sync-Fehler' }[status.state];
  const tone = down || status.state === 'error' ? 'down' : 'up';
  return (
    <button className={`sync-badge sync-${status.state} mx-conn-${tone}`} onClick={onClick} aria-label={`Abgleich: ${text}`}>
      <span className="sync-dot" aria-hidden="true" />
      {text}
    </button>
  );
}

function ViewMatchCard({ court, label, home, away, result, winner, manualWinner, status, showPlayers }) {
  const { byId } = useContext(Data);
  const done = !!result;
  const a = done ? result.a : null;
  const b = done ? result.b : null;
  const win = winner ?? (done && a !== b ? (a > b ? home : away) : null);
  return (
    <article className={`match status-${status}`}>
      <header className="match-head">
        <CourtBadge court={court} />
        {label && <span className="final-label">{label}</span>}
        <StatusChip status={status} />
      </header>
      <div className="match-body">
        {[
          [home, a],
          [away, b],
        ].map(([id, score]) => (
          <div key={id} className={`team-score ${win === id ? 'is-winner' : ''}`}>
            <div className="team-score-name">
              <span className="team-name">{byId[id].name}</span>
              {showPlayers && <span className="players">{byId[id].players.join(' & ')}</span>}
              {manualWinner === id && <span className="tag">Sieger festgelegt</span>}
            </div>
            <span className="score-locked num">{score ?? '–'}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

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
    </span>
  );
}

function StatusChip({ status }) {
  const label = { open: 'Offen', running: 'Läuft', done: 'Abgeschlossen', stale: 'Veraltet', locked: 'Gesperrt' }[status] || 'Offen';
  const cls = { open: 'open', running: 'entered', done: 'done' }[status] || 'open';
  return <span className={`chip chip-${cls}`}>{label}</span>;
}

function Logo({ big = false }) {
  return (
    <svg className={`ball-mark mx-logo ${big ? 'is-big' : ''}`} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" className="mx-logo-ring" />
      <circle cx="16" cy="16" r="12" className="ball-fill" />
      <path d="M7 10c5 3 5 9 0 12M25 10c-5 3-5 9 0 12" className="ball-seam" />
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
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
    check: 'M5 12l5 5L19 7',
    x: 'M6 6l12 12M18 6 6 18',
    share: 'M12 4v12M7 9l5-5 5 5M5 14v6h14v-6',
    reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
    print: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z',
    tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export { DEFAULT_TIMES, DEFAULT_TEAMS };
