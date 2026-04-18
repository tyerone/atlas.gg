'use client';

import { useState, useEffect } from 'react';
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

// ─── MOCK DATA ───────────────────────────────────────────────
const MOCK_MATCHES = [
  { id: 'NA1-5823901234', champion: 'Jinx',      role: 'ADC',     result: 'Win',  duration: '32m', kda: '8/3/11',  cs: 234, queue: 'Ranked Solo' },
  { id: 'NA1-5823891122', champion: 'Jinx',      role: 'ADC',     result: 'Loss', duration: '28m', kda: '3/8/4',   cs: 187, queue: 'Ranked Solo' },
  { id: 'NA1-5823801045', champion: 'Caitlyn',   role: 'ADC',     result: 'Win',  duration: '41m', kda: '12/4/7',  cs: 301, queue: 'Ranked Solo' },
  { id: 'NA1-5823756789', champion: 'Jinx',      role: 'ADC',     result: 'Loss', duration: '24m', kda: '2/6/3',   cs: 143, queue: 'Ranked Solo' },
  { id: 'NA1-5823698234', champion: 'Jinx',      role: 'ADC',     result: 'Win',  duration: '35m', kda: '9/2/14',  cs: 267, queue: 'Ranked Solo' },
  { id: 'NA1-5823645001', champion: 'Xayah',     role: 'ADC',     result: 'Win',  duration: '38m', kda: '7/4/9',   cs: 245, queue: 'Ranked Solo' },
  { id: 'NA1-5823590112', champion: 'Caitlyn',   role: 'ADC',     result: 'Loss', duration: '22m', kda: '1/7/2',   cs: 112, queue: 'Flex'        },
  { id: 'NA1-5823534567', champion: 'Jinx',      role: 'ADC',     result: 'Win',  duration: '29m', kda: '6/3/8',   cs: 198, queue: 'Ranked Solo' },
  { id: 'NA1-5823478923', champion: 'Jhin',      role: 'ADC',     result: 'Loss', duration: '33m', kda: '4/5/6',   cs: 221, queue: 'Ranked Solo' },
  { id: 'NA1-5823412345', champion: 'Jinx',      role: 'ADC',     result: 'Win',  duration: '27m', kda: '11/1/6',  cs: 189, queue: 'Flex'        },
];

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
  const [riotId, setRiotId]           = useState('');
  const [patch, setPatch]             = useState('14.8.1'); // fallback patch
  const [matches, setMatches]         = useState([]);
  const [selected, setSelected]       = useState([]);
  const [roleFilter, setRoleFilter]   = useState('All');
  const [queueFilter, setQueueFilter] = useState('All');
  const [champion, setChampion]       = useState('');
  const [loading, setLoading]         = useState(true);
  const [analyzing, setAnalyzing]     = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('atlas_riot_id') || 'Playername#NA1';
    setRiotId(id);

    // Fetch latest patch version from Data Dragon
    fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then(r => r.json())
      .then(versions => setPatch(versions[0]))
      .catch(() => {}); // keep fallback if fetch fails

    /*
      BACKEND INTEGRATION — replace mock with real API call:

      fetch(`/api/matches?puuid=${sessionStorage.getItem('atlas_puuid')}&region=${sessionStorage.getItem('atlas_region')}`)
        .then(r => r.json())
        .then(data => {
          setMatches(data.matches);
          setLoading(false);
        });

      RIOT API ENDPOINTS (call server-side):
      1. GET https://{regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids
         ?queue=420&count=20
      2. For each matchId:
         GET https://{regional}.api.riotgames.com/lol/match/v5/matches/{matchId}
    */

    // MOCK — simulate API load
    setTimeout(() => {
      setMatches(MOCK_MATCHES);
      setLoading(false);
    }, 800);
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

    /*
      BACKEND INTEGRATION:
      await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchIds: selected,
          puuid: sessionStorage.getItem('atlas_puuid'),
          region: sessionStorage.getItem('atlas_region'),
        }),
      });
    */

    await new Promise(r => setTimeout(r, 600));
    sessionStorage.setItem('atlas_selected_matches', JSON.stringify(selected));
    router.push('/report');
  }

  return (
    <div className={styles.page}>

      {/* ── NAV ── */}
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo} aria-label="Atlas.gg home">
          <AtlasLogo width={26} height={23} />
          <span className={styles.navLogoText}>atlas.<span>gg</span></span>
        </a>
        <ul className={styles.navLinks}>
          <li><a href="/">Connect</a></li>
          <li><a href="/matches" className={styles.active}>Matches</a></li>
          <li><a href="/report">Report</a></li>
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
          {loading ? (
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