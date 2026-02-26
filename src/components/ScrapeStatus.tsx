import type { ScrapeProgress } from '../lib/types.ts';

interface Props {
  progress: ScrapeProgress;
}

const PHASE_LABELS: Record<ScrapeProgress['phase'], string> = {
  repos: 'Listing repositories',
  tree: 'Walking file trees',
  files: 'Fetching files',
  done: 'Done',
  error: 'Error',
};

export default function ScrapeStatus({ progress }: Props) {
  const pct = progress.total > 0 ? Math.round(((progress.fetched + progress.skipped) / progress.total) * 100) : 0;

  return (
    <div style={{ margin: '1.5rem 0' }}>
      <strong>{PHASE_LABELS[progress.phase]}</strong>
      {progress.repo && <span style={{ marginLeft: '0.5rem', color: '#666' }}>— {progress.repo}</span>}

      {progress.total > 0 && (
        <>
          <div className="progress-bar-outer">
            <div className="progress-bar-inner" style={{ width: `${pct}%` }} />
          </div>
          <p className="status-message">
            {progress.fetched} fetched · {progress.skipped} skipped · {progress.total} total ({pct}%)
          </p>
        </>
      )}

      {progress.message && <p className="status-message">{progress.message}</p>}

      {progress.phase === 'done' && (
        <p className="success">
          ✓ Scrape complete — {progress.fetched} files fetched, {progress.skipped} unchanged files skipped.
        </p>
      )}
    </div>
  );
}
