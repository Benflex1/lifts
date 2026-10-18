#!/usr/bin/env node
// PROD-06: completes a web export with the installable-app metadata.
//
// Expo copies `public/` into the export automatically. Verify the shell assets,
// inject app metadata and registration, and version a complete precache snapshot.
// Repeated runs preserve HTML and rebuild the snapshot from current export bytes.
//
// Usage: node scripts/postprocess-web-export.mjs <export-dir>

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const injected = !html.includes(MARKER);

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

  if (injected) {
    html = html.replace('</head>', `  ${injection}\n  </head>`);
    writeFileSync(indexPath, html);
  }

  // Build from the actual export, including chunks not loaded on the first
  // visit. Ignore source maps and hidden files; never discover runtime URLs.
  const files = [];
  const collect = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const relative = prefix + entry.name;
      if (entry.isDirectory()) collect(join(directory, entry.name), relative + '/');
      else if (entry.isFile() && relative !== 'sw.js' && !relative.endsWith('.map'))
        files.push(relative);
    }
  };
  collect(outputDir);
  files.sort();
  const template = readFileSync(serviceWorkerPath, 'utf8')
    .replace(/^const CACHE_VERSION = .*;$/m, "const CACHE_VERSION = 'lifts-shell-unbuilt';")
    .replace(/^const PRECACHE_URLS = .*;$/m, 'const PRECACHE_URLS = [];');
  const digest = createHash('sha256').update(template);
  for (const file of files) {
    const bytes = readFileSync(join(outputDir, file));
    digest.update(JSON.stringify([file, bytes.length])).update(bytes);
  }
  const version = 'lifts-shell-' + digest.digest('hex');
  const urls = files.map(file => '/' + file.split('/').map(encodeURIComponent).join('/'));
  const worker = template
    .replace(
      /^const CACHE_VERSION = .*;$/m,
      () => `const CACHE_VERSION = ${JSON.stringify(version)};`,
    )
    .replace(
      /^const PRECACHE_URLS = .*;$/m,
      () => `const PRECACHE_URLS = ${JSON.stringify(urls)};`,
    );
  writeFileSync(serviceWorkerPath, worker);
  return { injected };
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
