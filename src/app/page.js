'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AtlasLogo from '@/components/AtlasLogo';
import styles from './page.module.css';

export default function EntryPage() {
  const router = useRouter();
  const [riotId, setRiotId] = useState('');
  const [region, setRegion] = useState('NA1');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectedId, setConnectedId] = useState('');

  const regions = ['NA1', 'EUW1', 'EUNE1', 'KR', 'OCE1', 'BR1', 'JP1'];

  function validateRiotId(value) {
    return /^[^#]{3,16}#[A-Za-z0-9]{3,5}$/.test(value.trim());
  }

  async function handleConnect() {
    setError('');

    if (!riotId.trim()) {
      setError('Enter your Riot ID in the format Playername#TAG');
      return;
    }

    if (!validateRiotId(riotId)) {
      setError('Invalid format — use Playername#TAG (e.g. Atlas#NA1)');
      return;
    }

    const id = riotId.trim();
    setLoading(true);

    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riotId: id, region }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || 'Riot ID not found. Check your tag and region.');
        return;
      }

      sessionStorage.setItem('atlas_puuid', data.puuid);
      sessionStorage.setItem('atlas_riot_id', data.riotId || id);
      sessionStorage.setItem('atlas_region', data.platformRegion || region);

      setConnectedId(data.riotId || id);
      setConnected(true);

    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleConnect();
  }

  function handleInputChange(e) {
    setRiotId(e.target.value);
    if (error) setError('');
  }

  const gameName = connectedId.split('#')[0];

  return (
    <div className={styles.page}>

      {/* ── NAV ── */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo} aria-label="Atlas.gg home">
          <AtlasLogo width={26} height={23} />
          <span className={styles.navLogoText}>
            atlas.<span>gg</span>
          </span>
        </Link>

        <ul className={styles.navLinks}>
          <li><Link href="/" className={styles.active}>Connect</Link></li>
          <li><Link href="/matches">Matches</Link></li>
          <li><Link href="/report">Report</Link></li>
        </ul>

        {connected && (
          <div className={styles.navUser}>{connectedId}</div>
        )}
      </nav>

      {/* ── MAIN ── */}
      <main className={styles.main}>
        <div className={styles.card}>

          {/* Eyebrow */}
          <div className={styles.eyebrow}>
            <div className={styles.eyebrowDot} />
            <span className={styles.eyebrowText}>League of Legends</span>
          </div>

          {/* Heading */}
          <h1 className={styles.heading}>
            Your replays,<br />
            <span>finally make sense</span>
          </h1>
          <p className={styles.subheading}>
            Enter your Riot ID to get started. No account needed —
            just your ID and we&apos;ll handle the rest.
          </p>

          {!connected ? (
            /* ── FORM ── */
            <div className={styles.form}>

              {/* Input */}
              <div className={`${styles.inputWrap} ${error ? styles.inputError : ''}`}>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Playername#NA1"
                  value={riotId}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  aria-label="Riot ID"
                />
                <div className={styles.inputIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className={styles.errorMsg} role="alert">{error}</p>
              )}

              {/* Region */}
              <div className={styles.regionSection}>
                <div className={styles.regionDivider}>
                  <div className={styles.regionLine} />
                  <span className={styles.regionLabel}>Region</span>
                  <div className={styles.regionLine} />
                </div>
                <div className={styles.regionPills} role="group" aria-label="Select region">
                  {regions.map((r) => (
                    <button
                      key={r}
                      className={`${styles.regionPill} ${region === r ? styles.regionPillSelected : ''}`}
                      onClick={() => setRegion(r)}
                      type="button"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Connect button */}
              <button
                className={`${styles.btnConnect} ${loading ? styles.btnLoading : ''}`}
                onClick={handleConnect}
                disabled={loading}
                type="button"
              >
                {loading ? (
                  <span className={styles.spinner} aria-label="Connecting..." />
                ) : (
                  'Connect Riot ID'
                )}
              </button>

              {/* Hint */}
              <p className={styles.hint}>
                No account needed &mdash; <em>no password, no signup</em><br />
                We fetch your match history via the official Riot API
              </p>

            </div>
          ) : (
            /* ── SUCCESS STATE ── */
            <div className={styles.successState} aria-live="polite">
              <div className={styles.successIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className={styles.successLabel}>
                Connected as <strong>{gameName}</strong>
              </p>
              <div className={styles.successPill}>{connectedId}</div>
              <button
                className={styles.btnNext}
                onClick={() => router.push('/matches')}
                type="button"
              >
                View your matches →
              </button>
            </div>
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