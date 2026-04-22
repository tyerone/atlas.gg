'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AtlasLogo from '@/components/AtlasLogo';
import styles from './matches.module.css';

// ─── CHAMPION NAME MAP ────────────────────────────────────────
// Data Dragon uses slightly different names for some champions.
// Add more here if needed.
const CHAMP_NAME_MAP = {
  'Wukong':           'MonkeyKing',
  'Nunu & Willump':   'Nunu',
  'Renata Glasc':     'Renata',
  "Bel'Veth":         'Belveth',
  "Cho'Gath":         'Chogath',
  "Kai'Sa":           'Kaisa',
  "Kha'Zix":          'Khazix',
  "Kog'Maw":          'KogMaw',
  "LeBlanc":          'Leblanc',
  "Rek'Sai":          'RekSai',
  "Vel'Koz":          'Velkoz',
  "K'Sante":          'KSante',
  "Aurelion Sol":     'AurelionSol',
  "Jarvan IV":        'JarvanIV',
  "Lee Sin":          'LeeSin',
  "Master Yi":        'MasterYi',
  "Miss Fortune":     'MissFortune',
  "Tahm Kench":       'TahmKench',
  "Twisted Fate":     'TwistedFate',
  "Xin Zhao":         'XinZhao',
};

function getDDragonName(champion) {
  return CHAMP_NAME_MAP[champion] || champion.replace(/\s/g, '').replace(/['.]/g, '');
}

const ROLES    = ['All', 'Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const QUEUES   = ['All', 'Ranked Solo', 'Flex'];
const MAX_MATCHES = 10;

// ─── CHAMPION ICON ───────────────────────────────────────────
function ChampIcon({ champion, patch }) {
  const [imgFailed, setImgFailed] = useState(false);
  const ddName = getDDragonName(champion);
  const src = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${ddName}.png`;

  return (
    <div className={styles.champIcon}>
      {!imgFailed ? (
        <img
          src={src}
          alt={champion}
          width={44}
          height={44}
          onError={() => setImgFailed(true)}
          className={styles.champImg}
        />
      ) : (
        <span className={styles.champFallback}>
          {champion.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────
export default function MatchesPage() {
  const router = useRouter();
  const [riotId] = useState(
    () => (typeof window !== 'undefined' ? (sessionStorage.getItem('atlas_riot_id') || 'Not connected') : 'Not connected'),
  );
  const [patch, setPatch]             = useState('14.8.1'); // fallback patch
  const [matches, setMatches]         = useState([]);
  const [selected, setSelected]       = useState([]);
  const [roleFilter, setRoleFilter]   = useState('All');
  const [queueFilter, setQueueFilter] = useState('All');
  const [champion, setChampion]       = useState('');
  const [loading, setLoading]         = useState(true);
  const [analyzing, setAnalyzing]     = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    const puuid = sessionStorage.getItem('atlas_puuid');
    const region = sessionStorage.getItem('atlas_region') || 'NA1';

    fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then((r) => r.json())
      .then((versions) => setPatch(versions[0]))
      .catch(() => {});

    if (!puuid) {
      setTimeout(() => {
        setError('No connected Riot account found. Go back to Connect first.');
        setLoading(false);
      }, 0);
      return;
    }

    let cancelled = false;

    async function loadMatches() {
      try {
        setError('');
        const response = await fetch(
          `/api/matches?puuid=${encodeURIComponent(puuid)}&region=${encodeURIComponent(region)}&count=10`,
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
          if (!cancelled) {
            setError(data.message || 'Could not load matches from Riot API.');
            setMatches([]);
          }
          return;
        }

        if (!cancelled) {
          setMatches(data.matches || []);
          sessionStorage.setItem('atlas_recent_matches', JSON.stringify(data.matches || []));
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load matches. Please try again.');
          setMatches([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMatches();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = matches.filter(m => {
    if (roleFilter !== 'All'  && m.role !== roleFilter)                              return false;
    if (queueFilter !== 'All' && m.queue !== queueFilter)                            return false;
    if (champion && !m.champion.toLowerCase().includes(champion.toLowerCase()))      return false;
    return true;
  });

  function toggleSelect(id) {
    setSelected(prev => {
      if (prev.includes(id))              return prev.filter(x => x !== id);
      if (prev.length >= MAX_MATCHES)     return prev;
      return [...prev, id];
    });
  }

  async function handleAnalyze() {
    if (selected.length < 2) return;
    setAnalyzing(true);
    const selectedDetails = matches.filter((match) => selected.includes(match.id));
    sessionStorage.setItem('atlas_selected_matches', JSON.stringify(selected));
    sessionStorage.setItem('atlas_selected_match_details', JSON.stringify(selectedDetails));
    router.push('/report');
  }

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
          <li><Link href="/matches" className={styles.active}>Matches</Link></li>
          <li><Link href="/report">Report</Link></li>
        </ul>
        <div className={styles.navUser}>{riotId}</div>
      </nav>

      {/* ── STEPS ── */}
      <div className={styles.stepsBar}>
        <div className={styles.steps}>
          <div className={`${styles.step} ${styles.stepDone}`}>
            <div className={styles.stepNum}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className={styles.stepLabel}>Connect</span>
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${styles.stepActive}`}>
            <div className={styles.stepNum}>2</div>
            <span className={styles.stepLabel}>Select matches</span>
          </div>
          <div className={styles.stepLine} />
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <span className={styles.stepLabel}>View report</span>
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.eyebrow}>
              <div className={styles.eyebrowDot} />
              <span className={styles.eyebrowText}>Step 2 of 3</span>
            </div>
            <h1 className={styles.heading}>Select your matches</h1>
            <p className={styles.subheading}>
              Pick 2–10 games to analyze. More games = stronger cross-game patterns.
            </p>
          </div>

          <button
            className={`${styles.btnAnalyze} ${selected.length < 2 ? styles.btnDisabled : ''} ${analyzing ? styles.btnLoading : ''}`}
            onClick={handleAnalyze}
            disabled={selected.length < 2 || analyzing}
            type="button"
          >
            {analyzing ? (
              <span className={styles.spinner} />
            ) : (
              <>Analyze {selected.length > 0 ? `${selected.length} ` : ''}{selected.length === 1 ? 'replay' : 'replays'} →</>
            )}
          </button>
        </div>

        {/* Progress bar */}
        <div className={styles.progressSection}>
          <div className={styles.progressMeta}>
            <span className={styles.progressLabel}>{selected.length} selected</span>
            <span className={styles.progressHint}>
              {selected.length < 2
                ? `Add ${2 - selected.length} more to analyze`
                : selected.length >= MAX_MATCHES
                ? 'Maximum reached'
                : `${MAX_MATCHES - selected.length} more slots available`}
            </span>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min((selected.length / MAX_MATCHES) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Role</span>
            <div className={styles.filterPills}>
              {ROLES.map(r => (
                <button
                  key={r}
                  className={`${styles.filterPill} ${roleFilter === r ? styles.filterPillActive : ''}`}
                  onClick={() => setRoleFilter(r)}
                  type="button"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Queue</span>
            <div className={styles.filterPills}>
              {QUEUES.map(q => (
                <button
                  key={q}
                  className={`${styles.filterPill} ${queueFilter === q ? styles.filterPillActive : ''}`}
                  onClick={() => setQueueFilter(q)}
                  type="button"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search champion"
              value={champion}
              onChange={e => setChampion(e.target.value)}
              className={styles.searchInput}
              spellCheck={false}
            />
          </div>
        </div>

        {/* Match list */}
        <div className={styles.matchList}>
          {error ? (
            <div className={styles.emptyState}>
              <p>{error}</p>
            </div>
          ) : loading ? (
            <div className={styles.loadingState}>
              <span className={styles.loadingSpinner} />
              <p>Loading your match history...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No matches found for these filters.</p>
            </div>
          ) : (
            filtered.map(match => {
              const isSelected = selected.includes(match.id);
              const isDisabled = !isSelected && selected.length >= MAX_MATCHES;
              return (
                <div
                  key={match.id}
                  className={`${styles.matchCard} ${isSelected ? styles.matchCardSelected : ''} ${isDisabled ? styles.matchCardDisabled : ''}`}
                  onClick={() => !isDisabled && toggleSelect(match.id)}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && !isDisabled && toggleSelect(match.id)}
                >
                  {/* Result bar */}
                  <div className={`${styles.resultBar} ${match.result === 'Win' ? styles.resultWin : styles.resultLoss}`} />

                  {/* Champion icon — Data Dragon CDN */}
                  <ChampIcon champion={match.champion} patch={patch} />

                  {/* Match info */}
                  <div className={styles.matchInfo}>
                    <div className={styles.matchTop}>
                      <span className={styles.champName}>{match.champion}</span>
                      <span className={`${styles.resultBadge} ${match.result === 'Win' ? styles.badgeWin : styles.badgeLoss}`}>
                        {match.result}
                      </span>
                      <span className={styles.queueBadge}>{match.queue}</span>
                    </div>
                    <div className={styles.matchMeta}>
                      <span>{match.kda} KDA</span>
                      <span className={styles.metaDot}>·</span>
                      <span>{match.cs} CS</span>
                      <span className={styles.metaDot}>·</span>
                      <span>{match.duration}</span>
                      <span className={styles.metaDot}>·</span>
                      <span>{match.role}</span>
                    </div>
                  </div>

                  {/* Checkbox */}
                  <div className={`${styles.checkbox} ${isSelected ? styles.checkboxSelected : ''}`}>
                    {isSelected && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </main>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <p>atlas.gg &mdash; spatial replay analysis &mdash; stormforge 2026 &mdash; not endorsed by riot games</p>
      </footer>

    </div>
  );
}