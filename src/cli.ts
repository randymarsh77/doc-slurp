#!/usr/bin/env node
/**
 * doc-slurp CLI
 *
 * Usage:
 *   doc-slurp [command] [options]
 *
 * Commands:
 *   scrape   Scrape markdown files from a GitHub org
 *   build    Generate Docusaurus config and build the site
 *   (none)   Run scrape + build (default)
 *
 * Options:
 *   --org            GitHub organisation to scrape (env: GITHUB_ORG)
 *   --token          GitHub personal access token (env: GITHUB_TOKEN)
 *   --repo-filter    Regex pattern to filter repo names (env: REPO_FILTER)
 *   --out-dir        Output directory for built site (default: ./build)
 *   --docs-dir       Directory for scraped docs (default: ./docs)
 *   --state-file     Path to incremental state JSON (default: scrape-state.json)
 *   --site-title     Docusaurus site title (env: SITE_TITLE, default: "doc-slurp")
 *   --site-url       Production site URL (env: SITE_URL, default: "https://example.github.io")
 *   --base-url       Base URL path (env: BASE_URL, default: "/")
 *   --help, -h       Show this help message
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scrapeOrg } from './lib/scraper.js';
import { generateSiteConfig } from './lib/generate-config.js';
import type { ScrapeState } from './lib/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Compiled CLI lives at dist-scripts/src/cli.js, so go up two levels to reach the package root.
const packageRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const args = argv.slice(2);
  let command = '';
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--help' || arg === '-h') {
      flags['help'] = 'true';
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else if (!command) {
      command = arg;
    }
  }

  return { command, flags };
}

function printHelp(): void {
  console.log(`
doc-slurp — Scrape GitHub org markdown → Docusaurus site

Usage:
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

Examples:
  # Scrape and build in one step
  npx doc-slurp --org my-org --token ghp_xxx

  # Scrape only (e.g. for caching between CI steps)
  npx doc-slurp scrape --org my-org --token ghp_xxx

  # Build only (after a previous scrape)
  npx doc-slurp build --docs-dir ./docs
`.trim());
}

// ── Scrape command ───────────────────────────────────────────────────────────

interface ScrapeOptions {
  org: string;
  token?: string;
  repoFilter?: string;
  docsDir: string;
  stateFile: string;
}

async function runScrape(opts: ScrapeOptions): Promise<void> {
  const { org, token, repoFilter, docsDir, stateFile } = opts;

  // Load existing incremental state
  let prevState: ScrapeState = { repos: {} };
  if (fs.existsSync(stateFile)) {
    try {
      prevState = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as ScrapeState;
      console.log(`Loaded incremental state from ${stateFile} (${Object.keys(prevState.repos).length} repos cached).`);
    } catch {
      console.warn(`Warning: Could not parse ${stateFile}. Starting fresh.`);
    }
  }

  const { files, state } = await scrapeOrg(
    {
      org,
      token,
      repoFilter: repoFilter ? new RegExp(repoFilter) : undefined,
      onProgress(p) {
        if (p.message) process.stdout.write(`\r${p.message.padEnd(80)}`);
        if (p.phase === 'done') {
          process.stdout.write('\n');
          console.log(`Done: ${p.fetched} fetched, ${p.skipped} skipped, ${p.total} total.`);
        }
      },
    },
    prevState,
  );

  // Write scraped files to docs output directory, grouped by repo
  for (const file of files) {
    const destPath = path.join(docsDir, file.repo, file.path);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, file.content, 'utf-8');
  }

  console.log(`Wrote ${files.length} files to ${docsDir}/`);

  // Persist updated incremental state
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
  console.log(`Saved incremental state to ${stateFile}.`);
}

// ── Build command ────────────────────────────────────────────────────────────

interface BuildOptions {
  docsDir: string;
  outDir: string;
  siteTitle: string;
  siteUrl: string;
  baseUrl: string;
}

function runBuild(opts: BuildOptions): void {
  const { docsDir, outDir, siteTitle, siteUrl, baseUrl } = opts;

  // Create a temporary working directory for the Docusaurus site
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-slurp-'));

  try {
    // Copy the website template (custom CSS etc.) into the working directory
    const templateSrc = path.join(packageRoot, 'website', 'src');
    if (fs.existsSync(templateSrc)) {
      copyDirSync(templateSrc, path.join(workDir, 'src'));
    } else {
      // Fallback: generate minimal custom CSS
      const cssDir = path.join(workDir, 'src', 'css');
      fs.mkdirSync(cssDir, { recursive: true });
      fs.writeFileSync(
        path.join(cssDir, 'custom.css'),
        ':root { --ifm-color-primary: #1a73e8; }\n',
        'utf-8',
      );
    }

    // Copy (or symlink) scraped docs into the working directory
    const absDocsDir = path.resolve(docsDir);
    const workDocsDir = path.join(workDir, 'docs');
    if (fs.existsSync(absDocsDir)) {
      copyDirSync(absDocsDir, workDocsDir);
    } else {
      console.warn(`Warning: docs directory ${absDocsDir} does not exist. Building with empty docs.`);
      fs.mkdirSync(workDocsDir, { recursive: true });
    }

    // Generate Docusaurus config + sidebars into the working directory
    const repos = generateSiteConfig({
      siteTitle,
      siteUrl,
      baseUrl,
      docsDir: workDocsDir,
      outDir: workDir,
    });

    console.log(`Generated Docusaurus config with ${repos.length} repos.`);

    // Symlink node_modules so Docusaurus can find its plugins
    const require = createRequire(import.meta.url);
    const docusaurusCorePkg = require.resolve('@docusaurus/core/package.json');
    // @docusaurus/core is scoped, so go up two levels: @docusaurus/core → @docusaurus → node_modules
    const nodeModulesDir = path.resolve(path.dirname(docusaurusCorePkg), '..', '..');
    fs.symlinkSync(nodeModulesDir, path.join(workDir, 'node_modules'));

    // Resolve the Docusaurus CLI binary
    const docusaurusBin = require.resolve('@docusaurus/core/bin/docusaurus.mjs');

    console.log('Building Docusaurus site…');
    execSync(`node ${JSON.stringify(docusaurusBin)} build ${JSON.stringify(workDir)}`, {
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: nodeModulesDir },
    });

    // Copy build output to the final output directory
    const buildOutput = path.join(workDir, 'build');
    const absOutDir = path.resolve(outDir);
    if (fs.existsSync(buildOutput)) {
      copyDirSync(buildOutput, absOutDir);
      console.log(`Site built successfully → ${absOutDir}/`);
    } else {
      console.error('Error: Docusaurus build did not produce output.');
      process.exit(1);
    }
  } finally {
    // Clean up temp directory
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// ── Utility: recursive directory copy ────────────────────────────────────────

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  if (flags['help']) {
    printHelp();
    process.exit(0);
  }

  const org = flags['org'] ?? process.env['GITHUB_ORG'];
  const token = flags['token'] ?? process.env['GITHUB_TOKEN'];
  const repoFilter = flags['repo-filter'] ?? process.env['REPO_FILTER'];
  const docsDir = flags['docs-dir'] ?? process.env['DOCS_OUT_DIR'] ?? './docs';
  const stateFile = flags['state-file'] ?? process.env['STATE_FILE'] ?? 'scrape-state.json';
  const outDir = flags['out-dir'] ?? './build';
  const siteTitle = flags['site-title'] ?? process.env['SITE_TITLE'] ?? 'doc-slurp';
  const siteUrl = flags['site-url'] ?? process.env['SITE_URL'] ?? 'https://example.github.io';
  const baseUrl = flags['base-url'] ?? process.env['BASE_URL'] ?? '/';

  const shouldScrape = command === 'scrape' || command === '';
  const shouldBuild = command === 'build' || command === '';

  if (shouldScrape && !org) {
    console.error('Error: --org or GITHUB_ORG environment variable is required for scraping.');
    console.error('Run doc-slurp --help for usage information.');
    process.exit(1);
  }

  if (shouldScrape) {
    await runScrape({ org: org!, token, repoFilter, docsDir, stateFile });
  }

  if (shouldBuild) {
    runBuild({ docsDir, outDir, siteTitle, siteUrl, baseUrl });
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
