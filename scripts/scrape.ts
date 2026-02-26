#!/usr/bin/env tsx
/**
 * scripts/scrape.ts
 *
 * CLI entry-point for incremental markdown scraping.
 *
 * Usage:
 *   GITHUB_ORG=my-org GITHUB_TOKEN=ghp_xxx npx tsx scripts/scrape.ts
 *
 * Environment variables:
 *   GITHUB_ORG    (required) GitHub organisation to scrape.
 *   GITHUB_TOKEN  (optional) Personal access token for higher rate limits.
 *   REPO_FILTER   (optional) Regex pattern; only matching repo names are scraped.
 *   DOCS_OUT_DIR  (optional) Output directory for generated docs (default: website/docs).
 *   STATE_FILE    (optional) Path to the incremental state JSON (default: scrape-state.json).
 */

import fs from 'node:fs';
import path from 'node:path';
import { scrapeOrg } from '../src/lib/scraper.js';
import type { ScrapeState } from '../src/lib/types.js';

const org = process.env['GITHUB_ORG'];
if (!org) {
  console.error('Error: GITHUB_ORG environment variable is required.');
  process.exit(1);
}

const token = process.env['GITHUB_TOKEN'];
const repoFilterRaw = process.env['REPO_FILTER'];
const docsOutDir = process.env['DOCS_OUT_DIR'] ?? 'website/docs';
const stateFile = process.env['STATE_FILE'] ?? 'scrape-state.json';

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
    repoFilter: repoFilterRaw ? new RegExp(repoFilterRaw) : undefined,
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
  const destPath = path.join(docsOutDir, file.repo, file.path);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, file.content, 'utf-8');
}

console.log(`Wrote ${files.length} files to ${docsOutDir}/`);

// Persist updated incremental state
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
console.log(`Saved incremental state to ${stateFile}.`);
