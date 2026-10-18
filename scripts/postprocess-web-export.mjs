#!/usr/bin/env node
// PROD-06: completes a web export with the installable-app metadata.
//
// Expo copies `public/` into the export automatically, so this only verifies the
// shell assets are present and injects the manifest link, theme colour, and the
// service-worker registration into index.html. Idempotent.
//
// Usage: node scripts/postprocess-web-export.mjs <export-dir>

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'lifts-web-shell';

/**
 * @param {string} outputDir
 * @returns {{ injected: boolean }}
 */
export function postprocessWebExport(outputDir) {
  const indexPath = join(outputDir, 'index.html');
  const manifestPath = join(outputDir, 'manifest.webmanifest');
  const serviceWorkerPath = join(outputDir, 'sw.js');

  for (const file of [indexPath, manifestPath, serviceWorkerPath]) {
    if (!existsSync(file)) {
      throw new Error(
        `web export is missing ${file}; run \`npx expo export --platform web\` first (public/ files are copied automatically)`,
      );
    }
  }

  let html = readFileSync(indexPath, 'utf8');
  if (html.includes(MARKER)) return { injected: false };

  const injection = [
    `<!-- ${MARKER}: manifest link and offline shell registration -->`,
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<meta name="theme-color" content="#09090B" />',
    '<script>',
    "  if ('serviceWorker' in navigator) {",
    "    window.addEventListener('load', function () {",
    "      navigator.serviceWorker.register('/sw.js').catch(function () {});",
    '    });',
    '  }',
    '</script>',
  ].join('\n    ');

  html = html.replace('</head>', `  ${injection}\n  </head>`);
  writeFileSync(indexPath, html);
  return { injected: true };
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const outputDir = resolve(process.argv[2] ?? 'dist');
  try {
    const result = postprocessWebExport(outputDir);
    console.log(
      result.injected
        ? `web export: manifest and service worker wired into ${outputDir}/index.html`
        : `web export: ${outputDir}/index.html already contains the manifest and service worker`,
    );
  } catch (error) {
    console.error(`web export: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
