export interface FileEntry {
  /** Git blob SHA – used to detect if the file has changed since last scrape. */
  sha: string;
  /** Unix timestamp (ms) when this file was last fetched. */
  lastFetched: number;
}

export interface RepoCache {
  /** Map of file path → cache entry. */
  files: Record<string, FileEntry>;
}

export interface ScrapeState {
  /** Map of repo full name (owner/repo) → per-repo cache. */
  repos: Record<string, RepoCache>;
  /** ISO timestamp of the last successful scrape. */
  lastScrape?: string;
}

export interface ScrapedFile {
  repo: string;
  path: string;
  content: string;
  sha: string;
}

export interface ScrapeProgress {
  phase: 'repos' | 'tree' | 'files' | 'done' | 'error';
  repo?: string;
  fetched: number;
  skipped: number;
  total: number;
  message?: string;
}

export interface ScrapeConfig {
  org: string;
  token?: string;
  /** Only include repos whose names match this pattern (optional). */
  repoFilter?: RegExp;
  /** Callback fired on each progress update. */
  onProgress?: (p: ScrapeProgress) => void;
}
