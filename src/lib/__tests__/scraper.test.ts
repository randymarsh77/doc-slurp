import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeOrg } from '../scraper.js';
import type { ScrapeState } from '../types.js';

// ── Mock the github module ─────────────────────────────────────────────────

vi.mock('../github.js', () => ({
  createOctokit: vi.fn(() => ({})),
  listOrgRepos: vi.fn(async () => [
    { name: 'repo-a', full_name: 'test-org/repo-a', default_branch: 'main' },
    { name: 'repo-b', full_name: 'test-org/repo-b', default_branch: 'main' },
  ]),
  getRepoTree: vi.fn(async (_octokit: unknown, _owner: string, repo: string) => {
    if (repo === 'repo-a') {
      return [
        { path: 'README.md', sha: 'sha-readme-a', type: 'blob' },
        { path: 'docs/guide.md', sha: 'sha-guide-a', type: 'blob' },
      ];
    }
    return [{ path: 'README.md', sha: 'sha-readme-b', type: 'blob' }];
  }),
  getFileContent: vi.fn(async (_octokit: unknown, _owner: string, repo: string, filePath: string) => {
    return `# Content of ${repo}/${filePath}`;
  }),
}));

// ──────────────────────────────────────────────────────────────────────────

describe('scrapeOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches all md files when no previous state exists', async () => {
    const { files, state } = await scrapeOrg({ org: 'test-org' });

    expect(files).toHaveLength(3);
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining(['README.md', 'docs/guide.md', 'README.md']),
    );
    expect(state.lastScrape).toBeDefined();
    expect(Object.keys(state.repos)).toEqual(['test-org/repo-a', 'test-org/repo-b']);
  });

  it('skips files whose SHA has not changed (incremental scrape)', async () => {
    const prevState: ScrapeState = {
      repos: {
        'test-org/repo-a': {
          files: {
            'README.md': { sha: 'sha-readme-a', lastFetched: Date.now() - 1000 },
            'docs/guide.md': { sha: 'sha-guide-a', lastFetched: Date.now() - 1000 },
          },
        },
        'test-org/repo-b': {
          files: {},
        },
      },
    };

    const { files, state } = await scrapeOrg({ org: 'test-org' }, prevState);

    // Only repo-b/README.md should be fetched (new SHA not in cache)
    expect(files).toHaveLength(1);
    expect(files[0]!.repo).toBe('test-org/repo-b');
    expect(files[0]!.path).toBe('README.md');

    // State should record all files
    expect(Object.keys(state.repos['test-org/repo-a']!.files)).toHaveLength(2);
  });

  it('re-fetches files whose SHA has changed', async () => {
    const prevState: ScrapeState = {
      repos: {
        'test-org/repo-a': {
          files: {
            'README.md': { sha: 'old-sha', lastFetched: Date.now() - 5000 },
            'docs/guide.md': { sha: 'sha-guide-a', lastFetched: Date.now() - 5000 },
          },
        },
      },
    };

    const { files } = await scrapeOrg({ org: 'test-org' }, prevState);

    // README.md in repo-a has a new SHA → should be fetched
    const readmeA = files.find((f) => f.repo === 'test-org/repo-a' && f.path === 'README.md');
    expect(readmeA).toBeDefined();
    expect(readmeA!.sha).toBe('sha-readme-a');
  });

  it('emits progress events during scraping', async () => {
    const events: string[] = [];
    await scrapeOrg({
      org: 'test-org',
      onProgress: (p) => events.push(p.phase),
    });

    expect(events).toContain('repos');
    expect(events).toContain('files');
    expect(events[events.length - 1]).toBe('done');
  });

  it('applies repoFilter to skip non-matching repos', async () => {
    const { files } = await scrapeOrg({ org: 'test-org', repoFilter: /^repo-a$/ });

    // Only files from repo-a
    for (const f of files) {
      expect(f.repo).toBe('test-org/repo-a');
    }
    expect(files).toHaveLength(2);
  });
});
