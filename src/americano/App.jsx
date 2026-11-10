import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  TITLE,
  POINTS_PER_MATCH,
  ROUND_MINUTES,
  START_TIME,
  PLAYERS,
  ROUNDS,
  REGULAR_ROUNDS,
  roundTime,
  validateSchedule,
  validateScore,
  isConfirmed,
  computeRanking,
  gamesPerPlayer,
  currentRound,
  progress,
  formatAverage,
  signed,
  exportText,
} from './data.js';
import { applyChange, clearAll, pickShared, useViewerFeed } from '../sync.js';
import { useAmericanoSync, AMERICANO_FILE } from './sync.js';

const ROUND_MS = ROUND_MINUTES * 60 * 1000;
const STORE_KEY = 'padel-americano';
const VIEW_STORE_KEY = 'padel-americano-ansicht';
const ReadOnly = createContext(false);

const TABS = [
  { id: 'start', label: 'Übersicht', icon: 'home' },
  { id: 'spielplan', label: 'Spielplan', icon: 'grid' },
  { id: 'rangliste', label: 'Rangliste', icon: 'table' },
  { id: 'sieger', label: 'Sieger', icon: 'medal' },
];

const initialState = () => ({
  results: {},
  finals: {},
  manualTies: {},
  stamps: {},
  timer: { running: false, endsAt: null, remaining: ROUND_MS },
});

function useStore(key) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initialState(), ...JSON.parse(raw) } : initialState();
    } catch {
      return initialState();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, [key, state]);
  return [state, setState];
}

function readHash() {
  const h = location.hash.replace('#', '');
  return TABS.some((t) => t.id === h) ? h : 'start';
}

const team = (players) => players.join(' + ');
const viewerUrl = () => `${location.origin}${location.pathname}?ansicht`;

export default function App({ readOnly = false }) {
  const [state, setState] = useStore(readOnly ? VIEW_STORE_KEY : STORE_KEY);
  const [tab, setTabState] = useState(readHash);
  const [planRound, setPlanRound] = useState(null);
  const [sheet, setSheet] = useState(null);
  const online = useOnline();
  // readOnly ändert sich während der Laufzeit nie, daher ist der bedingte Hook-Aufruf stabil.
  const sync = readOnly ? useViewerFeed(setState, AMERICANO_FILE) : useAmericanoSync(state, setState);

  useEffect(() => {
    const onHash = () => setTabState(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setTab = (id) => {
    setTabState(id);
    try {
      history.replaceState(null, '', `${location.search}#${id}`);
    } catch {
      /* ignorieren */
    }
    window.scrollTo(0, 0);
  };

  const results = state.results;
  const setResult = (id, value) => setState((s) => ({ ...s, ...applyChange(pickShared(s), 'results', id, value) }));
  const round = currentRound(results);
  const openPlan = (r) => {
    setPlanRound(r);
    setTab('spielplan');
  };

  return (
    <ReadOnly.Provider value={readOnly}>
      <div className="app americano">
        <header className="topbar">
          <div className="topbar-inner">
            <button className="brand" onClick={() => setTab('start')} aria-label="Zur Übersicht">
              <BallMark />
              <span className="brand-text">
                <span className="brand-name">{TITLE}</span>
                <span className="brand-sub">
                  {REGULAR_ROUNDS} Runden · {POINTS_PER_MATCH} Punkte · ab {START_TIME}
                </span>
              </span>
            </button>
            {readOnly ? (
              <SyncBadge status={sync.status} online={online} label="Live" onClick={sync.refresh} />
            ) : (
              <SyncBadge status={sync.status} online={online} onClick={() => setSheet('sync')} />
            )}
          </div>
        </header>

        <main className="wrap main">
          {tab === 'start' && (
            <Dashboard
              state={state}
              setState={setState}
              round={round}
              openPlan={openPlan}
              setTab={setTab}
              onSync={() => setSheet('sync')}
              onExport={() => setSheet('export')}
              onReset={() => setSheet('reset')}
              synced={!!sync.token}
            />
          )}
          {tab === 'spielplan' && <Schedule results={results} setResult={setResult} round={round} planRound={planRound} setPlanRound={setPlanRound} />}
          {tab === 'rangliste' && <Ranking results={results} />}
          {tab === 'sieger' && <Winners results={results} setTab={setTab} />}
        </main>

        <nav className="tabbar" aria-label="Bereiche">
          <div className="tabbar-inner americano-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                <Icon name={t.icon} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {sheet === 'sync' && <SyncSheet sync={sync} onClose={() => setSheet(null)} />}
        {sheet === 'export' && <ExportSheet results={results} onClose={() => setSheet(null)} />}
        {sheet === 'reset' && (
          <ResetDialog
            onCancel={() => setSheet(null)}
            onConfirm={() => {
              setState((s) => ({ ...initialState(), ...clearAll(pickShared(s)) }));
              setSheet(null);
              setTab('start');
            }}
          />
        )}
      </div>
    </ReadOnly.Provider>
  );
}

/* ---------------- Übersicht ---------------- */

function Dashboard({ state, setState, round, openPlan, setTab, onSync, onExport, onReset, synced }) {
  const readOnly = useContext(ReadOnly);
  const results = state.results;
  const prog = progress(results);
  const schedule = useMemo(() => validateSchedule(), []);
  const games = useMemo(() => gamesPerPlayer(ROUNDS.filter((r) => !r.bonus)), []);
  const current = round === 'done' ? null : ROUNDS.find((r) => (round === 'bonus' ? r.bonus : r.round === round));

  return (
    <div className="stack-lg">
      <section className="hero">
        <div className="hero-court" aria-hidden="true" />
        <div className="hero-body">
          <p className="eyebrow">Americano · Partner wechseln jede Runde</p>
          <h1 className="hero-title">{TITLE}</h1>
          <div className="hero-now">
            <div>
              <p className="label">Aktuell</p>
              <p className="hero-round">{current ? current.label : 'Fertig'}</p>
              <p className="hero-sub">
                {current ? `${current.bonus ? 'falls noch Zeit bleibt · ' : `von ${REGULAR_ROUNDS} · `}${roundTime(current.round)} Uhr` : 'Alle Runden gespielt'}
              </p>
            </div>
            <div className="hero-progress">
              <p className="label">Matches</p>
              <p className="hero-count">
                <span className="num">{prog.confirmed}</span>
                <span className="of">/{prog.total}</span>
              </p>
              <p className="hero-sub">bestätigt</p>
            </div>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.confirmed}>
            <div className="bar-fill" style={{ width: `${(prog.confirmed / prog.total) * 100}%` }} />
          </div>
          {readOnly || !current ? (
            <button className="btn btn-ball btn-block" onClick={() => setTab('rangliste')}>
              Zur Rangliste
            </button>
          ) : (
            <button className="btn btn-ball btn-block" onClick={() => openPlan(current.bonus ? 'bonus' : current.round)}>
              Punkte {current.label} eintragen
            </button>
          )}
        </div>
      </section>

      {current && (
        <section className="stack">
          <SectionHead title={`Courts · ${current.label}`} note={`${roundTime(current.round)} Uhr`} />
          <div className="court-row am-court-row">
            {current.matches.map((m) => (
              <CourtTile key={m.id} match={m} result={results[m.id]} onClick={() => openPlan(current.bonus ? 'bonus' : current.round)} />
            ))}
          </div>
          <PauseLine pause={current.pause} />
        </section>
      )}

      {!readOnly && current && <RoundTimer timer={state.timer} label={current.label} onChange={(timer) => setState((s) => ({ ...s, timer }))} />}

      <section className="stack">
        <SectionHead title="Spieler" note="Matches ohne Bonusrunde" />
        <ul className="team-list am-players">
          {PLAYERS.map((p) => (
            <li key={p}>
              <span className="team-name">{p}</span>
              <span className="team-players">{games[p]} Matches</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Wertung: Punkte werden einzeln gesammelt. Weil nicht alle gleich viele Matches spielen, zählt der Durchschnitt pro Match.</p>
      </section>

      {!readOnly && (
        <section className="stack">
          <SectionHead title="Spielplanprüfung" note={schedule.ok ? 'Alles in Ordnung' : 'Fehler gefunden'} />
          <ul className="checks">
            {schedule.checks.map((c) => (
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

      {!readOnly && (
        <section className="stack">
          <SectionHead title="Verwaltung" note={synced ? 'Wird mit den anderen Geräten abgeglichen' : 'Wird auf diesem Gerät gespeichert'} />
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={onSync}>
              <Icon name="sync" /> {synced ? 'Abgleich' : 'Geräte verbinden'}
            </button>
            <button className="btn btn-ghost" onClick={onExport}>
              <Icon name="share" /> Exportieren
            </button>
            <button className="btn btn-danger-ghost" onClick={onReset}>
              <Icon name="reset" /> Turnier zurücksetzen
            </button>
          </div>
          {synced && <ViewerLink />}
        </section>
      )}
    </div>
  );
}

function PauseLine({ pause }) {
  return (
    <p className="am-pause">
      <span className="am-pause-label">Pause</span>
      <span>{pause.join(', ')}</span>
    </p>
  );
}

function CourtTile({ match, result, onClick }) {
  const status = matchStatus(result);
  return (
    <button className={`court-tile status-${status}`} onClick={onClick}>
      <span className="court-tile-head">
        <CourtBadge court={match.court} />
        <StatusChip status={status} />
      </span>
      <span className="court-tile-teams">
        <span className="tile-team">
          <span className="tile-team-name">{team(match.team1)}</span>
          <span className="tile-score num">{status === 'open' ? '–' : result.a}</span>
        </span>
        <span className="tile-team">
          <span className="tile-team-name">{team(match.team2)}</span>
          <span className="tile-score num">{status === 'open' ? '–' : result.b}</span>
        </span>
      </span>
    </button>
  );
}

/* ---------------- Rundenuhr ---------------- */

function RoundTimer({ timer, label, onChange }) {
  const [now, setNow] = useState(Date.now());
  const beeped = useRef(false);
  const audio = useRef(null);
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
    }
  }, [timer.running, remaining]);

  const start = () => {
    try {
      audio.current = audio.current || new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      audio.current = null;
    }
    beeped.current = remaining === 0;
    setNow(Date.now());
    const left = remaining || ROUND_MS;
    onChange({ running: true, endsAt: Date.now() + left, remaining: left });
  };
  const pause = () => onChange({ running: false, endsAt: null, remaining });
  const reset = () => {
    beeped.current = false;
    onChange({ running: false, endsAt: null, remaining: ROUND_MS });
  };

  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
  const over = remaining === 0;

  return (
    <section className={`timer ${over ? 'is-over' : ''} ${timer.running ? 'is-running' : ''}`}>
      <SectionHead title="Rundenuhr" note={`${ROUND_MINUTES} Minuten · ${label}`} />
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
        <div className="bar-fill" style={{ width: `${100 - (remaining / ROUND_MS) * 100}%` }} />
      </div>
      {over && <p className="timer-msg">Zeit abgelaufen – erreichten Punktestand eintragen.</p>}
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
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + offset);
      o.stop(ctx.currentTime + offset + 0.3);
    });
  } catch {
    /* Audio nicht verfügbar */
  }
}

/* ---------------- Spielplan ---------------- */

function Schedule({ results, setResult, round, planRound, setPlanRound }) {
  const fallback = round === 'done' ? 'all' : round;
  const selected = planRound ?? fallback;
  const shown = selected === 'all' ? ROUNDS : ROUNDS.filter((r) => (selected === 'bonus' ? r.bonus : r.round === selected));

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Spielplan</h2>
        <p className="muted">
          {REGULAR_ROUNDS} Runden à max. {ROUND_MINUTES} Minuten · {POINTS_PER_MATCH} Punkte pro Match
        </p>
      </div>
      <div className="seg" role="tablist" aria-label="Runde wählen">
        {ROUNDS.map((r) => {
          const key = r.bonus ? 'bonus' : r.round;
          const done = r.matches.every((m) => isConfirmed(results[m.id]));
          return (
            <button key={key} role="tab" aria-selected={selected === key} className={`seg-btn ${selected === key ? 'is-active' : ''}`} onClick={() => setPlanRound(key)}>
              {r.short}
              {done && <span className="seg-dot" aria-label="abgeschlossen" />}
            </button>
          );
        })}
        <button role="tab" aria-selected={selected === 'all'} className={`seg-btn ${selected === 'all' ? 'is-active' : ''}`} onClick={() => setPlanRound('all')}>
          Alle
        </button>
      </div>

      {shown.map((r, idx) => (
        <section key={r.label} className="stack">
          <div className="round-head">
            <h3 className="round-title">{r.label}</h3>
            <span className="round-time num">{roundTime(r.round)} Uhr</span>
            <span className="round-count muted">{r.matches.filter((m) => isConfirmed(results[m.id])).length}/2 bestätigt</span>
          </div>
          {r.bonus && <p className="muted small">Nur falls noch Zeit bleibt. Zählt mit, sobald die Ergebnisse bestätigt sind.</p>}
          <div className="match-list">
            {r.matches.map((m) => (
              <MatchCard key={m.id} match={m} result={results[m.id]} onChange={(v) => setResult(m.id, v)} />
            ))}
          </div>
          <PauseLine pause={r.pause} />
          {selected !== 'all' && idx === 0 && !r.bonus && (
            <button className="btn btn-ghost btn-block" onClick={() => setPlanRound(r.round < REGULAR_ROUNDS ? r.round + 1 : 'bonus')}>
              Weiter zu {r.round < REGULAR_ROUNDS ? `Runde ${r.round + 1}` : 'Bonusrunde'} →
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

function MatchCard({ match, result, onChange }) {
  const readOnly = useContext(ReadOnly);
  const status = matchStatus(result);
  const confirmed = isConfirmed(result);
  const a = result?.a ?? null;
  const b = result?.b ?? null;
  const v = validateScore(a, b);

  // Gegenseite automatisch auf 24 ergänzen, solange sie nicht selbst eingetragen wurde.
  // `auto` merkt sich, welche Seite automatisch gefüllt ist; wer sie anfasst, übernimmt sie.
  const setSide = (side, n) => {
    const other = side === 'a' ? 'b' : 'a';
    const otherValue = side === 'a' ? b : a;
    const fillOther = otherValue == null || result?.auto === other;
    const next = { a, b, confirmed: false, auto: fillOther ? other : null, [side]: n };
    if (fillOther) next[other] = n != null && n <= POINTS_PER_MATCH ? POINTS_PER_MATCH - n : null;
    onChange(next);
  };

  if (readOnly) {
    const show = confirmed;
    return (
      <article className={`match status-${show ? 'done' : 'open'}`}>
        <header className="match-head">
          <CourtBadge court={match.court} />
          <StatusChip status={show ? 'done' : 'open'} />
        </header>
        <div className="match-body">
          <ScoreRow players={match.team1} value={show ? a : null} locked winner={show && a > b} />
          <ScoreRow players={match.team2} value={show ? b : null} locked winner={show && b > a} />
        </div>
      </article>
    );
  }

  return (
    <article className={`match status-${status}`}>
      <header className="match-head">
        <CourtBadge court={match.court} />
        <StatusChip status={status} />
      </header>
      <div className="match-body">
        <ScoreRow players={match.team1} value={a} locked={confirmed} winner={confirmed && a > b} onChange={(n) => setSide('a', n)} />
        <ScoreRow players={match.team2} value={b} locked={confirmed} winner={confirmed && b > a} onChange={(n) => setSide('b', n)} />
      </div>
      <footer className="match-foot">
        {confirmed ? (
          <>
            <span className="muted">{a === b ? 'Unentschieden' : `${team(a > b ? match.team1 : match.team2)} gewinnt`}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onChange({ a, b, confirmed: false })}>
              Korrigieren
            </button>
          </>
        ) : (
          <>
            <span className={`hint ${a != null && b != null && !v.ok ? 'is-error' : ''}`}>
              {a == null && b == null
                ? `Punkte eintragen (zusammen ${POINTS_PER_MATCH})`
                : v.ok
                  ? v.complete
                    ? `${a + b} von ${POINTS_PER_MATCH} Punkten`
                    : `${a + b} von ${POINTS_PER_MATCH} Punkten · Zeit abgelaufen?`
                  : v.error}
            </span>
            <div className="btn-row tight">
              {status !== 'open' && (
                <button className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
                  Leeren
                </button>
              )}
              <button className="btn btn-primary btn-sm" disabled={!v.ok} onClick={() => onChange({ a, b, confirmed: true, auto: null })}>
                Bestätigen
              </button>
            </div>
          </>
        )}
      </footer>
    </article>
  );
}

function ScoreRow({ players, value, locked, winner, onChange }) {
  return (
    <div className={`team-score ${winner ? 'is-winner' : ''}`}>
      <div className="team-score-name">
        <span className="team-name">{team(players)}</span>
      </div>
      {locked ? <span className="score-locked num">{value ?? '–'}</span> : <Stepper value={value} onChange={onChange} label={team(players)} />}
    </div>
  );
}

function Stepper({ value, onChange, label }) {
  const v = value ?? null;
  return (
    <div className="stepper">
      <button className="step" onClick={() => onChange(v == null || v <= 0 ? 0 : v - 1)} disabled={v == null || v <= 0} aria-label={`${label}: ein Punkt weniger`}>
        −
      </button>
      <input
        className="step-input num"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Punkte ${label}`}
        value={v ?? ''}
        placeholder="–"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '').slice(-2);
          onChange(raw === '' ? null : Number(raw));
        }}
      />
      <button className="step" onClick={() => onChange(v == null ? 1 : v + 1)} disabled={v != null && v >= POINTS_PER_MATCH} aria-label={`${label}: ein Punkt mehr`}>
        +
      </button>
    </div>
  );
}

/* ---------------- Rangliste ---------------- */

function Ranking({ results }) {
  const lastPlayed = useMemo(() => {
    let r = 1;
    for (const round of ROUNDS) if (round.matches.some((m) => isConfirmed(results[m.id]))) r = round.round;
    return r;
  }, [results]);
  // Folgt automatisch der zuletzt gespielten Runde (wichtig für die Teilnehmer-Ansicht, die sich selbst aktualisiert),
  // bis jemand bewusst eine Runde auswählt.
  const [picked, setSel] = useState(null);
  const sel = picked ?? lastPlayed;
  const { rows, counted } = computeRanking(results, { upToRound: sel });
  const selLabel = ROUNDS.find((r) => r.round === sel)?.label ?? '';

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h2 className="page-title">Rangliste</h2>
        <p className="muted">Sortiert nach Ø Punkten pro Match, dann Gesamtpunkte, dann Differenz</p>
      </div>
      <div className="stack">
        <p className="label muted">Stand nach</p>
        <div className="seg" role="tablist" aria-label="Stand nach Runde">
          {ROUNDS.map((r) => (
            <button key={r.round} role="tab" aria-selected={sel === r.round} className={`seg-btn ${sel === r.round ? 'is-active' : ''}`} onClick={() => setSel(r.round)}>
              {r.short}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        Stand nach {selLabel}: {counted} Matches bestätigt
      </p>

      <div className="table-scroll">
        <table className="standings am-standings">
          <thead>
            <tr>
              <th className="c-rank" scope="col">Pl.</th>
              <th className="c-team" scope="col">Spieler</th>
              <th scope="col" className="c-pts" title="Durchschnittliche Punkte pro Match">Ø</th>
              <th scope="col" title="Matches">Sp</th>
              <th scope="col" title="Gesammelte Punkte">Pkt</th>
              <th scope="col" title="Siege">S</th>
              <th scope="col" title="Unentschieden">U</th>
              <th scope="col" title="Niederlagen">N</th>
              <th scope="col" title="Punktdifferenz">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.player} className={`${r.rank != null && r.rank <= 3 ? `is-podium podium-row-${r.rank}` : ''}`}>
                <td className="c-rank num">
                  <span className={`rank-pill ${r.rank != null && r.rank <= 3 ? `am-rank-${r.rank}` : ''}`}>
                    {r.rank ?? '–'}
                    {r.tied ? '=' : ''}
                  </span>
                </td>
                <td className="c-team">
                  <span className="team-name">{r.player}</span>
                </td>
                <td className="num c-pts">{formatAverage(r.average)}</td>
                <td className="num">{r.played}</td>
                <td className="num">{r.points}</td>
                <td className="num">{r.won}</td>
                <td className="num">{r.drawn}</td>
                <td className="num">{r.lost}</td>
                <td className={`num diff ${r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}`}>{signed(r.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Ø = gesammelte Punkte geteilt durch gespielte Matches. Jeder Spieler bekommt die Punkte seines Teams. „=“ bedeutet exakt gleichauf.
      </p>
    </div>
  );
}

/* ---------------- Sieger ---------------- */

function Winners({ results, setTab }) {
  const prog = progress(results);
  const { rows } = computeRanking(results);
  const bonusDone = ROUNDS.find((r) => r.bonus).matches.every((m) => isConfirmed(results[m.id]));

  if (!prog.complete) {
    return (
      <div className="stack-lg">
        <div className="page-head">
          <h2 className="page-title">Sieger</h2>
        </div>
        <section className="locked">
          <Icon name="medal" />
          <div>
            <p className="locked-title">Noch nicht entschieden</p>
            <p>
              Die Siegerehrung erscheint, sobald alle {prog.total} Matches der {REGULAR_ROUNDS} Runden bestätigt sind. Bisher: {prog.confirmed}.
            </p>
            <button className="btn btn-primary" onClick={() => setTab('rangliste')}>
              Zur Rangliste
            </button>
          </div>
        </section>
      </div>
    );
  }

  const atRank = (n) => rows.filter((r) => r.rank === n);
  const podium = [2, 1, 3].map((n) => ({ place: n, players: atRank(n) }));

  return (
    <div className="stack-lg awards">
      <div className="page-head center">
        <p className="eyebrow">{bonusDone ? 'inklusive Bonusrunde' : `nach ${REGULAR_ROUNDS} Runden`}</p>
        <h2 className="page-title">Siegerehrung</h2>
      </div>
      <div className="podium">
        {podium.map(({ place, players }) => (
          <div key={place} className={`podium-col podium-${place}`}>
            <div className="podium-team">
              {players.length > 0 && <Medal place={place} />}
              <span className="podium-name">{players.map((p) => p.player).join(' & ') || ' '}</span>
              {players.length > 0 && <span className="players">Ø {formatAverage(players[0].average)}</span>}
            </div>
            <div className="podium-block">
              <span className="num">{place}</span>
            </div>
          </div>
        ))}
      </div>
      <ol className="final-list rest">
        {rows
          .filter((r) => r.rank == null || r.rank > 3)
          .map((r) => (
            <li key={r.player}>
              <span className="num final-place">{r.rank ?? '–'}.</span>
              <span className="team-name">{r.player}</span>
              <span className="muted">Ø {formatAverage(r.average)}</span>
            </li>
          ))}
      </ol>
      <p className="muted small center">Glückwunsch an alle – danke fürs Mitspielen!</p>
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

/* ---------------- Abgleich, Export, Zurücksetzen ---------------- */

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

function SyncSheet({ sync, onClose }) {
  const readOnly = useContext(ReadOnly);
  const [token, setToken] = useState(sync.token || '');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  if (readOnly) return null;

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await sync.connect(token);
      setMsg({ ok: true, text: 'Verbunden. Punkte werden jetzt abgeglichen.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof TypeError ? 'Keine Verbindung zu GitHub.' : e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Geräte verbinden" onClose={onClose}>
      <p className="small">
        Die Punkte werden in <code>{AMERICANO_FILE.path}</code> im Repository{' '}
        <strong>
          {AMERICANO_FILE.owner}/{AMERICANO_FILE.repo}
        </strong>{' '}
        gespeichert. Es ist derselbe Token wie bei der Turnier-App. Wer ihn dort schon eingegeben hat, ist hier automatisch verbunden.
      </p>
      {sync.token && (
        <div className={`alert ${sync.status.state === 'error' ? 'alert-danger' : ''}`}>
          <strong>Status:</strong>{' '}
          {sync.status.state === 'ok' && 'abgeglichen'}
          {sync.status.state === 'syncing' && 'gleiche ab …'}
          {(sync.status.state === 'offline' || sync.status.state === 'error') && sync.status.error}{' '}
          <button className="link" onClick={() => sync.syncNow()}>
            Jetzt abgleichen
          </button>
        </div>
      )}
      <label className="small" htmlFor="am-token">
        GitHub-Token (Fine-grained, Repository „{AMERICANO_FILE.repo}“, Contents: Read and write)
      </label>
      <input id="am-token" className="text-input" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
      {msg && <p className={`small ${msg.ok ? 'ok-text' : 'error-text'}`}>{msg.text}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" disabled={!token.trim() || busy} onClick={connect}>
          {busy ? 'Prüfe …' : sync.token ? 'Token speichern' : 'Verbinden'}
        </button>
        {sync.token && (
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await sync.connect('');
              setToken('');
              setMsg(null);
            }}
          >
            Trennen
          </button>
        )}
      </div>
    </Modal>
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
      <input id="am-viewer-url" className="text-input" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button
        className="btn btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            document.getElementById('am-viewer-url')?.select();
          }
        }}
      >
        {copied ? 'Kopiert ✓' : 'Link kopieren'}
      </button>
    </div>
  );
}

function ExportSheet({ results, onClose }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  const text = exportText(results);
  return (
    <Modal title="Ergebnisse exportieren" onClose={onClose}>
      <textarea id="am-export" ref={ref} className="export-text" readOnly value={text} rows={14} onFocus={(e) => e.target.select()} />
      <div className="btn-row">
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              ref.current?.select();
            }
          }}
        >
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
    </Modal>
  );
}

function ResetDialog({ onCancel, onConfirm }) {
  const [step, setStep] = useState(1);
  return (
    <Modal title="Turnier zurücksetzen?" onClose={onCancel}>
      <p>Alle eingetragenen Punkte werden gelöscht, auch auf den verbundenen Geräten. Spieler und Spielplan bleiben erhalten.</p>
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
    <span className="court-badge">
      <span className="court-id">{court}</span>
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
    medal: 'M8 3l4 7 4-7M12 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
    check: 'M5 12l5 5L19 7',
    x: 'M6 6l12 12M18 6 6 18',
    share: 'M12 4v12M7 9l5-5 5 5M5 14v6h14v-6',
    reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4',
    sync: 'M20 11a8 8 0 0 0-14.3-4.9M4 5v4h4M4 13a8 8 0 0 0 14.3 4.9M20 19v-4h-4',
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
