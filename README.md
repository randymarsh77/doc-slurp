# doc-slurp

> Ingest all Markdown files from a GitHub organisation, group them per repository, build a [Docusaurus](https://docusaurus.io) site with a **static search index**, and deploy it to **GitHub Pages** — with **incremental scraping** so only changed files are re-fetched.

---

## Features

| Feature | Details |
|---|---|
| **GitHub org scraping** | Fetches every `.md` file from every repo in a GitHub organisation using the GitHub REST API |
| **Per-repo grouping** | Files are organised under `docs/<owner/repo>/` so each repo becomes its own sidebar section |
| **Incremental scraping** | Git blob SHAs are cached in `scrape-state.json`; files with unchanged SHAs are skipped to save API quota |
| **Rate-limit handling** | Uses `@octokit/plugin-throttling` for automatic retry/back-off on GitHub rate-limit responses |
| **Static search index** | `@easyops-cn/docusaurus-search-local` generates a fully-offline, client-side search index at build time |
| **npm CLI** | Run `npx doc-slurp` from any repository or CI pipeline to produce deployable static-site artifacts |
| **GitHub Pages deployment** | Use the included reusable workflow or any static hosting provider |
| **React + TypeScript UI** | A Vite-powered admin app lets you interactively configure the org, enter a token, and inspect scrape results in the browser |

---

## Quick start

### Using `npx` (recommended — from any repo / CI)

```bash
# Scrape and build in one step
npx doc-slurp --org my-org --token ghp_xxx

# The built site is in ./build — deploy it anywhere
```

The CLI creates a deployable static site in `./build` by default.

### CLI reference

```
doc-slurp [command] [options]

Commands:
  scrape    Scrape markdown files from a GitHub organisation
  build     Generate Docusaurus config and build the static site
  (default) Run scrape followed by build

Options:
  --org            GitHub organisation to scrape        (env: GITHUB_ORG)
  --token          GitHub personal access token         (env: GITHUB_TOKEN)
  --repo-filter    Regex pattern to filter repo names   (env: REPO_FILTER)
  --out-dir        Output directory for built site      (default: ./build)
  --docs-dir       Directory for scraped markdown       (default: ./docs)
  --state-file     Path to incremental state JSON       (default: scrape-state.json)
  --site-title     Docusaurus navbar title              (env: SITE_TITLE, default: "doc-slurp")
  --site-url       Production site URL                  (env: SITE_URL)
  --base-url       Base URL path                        (env: BASE_URL, default: "/")
  -h, --help       Show this help message
```

#### Examples

```bash
# Scrape only (e.g. for caching between CI steps)
npx doc-slurp scrape --org my-org --token ghp_xxx --docs-dir ./docs

# Build only (after a previous scrape)
npx doc-slurp build --docs-dir ./docs --out-dir ./site

# Override site metadata
npx doc-slurp --org my-org --token ghp_xxx \
  --site-title "My Org Docs" \
  --site-url "https://my-org.github.io" \
  --base-url "/docs/"
```

---

## GitHub Actions (external repo)

Use the tool from any repository's CI pipeline:

```yaml
name: Build & Deploy Docs

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

permissions:
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Scrape & build docs
        run: npx doc-slurp --org my-org --out-dir ./site
        env:
          GITHUB_TOKEN: ${{ secrets.SCRAPE_GITHUB_TOKEN }}

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./site

      - name: Deploy to GitHub Pages
        uses: actions/deploy-pages@v4
```

For incremental scraping with caching between CI runs:

```yaml
      - name: Restore scrape state
        uses: actions/cache@v4
        with:
          path: scrape-state.json
          key: doc-slurp-state

      - name: Scrape & build
        run: npx doc-slurp --org my-org --out-dir ./site
        env:
          GITHUB_TOKEN: ${{ secrets.SCRAPE_GITHUB_TOKEN }}
```

---

## Local development

### Prerequisites

* Node.js ≥ 20
* A GitHub Personal Access Token with `repo:read` scope (optional but recommended to avoid the 60 req/hr unauthenticated limit)

### 1. Install

```bash
npm install
```

### 2. Run the admin UI (browser)

```bash
npm run dev
```

Open `http://localhost:5173`, enter your GitHub org name and (optionally) a token, then click **Start Scrape**.  
Scraped files and the incremental cache state are stored in `localStorage` — subsequent scrapes will skip unchanged files automatically.

### 3. Scrape from the command line (Node.js)

```bash
GITHUB_ORG=my-org GITHUB_TOKEN=ghp_xxx npm run scrape
```

Environment variables:

| Variable | Required | Description |
|---|---|---|
| `GITHUB_ORG` | ✅ | Organisation to scrape |
| `GITHUB_TOKEN` | ☐ | PAT for higher rate limits |
| `REPO_FILTER` | ☐ | Regex pattern — only matching repo names are scraped |
| `DOCS_OUT_DIR` | ☐ | Output directory (default: `website/docs`) |
| `STATE_FILE` | ☐ | Path to incremental state JSON (default: `scrape-state.json`) |

### 4. Build the documentation site

```bash
npm run docs:build
```

This runs `generate-config` (produces `website/docusaurus.config.ts` + `website/sidebars.ts` from the discovered repos) then invokes the Docusaurus build.

### 5. Preview locally

```bash
npm run docs:serve
```

---

## Architecture

```
doc-slurp/
├── src/                         # React + TypeScript admin UI (Vite)
│   ├── cli.ts                   # CLI entry-point (published as `doc-slurp` bin)
│   ├── lib/
│   │   ├── types.ts             # Shared TypeScript types
│   │   ├── github.ts            # Octokit wrapper (repo listing, tree walk, file fetch)
│   │   ├── scraper.ts           # Incremental scraping logic
│   │   └── generate-config.ts   # Docusaurus config / sidebar generation
│   └── components/
│       ├── OrgScraper.tsx       # Configuration form + scrape trigger
│       ├── ScrapeStatus.tsx     # Live progress display
│       └── RepoList.tsx         # Results grouped by repo
├── scripts/
│   ├── scrape.ts                # Dev CLI: scrape org → website/docs/
│   └── generate-config.ts      # Dev CLI: generate docusaurus.config.ts + sidebars.ts
├── website/                     # Docusaurus site (template)
│   ├── docs/                    # Generated — gitignored, populated by scrape script
│   ├── src/css/custom.css
│   ├── docusaurus.config.ts     # Generated by generate-config script
│   └── sidebars.ts              # Generated by generate-config script
└── .github/workflows/
    ├── scrape-and-deploy.yml    # Scheduled scrape + Pages deploy
    └── ci.yml                   # Lint / build / test on PR
```

---

## Incremental scraping

Every `.md` file discovered in the git tree has a **blob SHA** provided by GitHub at no API cost.  
The scraper compares this SHA against the value stored in `scrape-state.json`:

* **SHA unchanged** → file is skipped (no download, no API call beyond the tree fetch).
* **SHA changed / new file** → file content is fetched and written to disk.

The state file is persisted to the GitHub Actions cache between runs so the incremental benefit carries over across workflow executions.

---

## Development

```bash
npm run dev          # Start Vite dev server
npm run type-check   # TypeScript type-check (all source)
npm test             # Run Vitest unit tests
npm run build        # Production build of the React app
npm run build:cli    # Compile the CLI to dist-scripts/
```

