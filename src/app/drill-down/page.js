'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AtlasLogo from '@/components/AtlasLogo';
import styles from './drill-down.module.css';
import { Suspense } from 'react';

const TAB_LABELS = ['Positioning', 'Vision', 'Macro'];
const TAB_KEYS   = ['positioning', 'vision', 'macro'];

// ─── MAP ─────────────────────────────────────────────────────
function GameMap({ snapshot, allGame }) {
  const data = snapshot || allGame;
  if (!data) return (
    <div style={{ width: '100%', height: '100%', background: '#0d1117', borderRadius: 6 }} />
  );

  return (
    <svg width="100%" height="100%" viewBox="0 0 300 240" preserveAspectRatio="xMidYMid meet">
      <rect width="300" height="240" fill="#0d1117" />
      
      <image 
        href="/map.png" 
        x="0" 
        y="0" 
        width="300" 
        height="240" 
        opacity="0.3" 
        preserveAspectRatio="none"
      />

      <rect x="8" y="8" width="284" height="224" rx="5" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      {/* River diagonal */}
      <line x1="8" y1="232" x2="292" y2="8" stroke="rgba(79,142,247,0.06)" strokeWidth="10" />
      {/* Grid */}
      <line x1="105" y1="8" x2="105" y2="232" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
      <line x1="200" y1="8" x2="200" y2="232" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
      <line x1="8"   y1="88" x2="292" y2="88"  stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
      <line x1="8"   y1="160" x2="292" y2="160" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />

      {/* Wards */}
      {(data.wards || []).map((pos, i) => pos && (
        <circle key={`ward-${i}`} cx={pos.x} cy={pos.y} r="4" fill="rgba(79,142,247,0.8)" />
      ))}

      {/* Deaths */}
      {(data.deaths || []).map((pos, i) => pos && (
        <g key={`death-${i}`}>
          <circle cx={pos.x} cy={pos.y} r="10" fill="rgba(226,75,74,0.18)" />
          <circle cx={pos.x} cy={pos.y} r="6"  fill="rgba(226,75,74,0.45)" />
          <circle cx={pos.x} cy={pos.y} r="3"  fill="#E24B4A" />
        </g>
      ))}

      {/* Allies */}
      {snapshot && (data.allies || []).map((pos, i) => pos && (
        <circle key={`ally-${i}`} cx={pos.x} cy={pos.y} r="5" fill="rgba(79,247,142,0.6)" stroke="rgba(79,247,142,0.3)" strokeWidth="1" />
      ))}

      {/* Enemies */}
      {snapshot && (data.enemies || []).map((pos, i) => pos && (
        <circle key={`enemy-${i}`} cx={pos.x} cy={pos.y} r="5" fill="rgba(239,159,39,0.65)" stroke="rgba(239,159,39,0.3)" strokeWidth="1" />
      ))}

      {/* Player */}
      {snapshot && data.player && (
        <g>
          <circle cx={data.player.x} cy={data.player.y} r="7" fill="rgba(255,255,255,0.15)" />
          <circle cx={data.player.x} cy={data.player.y} r="5" fill="rgba(255,255,255,0.9)" />
        </g>
      )}

      {/* Timestamp label */}
      <text x="14" y="228" fontFamily="monospace" fontSize="8"
        fill={snapshot ? '#4f8ef7' : 'rgba(255,255,255,0.2)'}>
        {snapshot ? `Snapshot at ${snapshot.timestamp}` : 'Full game view'}
      </text>

      {/* Legend */}
      <circle cx="160" cy="228" r="3.5" fill="rgba(226,75,74,0.8)" />
      <text x="167" y="231" fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.25)">Deaths</text>
      <circle cx="208" cy="228" r="3.5" fill="rgba(79,142,247,0.8)" />
      <text x="215" y="231" fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.25)">Wards</text>
      {snapshot && <>
        <circle cx="252" cy="228" r="3.5" fill="rgba(239,159,39,0.7)" />
        <text x="259" y="231" fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.25)">Enemies</text>
      </>}
    </svg>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────
function DrillDownContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [riotId] = useState(
    () => typeof window !== 'undefined'
      ? (sessionStorage.getItem('atlas_riot_id') || 'Playername#NA1')
      : 'Playername#NA1',
  );

  const [game, setGame]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [activeTab, setActiveTab]   = useState(0);
  const [snapshot, setSnapshot]     = useState(null);
  const [snapshotTs, setSnapshotTs] = useState('');

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    const puuid   = sessionStorage.getItem('atlas_puuid');
    const region  = sessionStorage.getItem('atlas_region') || 'NA1';

    // matchId can come from URL param or from selected match details in sessionStorage
    const matchIdParam  = searchParams.get('matchId');
    const gameNumParam  = searchParams.get('game') || '1';
    const tsParam       = searchParams.get('ts');

    // Try to resolve matchId from sessionStorage if not in URL
    let matchId = matchIdParam;
    if (!matchId) {
      try {
        const details = JSON.parse(sessionStorage.getItem('atlas_selected_match_details') || '[]');
        const idx     = Math.max(0, Number.parseInt(gameNumParam, 10) - 1);
        matchId       = details[idx]?.id || details[0]?.id || null;
      } catch {
        matchId = null;
      }
    }

    if (!puuid || !matchId) {
      setError('Missing match data. Go back and select matches first.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res  = await fetch(
          `/api/drill-down?matchId=${encodeURIComponent(matchId)}&puuid=${encodeURIComponent(puuid)}&region=${encodeURIComponent(region)}&gameNumber=${encodeURIComponent(gameNumParam)}`,
        );
        const data = await res.json();

        if (!res.ok || !data.success) {
          if (!cancelled) setError(data.message || 'Could not load match data.');
          return;
        }

        if (!cancelled) {
          setGame(data.game);

          // If arriving from a specific timestamp, open that snapshot
          if (tsParam && data.game.snapshots?.[tsParam]) {
            setSnapshot(data.game.snapshots[tsParam]);
            setSnapshotTs(tsParam);
            // Switch to correct tab
            const tabIdx = TAB_KEYS.findIndex(key =>
              data.game.tabs[key]?.some(c => c.timestamp === tsParam),
            );
            if (tabIdx >= 0) setActiveTab(tabIdx);
          }
        }
      } catch {
        if (!cancelled) setError('Failed to load match data. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [searchParams]);

  // ── Snapshot interaction ───────────────────────────────────
  const openSnapshot = useCallback((ts) => {
    if (!game) return;
    const snap = game.snapshots?.[ts];
    if (snap) {
      setSnapshot(snap);
      setSnapshotTs(ts);
    }
  }, [game]);

  function handleCardClick(card) {
    if (snapshotTs === card.timestamp) {
      setSnapshot(null);
      setSnapshotTs('');
    } else {
      openSnapshot(card.timestamp);
    }
  }

  // ── Loading / error states ─────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <Nav riotId={riotId} />
        <main className={styles.main}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 80 }}>
            <div className={styles.loadingSpinner} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading match data…</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className={styles.page}>
        <Nav riotId={riotId} />
        <main className={styles.main}>
          <div style={{ textAlign: 'center', marginTop: 80 }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>{error || 'No match data available.'}</p>
            <button className={styles.btnBack} onClick={() => router.push('/matches')} type="button">
              ← Back to matches
            </button>
          </div>
        </main>
      </div>
    );
  }

  const g            = game;
  const currentCards = g.tabs[TAB_KEYS[activeTab]] || [];

  return (
    <div className={styles.page}>
      <Nav riotId={riotId} />

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
              {g.queue} &nbsp;·&nbsp; <span>{g.duration}</span> &nbsp;·&nbsp; {g.role} &nbsp;·&nbsp; <span>{g.matchId}</span>
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
              {snapshot ? `Snapshot — ${snapshotTs}` : 'Spatial view — this game'}
            </div>
            <div className={styles.mapCanvas}>
              <GameMap snapshot={snapshot} allGame={g.allGameSnapshot} />
            </div>
          </div>

          {/* Stats */}
          <div className={styles.statsBlock}>
            <span className={styles.blockLabel}>Game stats</span>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>KDA</span>
                <span className={`${styles.statVal} ${styles.colorRed}`}>{g.kda}</span>
                <span className={styles.statSub}>this game</span>
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
                <span className={styles.statSub}>{g.queue}</span>
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
              <button
                className={styles.snapshotClose}
                onClick={() => { setSnapshot(null); setSnapshotTs(''); }}
                type="button"
              >✕</button>
            </div>
            <p className={styles.snapshotText}>
              {currentCards.find(c => c.timestamp === snapshotTs)?.text
                || 'No additional context for this timestamp.'}
            </p>
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

export default function DrillDownPage() {
  return (
    <Suspense fallback={<div>Loading Page...</div>}>
      <DrillDownContent />
    </Suspense>
  );
}

function Nav({ riotId }) {
  return (
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
  );
}
