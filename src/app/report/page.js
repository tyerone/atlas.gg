'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AtlasLogo from '@/components/AtlasLogo';
import styles from './report.module.css';

// ─── MOCK DATA ───────────────────────────────────────────────
const FALLBACK_REPORT = {
  riotId: 'Playername#NA1',
  role: 'ADC',
  gamesAnalyzed: 5,
  criticalInsight: {
    text: 'You pushed past river without jungle support in mid-game (14–22 min). This overextension pattern resulted in a death ',
    highlight: '4 out of 5 games',
    text2: ', each within 10 seconds. Your deaths cluster around the same bot-side river entry point.',
    timestamp: '15:42',
    game: 3,
  },
  stats: [
    { label: 'Deaths',        value: '38',  sub: 'across 5 games', color: 'red'   },
    { label: 'Vision score',  value: '24',  sub: 'avg per game',   color: 'amber' },
    { label: 'Obj. presence', value: '61%', sub: 'dragon / baron', color: 'blue'  },
  ],
  phases: [
    { label: 'Early', pct: 72, color: 'blue'  },
    { label: 'Mid',   pct: 38, color: 'red'   },
    { label: 'Late',  pct: 55, color: 'amber' },
  ],
  sections: [
    {
      id: 'macro', label: 'Macro', color: 'red',
      cards: [
        { title: 'Objective presence',   text: 'Absent from 3 of 4 Dragon fights across 5 games',            timestamp: '22:10', game: 2 },
        { title: 'Base timing',          text: 'Backed within 30s of objective spawn twice — team lost both', timestamp: '18:05', game: 4 },
        { title: 'Solo vs team fights',  text: 'Caught splitting when team engaged 3 times across 5 games',   timestamp: '24:30', game: 1 },
      ],
    },
    {
      id: 'vision', label: 'Vision', color: 'amber',
      cards: [
        { title: 'Ward clustering',       text: 'Same 2 ward spots used every game — predictable pattern',    timestamp: '22:10', game: 1 },
        { title: 'Deaths without vision', text: '6 of 11 deaths occurred in unwarded areas across 5 games',   timestamp: '18:05', game: 3 },
      ],
    },
    {
      id: 'positioning', label: 'Positioning', color: 'blue',
      cards: [
        { title: 'Overextension',    text: 'Pushed past river without vision 4 of 5 games in mid-game',       timestamp: '15:42', game: 3 },
        { title: 'Death clustering', text: '7 deaths within 200 units of same river entry point across games', timestamp: '19:15', game: 1 },
      ],
    },
  ],
};

const STEPS = [
  'Fetching match data from Riot API',
  'Extracting spatial event data',
  'Mapping coordinates to map zones',
  'Detecting cross-game patterns',
  'Generating your insight report',
];

const STEP_DURATIONS = [900, 800, 1000, 1100, 700];
const TOTAL_DUR = STEP_DURATIONS.reduce((a, b) => a + b, 0);

export default function ReportPage() {
  const router = useRouter();
  const [phase, setPhase]           = useState('processing');
  const [currentStep, setCurrentStep] = useState(0);
  const [stepsDone, setStepsDone]   = useState([]);
  const [progress, setProgress]     = useState(0);
  const [activePhase, setActivePhase] = useState('All');
  const [riotId] = useState(
    () => (typeof window !== 'undefined' ? (sessionStorage.getItem('atlas_riot_id') || 'Playername#NA1') : 'Playername#NA1'),
  );
  const [reportData, setReportData] = useState(null);
  const [processingError, setProcessingError] = useState('');

  async function fetchReportPayload() {
    const puuid = sessionStorage.getItem('atlas_puuid');
    const region = sessionStorage.getItem('atlas_region') || 'NA1';
    const selectedRaw = sessionStorage.getItem('atlas_selected_matches') || '[]';
    

    let matchIds = [];

    try {
      matchIds = JSON.parse(selectedRaw);
    } catch {
      matchIds = [];
    }

    if (!puuid) {
      throw new Error('Missing Riot account session. Connect your Riot ID first.');
    }

    if (!Array.isArray(matchIds) || matchIds.length < 2) {
      throw new Error('Select at least 2 matches before generating a report.');
    }

    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchIds,
        puuid,
        region,
      }),
    });

    const data = await response.json();
    console.log('report response:', data);

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Could not generate a report from Riot data.');
    }

    sessionStorage.setItem('atlas_report', JSON.stringify(data.report));
    return data.report;
  }

  function animateProcessingSteps() {
    return new Promise((resolve) => {
      let elapsed = 0;

      STEP_DURATIONS.forEach((dur, idx) => {
        setTimeout(() => {
          setCurrentStep(idx);

          const startPct = STEP_DURATIONS.slice(0, idx).reduce((a, b) => a + b, 0) / TOTAL_DUR * 100;
          const endPct = STEP_DURATIONS.slice(0, idx + 1).reduce((a, b) => a + b, 0) / TOTAL_DUR * 100;
          const startTime = Date.now();

          const tick = () => {
            const t = Math.min((Date.now() - startTime) / dur, 1);
            setProgress(startPct + ((endPct - startPct) * t));

            if (t < 1) {
              requestAnimationFrame(tick);
            } else {
              setStepsDone((prev) => [...prev, idx]);

              if (idx === STEP_DURATIONS.length - 1) {
                setTimeout(resolve, 450);
              }
            }
          };

          requestAnimationFrame(tick);
        }, elapsed);

        elapsed += dur;
      });
    });
  }

  async function runProcessing() {
    setPhase('processing');
    setProgress(0);
    setCurrentStep(0);
    setStepsDone([]);
    setProcessingError('');

    const reportPromise = fetchReportPayload();

    await animateProcessingSteps();

    try {
      const computedReport = await reportPromise;
      setReportData(computedReport);
      setPhase('report');
    } catch (error) {
      setProcessingError(error.message || 'Could not generate report.');
      setPhase('error');
    }
  }

  useEffect(() => {
    const timerId = setTimeout(() => {
      void runProcessing();
    }, 0);

    return () => {
      clearTimeout(timerId);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gameName = riotId.split('#')[0];
  const tag      = riotId.split('#')[1] || 'TAG';
  const circumference = 2 * Math.PI * 26;

  // ── PROCESSING ────────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLogo}>
            <AtlasLogo width={26} height={23} />
            <span className={styles.navLogoText}>atlas.<span>gg</span></span>
          </Link>
          <ul className={styles.navLinks}>
            <li><Link href="/">Connect</Link></li>
            <li><Link href="/matches">Matches</Link></li>
            <li><Link href="/report" className={styles.active}>Report</Link></li>
          </ul>
          <div className={styles.navUser}>{riotId}</div>
        </nav>

        <main className={styles.processingMain}>
          <div className={styles.processingCard}>

            <div className={styles.ringWrap}>
              <svg viewBox="0 0 64 64" className={styles.ring}>
                <circle className={styles.ringTrack} cx="32" cy="32" r="26" />
                <circle
                  className={styles.ringFill}
                  cx="32" cy="32" r="26"
                  transform="rotate(-90 32 32)"
                  style={{
                    strokeDasharray: circumference,
                    strokeDashoffset: circumference * (1 - progress / 100),
                  }}
                />
              </svg>
              <span className={styles.ringPct}>{Math.round(progress)}%</span>
            </div>

            <h2 className={styles.processingTitle}>
              {progress >= 100 ? 'Report ready' : 'Analyzing your replays'}
            </h2>

            <div className={styles.processingSteps}>
              {STEPS.map((step, idx) => {
                const done    = stepsDone.includes(idx);
                const running = currentStep === idx && !done;
                return (
                  <div key={idx} className={`${styles.pStep} ${done ? styles.pStepDone : ''} ${running ? styles.pStepRunning : ''}`}>
                    <div className={styles.pStepIcon}>
                      {done ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <div className={styles.pStepDot} />
                      )}
                    </div>
                    <span className={styles.pStepText}>{step}</span>
                    {done && <span className={styles.pStepTag}>✓</span>}
                  </div>
                );
              })}
            </div>

          </div>
        </main>

        <footer className={styles.footer}>
          <p>atlas.gg &mdash; spatial replay analysis &mdash; stormforge 2026 &mdash; not endorsed by riot games</p>
        </footer>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLogo}>
            <AtlasLogo width={26} height={23} />
            <span className={styles.navLogoText}>atlas.<span>gg</span></span>
          </Link>
          <ul className={styles.navLinks}>
            <li><Link href="/">Connect</Link></li>
            <li><Link href="/matches">Matches</Link></li>
            <li><Link href="/report" className={styles.active}>Report</Link></li>
          </ul>
          <div className={styles.navUser}>{riotId}</div>
        </nav>

        <main className={styles.processingMain}>
          <div className={styles.processingCard}>
            <h2 className={styles.processingTitle}>Could not generate report</h2>
            <p className={styles.pStepText}>{processingError}</p>
            <button
              className={styles.btnDrillDown}
              onClick={() => router.push('/matches')}
              type="button"
            >
              Back to match selection →
            </button>
          </div>
        </main>

        <footer className={styles.footer}>
          <p>atlas.gg &mdash; spatial replay analysis &mdash; stormforge 2026 &mdash; not endorsed by riot games</p>
        </footer>
      </div>
    );
  }

  // ── REPORT ───────────────────────────────────────────────
  const r = reportData || FALLBACK_REPORT;

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>
          <AtlasLogo width={26} height={23} />
          <span className={styles.navLogoText}>atlas.<span>gg</span></span>
        </Link>
        <ul className={styles.navLinks}>
          <li><Link href="/">Connect</Link></li>
          <li><Link href="/matches">Matches</Link></li>
          <li><Link href="/report" className={styles.active}>Report</Link></li>
        </ul>
        <div className={styles.navUser}>{riotId}</div>
      </nav>

      <main className={styles.reportMain}>

        {/* Header */}
        <div className={styles.reportHeader}>
          <div>
            <div className={styles.eyebrow}>
              <div className={styles.eyebrowDot} />
              <span className={styles.eyebrowText}>Cross-game pattern report</span>
            </div>
            <h1 className={styles.reportTitle}>
              {gameName}<span className={styles.reportTag}>#{tag}</span>
            </h1>
            <p className={styles.reportMeta}>
              {r.role} &nbsp;·&nbsp; <span>{r.gamesAnalyzed} replays</span> &nbsp;·&nbsp; {r.queueLabel || 'Ranked Solo'}
            </p>
          </div>
          <div className={styles.gamesPill}>{r.gamesAnalyzed} games analyzed</div>
        </div>

        {/* Critical insight */}
        <div className={styles.criticalCard}>
          <div className={styles.criticalHeader}>
            <div className={styles.criticalDot} />
            <span className={styles.criticalLabel}>Critical pattern</span>
          </div>
          <p className={styles.criticalText}>
            {r.criticalInsight.text}
            <strong>{r.criticalInsight.highlight}</strong>
            {r.criticalInsight.text2}
          </p>
          <button
            className={styles.criticalLink}
            onClick={() => router.push(`/drill-down?game=${r.criticalInsight.game}&ts=${r.criticalInsight.timestamp}`)}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="12" height="12">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Jump to {r.criticalInsight.timestamp}, Game {r.criticalInsight.game} →
          </button>
        </div>

        {/* Stats */}
        <div className={styles.statsRow}>
          {r.stats.map(s => (
            <div key={s.label} className={styles.statCard}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={`${styles.statValue} ${styles[`color_${s.color}`]}`}>{s.value}</span>
              <span className={styles.statSub}>{s.sub}</span>
            </div>
          ))}
        </div>

        {/* Map + Phases */}
        <div className={styles.mapSection}>
          <div className={styles.mapBlock}>
            <div className={styles.mapBlockHeader}>
              <span className={styles.sectionLabel}>Aggregate heatmap</span>
              <div className={styles.phaseToggle}>
                {['All','Early','Mid','Late'].map(p => (
                  <button
                    key={p}
                    className={`${styles.phaseBtn} ${activePhase === p ? styles.phaseBtnActive : ''}`}
                    onClick={() => setActivePhase(p)}
                    type="button"
                  >{p}</button>
                ))}
              </div>
            </div>
            <div className={styles.mapCanvas}>
              <svg width="100%" height="100%" viewBox="0 0 520 210" preserveAspectRatio="xMidYMid meet">
                <rect width="520" height="210" fill="#0d1117" />
                <rect x="8" y="8" width="504" height="194" rx="5" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                <line x1="8" y1="202" x2="512" y2="8" stroke="rgba(79,142,247,0.06)" strokeWidth="12" />
                <circle cx="310" cy="115" r="30" fill="rgba(226,75,74,0.22)" />
                <circle cx="310" cy="115" r="18" fill="rgba(226,75,74,0.42)" />
                <circle cx="310" cy="115" r="9"  fill="rgba(226,75,74,0.85)" />
                <rect x="292" y="96" width="38" height="13" rx="3" fill="rgba(226,75,74,0.12)" stroke="rgba(226,75,74,0.35)" strokeWidth="0.5" />
                <text x="311" y="105" textAnchor="middle" fontFamily="monospace" fontSize="7.5" fill="#E24B4A">8 deaths</text>
                <circle cx="178" cy="135" r="4" fill="rgba(79,142,247,0.8)" />
                <circle cx="193" cy="127" r="4" fill="rgba(79,142,247,0.8)" />
                <circle cx="185" cy="118" r="4" fill="rgba(79,142,247,0.55)" />
                <circle cx="245" cy="85"  r="14" fill="rgba(239,159,39,0.2)" />
                <circle cx="245" cy="85"  r="8"  fill="rgba(239,159,39,0.4)" />
                <path d="M68 172 Q135 158 195 130 Q248 108 310 115" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" strokeDasharray="4 3" />
                <circle cx="18" cy="200" r="4" fill="rgba(226,75,74,0.8)" />
                <text x="26" y="203" fontFamily="monospace" fontSize="7.5" fill="rgba(255,255,255,0.3)">Deaths</text>
                <circle cx="76" cy="200" r="4" fill="rgba(79,142,247,0.8)" />
                <text x="84" y="203" fontFamily="monospace" fontSize="7.5" fill="rgba(255,255,255,0.3)">Wards</text>
                <circle cx="130" cy="200" r="4" fill="rgba(239,159,39,0.7)" />
                <text x="138" y="203" fontFamily="monospace" fontSize="7.5" fill="rgba(255,255,255,0.3)">Fights</text>
              </svg>
              <span className={styles.mapNote}>5 games · {activePhase.toLowerCase()} phase{activePhase !== 'All' ? '' : 's'}</span>
            </div>
          </div>

          <div className={styles.phaseBarsBlock}>
            <span className={styles.sectionLabel}>Phase performance</span>
            {r.phases.map(p => (
              <div key={p.label} className={styles.phaseRow}>
                <span className={styles.phaseName}>{p.label}</span>
                <div className={styles.phaseTrack}>
                  <div className={`${styles.phaseFill} ${styles[`color_${p.color}`]}`} style={{ width: `${p.pct}%` }} />
                </div>
                <span className={styles.phasePct}>{p.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Insight sections */}
        {r.sections.map(section => (
          <div key={section.id} className={styles.insightSection}>
            <div className={styles.insightSectionHeader}>
              <div className={`${styles.sectionDot} ${styles[`color_${section.color}`]}`} />
              <span className={styles.sectionTitle}>{section.label}</span>
            </div>
            <div className={styles.insightGrid}>
              {section.cards.map((card, idx) => (
                <div
                  key={idx}
                  className={styles.insightCard}
                  onClick={() => router.push(`/drill-down?game=${card.game}&ts=${card.timestamp}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && router.push(`/drill-down?game=${card.game}&ts=${card.timestamp}`)}
                >
                  <span className={styles.cardTitle}>{card.title}</span>
                  <span className={styles.cardText}>{card.text}</span>
                  <span className={styles.cardLink}>▶ {card.timestamp}, Game {card.game}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <button className={styles.btnDrillDown} onClick={() => router.push('/drill-down')} type="button">
          View individual replay drill-down →
        </button>

      </main>

      <footer className={styles.footer}>
        <p>atlas.gg &mdash; spatial replay analysis &mdash; stormforge 2026 &mdash; not endorsed by riot games</p>
      </footer>
    </div>
  );
}