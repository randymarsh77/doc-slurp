import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';

const ThrottledOctokit = Octokit.plugin(throttling);

export function createOctokit(token?: string): InstanceType<typeof ThrottledOctokit> {
  return new ThrottledOctokit({
    auth: token,
    throttle: {
      onRateLimit(retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) {
        console.warn(
          `Rate limit hit for ${options.method} ${options.url}. ` +
            `Retrying after ${retryAfter}s (retry #${retryCount}).`,
        );
        return retryCount < 3;
      },
      onSecondaryRateLimit(retryAfter: number, options: { method: string; url: string }) {
        console.warn(
          `Secondary rate limit hit for ${options.method} ${options.url}. ` +
            `Retrying after ${retryAfter}s.`,
        );
        return true;
      },
    },
  });
}

export async function listOrgRepos(
  octokit: ReturnType<typeof createOctokit>,
  org: string,
): Promise<Array<{ name: string; full_name: string; default_branch: string }>> {
  const repos: Array<{ name: string; full_name: string; default_branch: string }> = [];
  for await (const { data } of octokit.paginate.iterator(octokit.rest.repos.listForOrg, {
    org,
    per_page: 100,
    type: 'all',
  })) {
    for (const repo of data) {
      repos.push({
        name: repo.name,
        full_name: repo.full_name,
        default_branch: repo.default_branch ?? 'HEAD',
      });
    }
  }
  return repos;
}

export async function getRepoTree(
  octokit: ReturnType<typeof createOctokit>,
  owner: string,
  repo: string,
  branch: string,
): Promise<Array<{ path: string; sha: string; type: string }>> {
  const { data } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: '1',
  });
  if (data.truncated) {
    console.warn(`Tree for ${owner}/${repo} was truncated by the GitHub API.`);
  }
  return (data.tree as Array<{ path?: string; sha?: string; type?: string }>)
    .filter((item) => item.type === 'blob' && item.path?.endsWith('.md'))
    .map((item) => ({ path: item.path!, sha: item.sha!, type: item.type! }));
}

export async function getFileContent(
  octokit: ReturnType<typeof createOctokit>,
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  });
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`Expected a file at ${path} in ${owner}/${repo}`);
  }
  // GitHub returns base64-encoded content
  return Buffer.from(data.content, 'base64').toString('utf-8');
}
