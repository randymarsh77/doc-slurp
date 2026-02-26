import type { ScrapedFile } from '../lib/types.ts';

interface Props {
  files: ScrapedFile[];
}

interface RepoGroup {
  repo: string;
  files: ScrapedFile[];
}

function groupByRepo(files: ScrapedFile[]): RepoGroup[] {
  const map = new Map<string, ScrapedFile[]>();
  for (const f of files) {
    if (!map.has(f.repo)) map.set(f.repo, []);
    map.get(f.repo)!.push(f);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, repoFiles]) => ({ repo, files: repoFiles }));
}

export default function RepoList({ files }: Props) {
  const groups = groupByRepo(files);

  return (
    <>
      {groups.map(({ repo, files: repoFiles }) => (
        <div key={repo} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>
            {repo} <span className="badge">{repoFiles.length} files</span>
          </h3>
          <ul className="repo-list">
            {repoFiles.map((f) => (
              <li key={f.path}>
                <code>{f.path}</code>
                <span style={{ color: '#999', fontSize: '0.75rem' }}>{f.sha.slice(0, 7)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
