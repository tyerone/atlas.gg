'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AtlasLogo from '@/components/AtlasLogo';
import styles from './drill-down.module.css';

// ─── MOCK DATA ───────────────────────────────────────────────
const MOCK_GAME = {
  gameNum:   3,
  champion:  'Jinx',
  result:    'Loss',
  queue:     'Ranked Solo',
  duration:  '28m',
  matchId:   'NA1-5823801045',
  kda:       '3/8/4',
  cs:        187,
  csPerMin:  6.7,
  vision:    19,
  phases: [
    { label: 'Early', pct: 78, color: 'blue'  },
    { label: 'Mid',   pct: 31, color: 'red'   },
    { label: 'Late',  pct: 48, color: 'amber' },
  ],
  whyHere: {
    pattern: 'Overextension at 15:42',
    desc: 'Pushed past river without vision. This matches your cross-game overextension pattern — died within 8 seconds.',
    timestamp: '15:42',
  },
  tabs: {
    positioning: [
      {
        title: 'Overextension — river',
        text:  'Pushed past river without jungle support. 3 enemies missing from minimap. Died within 8 seconds.',
        timestamp: '15:42',
        highlighted: true,
        snapshot: '3 enemies missing from minimap. You pushed past river without vision coverage. Support was recalling. Died 8 seconds after crossing the river boundary — matches your cross-game overextension pattern.',
      },
      {
        title: 'Early lane positioning',
        text:  'Farming closer to enemy tower than usual — high gank vulnerability in early game.',
        timestamp: '08:20',
        highlighted: false,
        snapshot: 'Farming within 150 units of enemy tower at 8:20. Enemy jungler had cleared bot scuttle 40 seconds earlier — high gank risk. No deep ward placed.',
      },
      {
        title: 'Death clustering',
        text:  '3 of your 8 deaths in this game occurred within 200 units of the same river entry.',
        timestamp: '22:05',
        highlighted: false,
        snapshot: 'Third death in the same river entry point this game. No ward coverage in this area for 4 minutes prior. This pattern repeats across Games 1, 3, and 4.',
      },
      {
        title: 'Teamfight position',
        text:  'Positioned at front of team during dragon fight — took 80% max HP in 3 seconds.',
        timestamp: '19:30',
        highlighted: false,
        snapshot: 'Positioned at the front line during dragon fight. As ADC, expected position is behind tanks. Took 80% max HP in first 3 seconds of the fight.',
      },
    ],
    vision: [
      {
        title: 'Ward placement',
        text:  'Both wards placed in the same river bush — same pattern as 4 other games.',
        timestamp: '12:10',
        highlighted: false,
        snapshot: 'Ward placed in standard river bush. Enemy support has likely tracked this ward placement — same bush used in Games 1, 2, and 4. Predictable vision control.',
      },
      {
        title: 'Death without vision',
        text:  'No active wards within 1000 units of death location at 15:42.',
        timestamp: '15:42',
        highlighted: false,
        snapshot: 'No active wards within 1000 game units of your death location at 15:42. The area had been unwardded for over 3 minutes before the death.',
      },
    ],
    macro: [
      {
        title: 'Dragon absence',
        text:  'Team contested Dragon at 22:40 — you were farming top side alone.',
        timestamp: '22:40',
        highlighted: false,
        snapshot: 'Team engaged Dragon at 22:40. You were 200 units into top side farming a minion wave. Team fought 4v5 and lost the objective.',
      },
      {
        title: 'Base timing',
        text:  'Backed at 17:50 — Dragon spawned at 18:00. Team lost the fight 4v5.',
        timestamp: '17:50',
        highlighted: false,
        snapshot: 'Backed at 17:50 with Dragon spawning in 10 seconds. Could have stayed and contested. Team lost Dragon fight without ADC damage output.',
      },
    ],
  },
};

const TAB_LABELS = ['Positioning', 'Vision', 'Macro'];
const TAB_KEYS   = ['positioning', 'vision', 'macro'];

export default function DrillDownPage() {
  const router = useRouter();
  const [riotId, setRiotId] = useState('Playername#NA1');
  const [activeTab, setActiveTab]   = useState(0);
  const [snapshot, setSnapshot]     = useState(null);
  const [snapshotTs, setSnapshotTs] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem('atlas_riot_id');
    if (stored) setRiotId(stored);

    const ts = new URLSearchParams(window.location.search).get('ts');
    if (ts) {
      setTimeout(() => {
        openSnapshot(ts);
      }, 0);
    }
  }, []);

  function openSnapshot(ts) {
    // Find the card with this timestamp across all tabs
    for (const tabKey of TAB_KEYS) {
      const card = MOCK_GAME.tabs[tabKey].find(c => c.timestamp === ts);
      if (card) {
        setSnapshot(card.snapshot);
        setSnapshotTs(ts);
        setActiveTab(TAB_KEYS.indexOf(tabKey));
        return;
      }
    }
  }

  function handleCardClick(card) {
    if (snapshot && snapshotTs === card.timestamp) {
      setSnapshot(null);
      setSnapshotTs('');
    } else {
      setSnapshot(card.snapshot);
      setSnapshotTs(card.timestamp);
    }
  }

  const g = MOCK_GAME;
  const currentCards = MOCK_GAME.tabs[TAB_KEYS[activeTab]];

  return (
    <div className={styles.page}>

      {/* ── NAV ── */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo} aria-label="Atlas.gg home">
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

      <main className={styles.main}>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <button className={styles.breadcrumbBack} onClick={() => router.push('/report')} type="button">
            ← Pattern report
          </button>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>
            Game {g.gameNum} · {g.champion} · {g.whyHere.timestamp}
          </span>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowText}>Individual replay</span>
            </div>
            <h1 className={styles.heading}>
              Game {g.gameNum} — {g.champion}
              <span className={`${styles.resultBadge} ${g.result === 'Win' ? styles.badgeWin : styles.badgeLoss}`}>
                {g.result}
              </span>
            </h1>
            <p className={styles.meta}>
              {g.queue} &nbsp;·&nbsp; <span>{g.duration}</span> &nbsp;·&nbsp; ADC &nbsp;·&nbsp; <span>{g.matchId}</span>
            </p>
          </div>
        </div>

        {/* Why you're here banner */}
        <div className={styles.whyBanner}>
          <div className={styles.whyDot} />
          <div className={styles.whyContent}>
            <span className={styles.whyTitle}>Why you&apos;re here:&nbsp;</span>
            <span className={styles.whyDesc}>{g.whyHere.pattern} — {g.whyHere.desc}</span>
          </div>
          <button
            className={styles.whyLink}
            onClick={() => openSnapshot(g.whyHere.timestamp)}
            type="button"
          >
            ▶ {g.whyHere.timestamp}
          </button>
        </div>

        {/* Main grid — map + stats */}
        <div className={styles.mainGrid}>

          {/* Map */}
          <div className={styles.mapBlock}>
            <div className={styles.mapLabel}>
              Spatial view — this game
            </div>
            <div className={styles.mapCanvas}>
              <svg width="100%" height="100%" viewBox="0 0 300 240" preserveAspectRatio="xMidYMid meet">
                {/* 1. Dark base */}
                <rect width="300" height="240" fill="#0d1117" />
                {/* 2. Map image */}
                <image
                  href="/map.png"
                  x="8"
                  y="8"
                  width="284"
                  height="224"
                  preserveAspectRatio="xMidYMid slice"
                  opacity="0.35"
                />
                {/* 3. Dark overlay */}
                <rect x="8" y="8" width="284" height="224" rx="5" fill="rgba(13,17,23,0.55)" />
                {/* 4. Border */}
                <rect x="8" y="8" width="284" height="224" rx="5" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                {/* River */}
                <line x1="8" y1="232" x2="292" y2="8" stroke="rgba(79,142,247,0.06)" strokeWidth="10" />
                {/* Grid */}
                <line x1="105" y1="8" x2="105" y2="232" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
                <line x1="200" y1="8" x2="200" y2="232" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
                <line x1="8"   y1="88" x2="292" y2="88"  stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
                <line x1="8"   y1="160" x2="292" y2="160" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
                {/* Movement path */}
                <path d="M42 198 Q82 185 118 162 Q155 142 178 128 Q198 118 202 105" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeDasharray="4 3" />
                {/* Main death — highlighted */}
                <circle cx="202" cy="105" r="16" fill="rgba(226,75,74,0.18)" />
                <circle cx="202" cy="105" r="10" fill="rgba(226,75,74,0.45)" />
                <circle cx="202" cy="105" r="5"  fill="#E24B4A" />
                <rect x="184" y="85" width="38" height="13" rx="3" fill="rgba(226,75,74,0.14)" stroke="rgba(226,75,74,0.35)" strokeWidth="0.5" />
                <text x="203" y="94" textAnchor="middle" fontFamily="monospace" fontSize="7.5" fill="#E24B4A">15:42 ✕</text>
                {/* Other deaths */}
                <circle cx="194" cy="113" r="5" fill="rgba(226,75,74,0.45)" />
                <circle cx="208" cy="118" r="5" fill="rgba(226,75,74,0.45)" />
                {/* Wards */}
                <circle cx="118" cy="158" r="4" fill="rgba(79,142,247,0.8)" />
                <circle cx="130" cy="150" r="4" fill="rgba(79,142,247,0.8)" />
                <circle cx="110" cy="166" r="4" fill="rgba(79,142,247,0.5)" />
                {/* Enemy positions */}
                <circle cx="218" cy="92"  r="5" fill="rgba(239,159,39,0.65)" stroke="rgba(239,159,39,0.3)" strokeWidth="1" />
                <circle cx="228" cy="103" r="5" fill="rgba(239,159,39,0.65)" stroke="rgba(239,159,39,0.3)" strokeWidth="1" />
                <circle cx="212" cy="82"  r="5" fill="rgba(239,159,39,0.65)" stroke="rgba(239,159,39,0.3)" strokeWidth="1" />
                {/* Snapshot timestamp label */}
                {snapshotTs && (
                  <text x="14" y="228" fontFamily="monospace" fontSize="8" fill="#4f8ef7">
                    Snapshot at {snapshotTs}
                  </text>
                )}
                {!snapshotTs && (
                  <text x="14" y="228" fontFamily="monospace" fontSize="8" fill="rgba(255,255,255,0.2)">
                    Full game view
                  </text>
                )}
                {/* Legend */}
                <circle cx="160" cy="228" r="3.5" fill="rgba(226,75,74,0.8)" />
                <text x="167" y="231" fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.25)">Deaths</text>
                <circle cx="208" cy="228" r="3.5" fill="rgba(79,142,247,0.8)" />
                <text x="215" y="231" fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.25)">Wards</text>
                <circle cx="252" cy="228" r="3.5" fill="rgba(239,159,39,0.7)" />
                <text x="259" y="231" fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.25)">Enemies</text>
              </svg>
            </div>
          </div>

          {/* Stats */}
          <div className={styles.statsBlock}>
            <span className={styles.blockLabel}>Game stats</span>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>KDA</span>
                <span className={`${styles.statVal} ${styles.colorRed}`}>{g.kda}</span>
                <span className={styles.statSub}>below avg</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>CS</span>
                <span className={styles.statVal}>{g.cs}</span>
                <span className={styles.statSub}>{g.csPerMin}/min</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Vision</span>
                <span className={`${styles.statVal} ${styles.colorAmber}`}>{g.vision}</span>
                <span className={styles.statSub}>score</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Duration</span>
                <span className={styles.statVal}>{g.duration}</span>
                <span className={styles.statSub}>ranked solo</span>
              </div>
            </div>

            <span className={styles.blockLabel} style={{ marginTop: '4px' }}>Phase performance</span>
            <div className={styles.phases}>
              {g.phases.map(p => (
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

        </div>

        {/* Snapshot panel */}
        {snapshot && (
          <div className={styles.snapshotPanel}>
            <div className={styles.snapshotHeader}>
              <span className={styles.snapshotTitle}>Snapshot — {snapshotTs}</span>
              <button className={styles.snapshotClose} onClick={() => { setSnapshot(null); setSnapshotTs(''); }} type="button">✕</button>
            </div>
            <p className={styles.snapshotText}>{snapshot}</p>
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          {TAB_LABELS.map((label, idx) => (
            <button
              key={label}
              className={`${styles.tab} ${activeTab === idx ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(idx)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Insight cards */}
        <div className={styles.cardGrid}>
          {currentCards.map((card, idx) => (
            <div
              key={idx}
              className={`${styles.insightCard} ${card.highlighted ? styles.cardHighlighted : ''} ${snapshotTs === card.timestamp ? styles.cardActive : ''}`}
              onClick={() => handleCardClick(card)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleCardClick(card)}
            >
              <span className={styles.cardTitle}>{card.title}</span>
              <span className={styles.cardText}>{card.text}</span>
              <span className={styles.cardLink}>▶ Snapshot at {card.timestamp}</span>
            </div>
          ))}
        </div>

        {/* Back to report */}
        <button className={styles.btnBack} onClick={() => router.push('/report')} type="button">
          ← Back to pattern report
        </button>

      </main>

      <footer className={styles.footer}>
        <p>atlas.gg &mdash; spatial replay analysis &mdash; stormforge 2026 &mdash; not endorsed by riot games</p>
      </footer>
    </div>
  );
}   