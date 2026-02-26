import { createOctokit, listOrgRepos, getRepoTree, getFileContent } from './github.js';
import type { ScrapeConfig, ScrapeState, ScrapeProgress, ScrapedFile } from './types.js';

/**
 * Incrementally scrape all .md files from a GitHub organisation.
 *
 * Files whose git blob SHA has not changed since the last run are skipped to
 * avoid redundant API calls.  Rate limiting is handled automatically by the
 * Octokit throttling plugin.
 *
 * @param config    Scrape configuration (org, token, optional filter, progress cb).
 * @param prevState Previously persisted state used for incremental diffing.
 * @returns         Newly scraped files and the updated state for persistence.
 */
export async function scrapeOrg(
  config: ScrapeConfig,
  prevState: ScrapeState = { repos: {} },
): Promise<{ files: ScrapedFile[]; state: ScrapeState }> {
  const { org, token, repoFilter, onProgress } = config;

  const emit = (p: Partial<ScrapeProgress> & { phase: ScrapeProgress['phase'] }) => {
    onProgress?.({
      fetched: 0,
      skipped: 0,
      total: 0,
      ...p,
    });
  };

  const octokit = createOctokit(token);
  const newState: ScrapeState = { repos: {}, lastScrape: new Date().toISOString() };
  const results: ScrapedFile[] = [];

  // ── 1. List repos ──────────────────────────────────────────────────────────
  emit({ phase: 'repos', message: `Listing repositories for ${org}…` });
  const allRepos = await listOrgRepos(octokit, org);
  const repos = repoFilter ? allRepos.filter((r) => repoFilter.test(r.name)) : allRepos;

  let totalFetched = 0;
  let totalSkipped = 0;
  let totalFiles = 0;

  // ── 2. Per-repo tree walk ──────────────────────────────────────────────────
  for (const repo of repos) {
    const [owner, repoName] = repo.full_name.split('/');
    emit({ phase: 'tree', repo: repo.full_name, fetched: totalFetched, skipped: totalSkipped, total: totalFiles });

    let mdFiles: Array<{ path: string; sha: string; type: string }>;
    try {
      mdFiles = await getRepoTree(octokit, owner, repoName, repo.default_branch);
    } catch (err) {
      console.warn(`Skipping ${repo.full_name}: ${(err as Error).message}`);
      continue;
    }

    totalFiles += mdFiles.length;
    newState.repos[repo.full_name] = { files: {} };

    // ── 3. Per-file incremental fetch ────────────────────────────────────────
    for (const file of mdFiles) {
      const prevEntry = prevState.repos[repo.full_name]?.files[file.path];
      newState.repos[repo.full_name].files[file.path] = {
        sha: file.sha,
        lastFetched: prevEntry?.sha === file.sha ? (prevEntry.lastFetched ?? Date.now()) : Date.now(),
      };

      if (prevEntry?.sha === file.sha) {
        totalSkipped++;
        emit({ phase: 'files', repo: repo.full_name, fetched: totalFetched, skipped: totalSkipped, total: totalFiles });
        continue;
      }

      emit({
        phase: 'files',
        repo: repo.full_name,
        fetched: totalFetched,
        skipped: totalSkipped,
        total: totalFiles,
        message: `Fetching ${repo.full_name}/${file.path}`,
      });

      try {
        const content = await getFileContent(octokit, owner, repoName, file.path);
        results.push({ repo: repo.full_name, path: file.path, content, sha: file.sha });
        totalFetched++;
      } catch (err) {
        console.warn(`Failed to fetch ${repo.full_name}/${file.path}: ${(err as Error).message}`);
      }
    }
  }

  emit({ phase: 'done', fetched: totalFetched, skipped: totalSkipped, total: totalFiles });
  return { files: results, state: newState };
}
