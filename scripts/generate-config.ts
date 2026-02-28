#!/usr/bin/env tsx
/**
 * scripts/generate-config.ts
 *
 * Generates website/docusaurus.config.ts and website/sidebars.ts based on the
 * directory structure under website/docs/ (one top-level folder per repo).
 *
 * Usage:
 *   npx tsx scripts/generate-config.ts
 *
 * Environment variables:
 *   SITE_TITLE      (optional) Title shown in the Docusaurus navbar (default: "doc-slurp").
 *   SITE_URL        (optional) Production URL (default: "https://example.github.io").
 *   BASE_URL        (optional) Base path, e.g. "/doc-slurp/" (default: "/").
 *   DOCS_OUT_DIR    (optional) Location of docs directory (default: "website/docs").
 */

import { generateSiteConfig } from '../src/lib/generate-config.js';

const docsOutDir = process.env['DOCS_OUT_DIR'] ?? 'website/docs';

const repos = generateSiteConfig({
  siteTitle: process.env['SITE_TITLE'],
  siteUrl: process.env['SITE_URL'],
  baseUrl: process.env['BASE_URL'],
  docsDir: docsOutDir,
  outDir: 'website',
});

console.log(`Generated website/docusaurus.config.ts with ${repos.length} repos.`);
console.log('Generated website/sidebars.ts');
