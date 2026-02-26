import { useState, useRef } from 'react';
import { scrapeOrg } from '../lib/scraper.ts';
import type { ScrapeProgress, ScrapeState, ScrapedFile } from '../lib/types.ts';

const STATE_KEY = 'doc-slurp:state';

interface Props {
  running: boolean;
  onStart: () => void;
  onProgress: (p: ScrapeProgress) => void;
  onDone: (files: ScrapedFile[]) => void;
}

export default function OrgScraper({ running, onStart, onProgress, onDone }: Props) {
  const [org, setOrg] = useState(() => localStorage.getItem('doc-slurp:org') ?? '');
  const [token, setToken] = useState(() => localStorage.getItem('doc-slurp:token') ?? '');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org.trim()) return;

    setError(null);
    abortRef.current = false;
    onStart();

    localStorage.setItem('doc-slurp:org', org.trim());
    if (token) localStorage.setItem('doc-slurp:token', token);

    // Load incremental state from localStorage
    let prevState: ScrapeState = { repos: {} };
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) prevState = JSON.parse(raw) as ScrapeState;
    } catch {
      // ignore corrupt state
    }

    try {
      const { files, state } = await scrapeOrg(
        {
          org: org.trim(),
          token: token || undefined,
          onProgress,
        },
        prevState,
      );

      // Persist updated state for next incremental run
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      onDone(files);
    } catch (err) {
      setError((err as Error).message);
      onDone([]);
    }
  };

  const handleClearState = () => {
    localStorage.removeItem(STATE_KEY);
    alert('Incremental cache cleared. Next scrape will fetch all files.');
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="org">GitHub Organisation</label>
        <input
          id="org"
          type="text"
          placeholder="e.g. my-org"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          disabled={running}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="token">
          GitHub Token <span style={{ fontWeight: 'normal' }}>(optional – increases rate limit)</span>
        </label>
        <input
          id="token"
          type="password"
          placeholder="ghp_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={running}
          autoComplete="off"
        />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="submit" disabled={running || !org.trim()}>
          {running ? 'Scraping…' : 'Start Scrape'}
        </button>
        <button type="button" onClick={handleClearState} disabled={running} style={{ background: '#666' }}>
          Clear Cache
        </button>
      </div>

      {error && <p className="error" style={{ marginTop: '0.75rem' }}>Error: {error}</p>}
    </form>
  );
}
