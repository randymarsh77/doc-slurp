import { useState, useCallback } from 'react';
import OrgScraper from './components/OrgScraper.tsx';
import ScrapeStatus from './components/ScrapeStatus.tsx';
import RepoList from './components/RepoList.tsx';
import type { ScrapeProgress, ScrapedFile } from './lib/types.ts';

export default function App() {
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [results, setResults] = useState<ScrapedFile[]>([]);
  const [running, setRunning] = useState(false);

  const handleProgress = useCallback((p: ScrapeProgress) => {
    setProgress(p);
  }, []);

  const handleDone = useCallback((files: ScrapedFile[]) => {
    setResults(files);
    setRunning(false);
  }, []);

  const handleStart = useCallback(() => {
    setResults([]);
    setProgress(null);
    setRunning(true);
  }, []);

  return (
    <>
      <h1>🗂 doc-slurp</h1>
      <p>Ingest all markdown files from a GitHub organisation and build a searchable Docusaurus site.</p>

      <OrgScraper onStart={handleStart} onProgress={handleProgress} onDone={handleDone} running={running} />

      {progress && <ScrapeStatus progress={progress} />}

      {results.length > 0 && (
        <>
          <h2>Scraped files ({results.length})</h2>
          <RepoList files={results} />
        </>
      )}
    </>
  );
}
