#!/usr/bin/env node
// DX-06 dependency audit policy: runs `npm audit --omit=dev` and fails on
// high/critical advisories that are not explicitly accepted below. Every
// accepted advisory needs a triage note in docs/release-checklist.md section 2.
//
// Usage: node scripts/audit-policy.mjs

import { execFileSync } from 'node:child_process';

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

// Keyed by advisory URL. These are all build/dev tooling paths that ship as
// production dependencies of the Expo toolchain; none run inside the app.
const ACCEPTED_ADVISORIES = new Map([
  [
    'https://github.com/advisories/GHSA-pqg4-j6r4-53mv',
    'shell-quote via react-devtools-core: dev-menu tooling, excluded from release builds',
  ],
  [
    'https://github.com/advisories/GHSA-qhr7-859c-m2p7',
    'brace-expansion via Metro glob tooling: build-time only',
  ],
  [
    'https://github.com/advisories/GHSA-6j4f-fj2g-mc7p',
    'brace-expansion via Metro glob tooling: build-time only',
  ],
  [
    'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
    'braces via micromatch in Metro/Fastify tooling: build-time only',
  ],
  [
    'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
    'node-forge via @expo/code-signing-certificates: CLI code signing tooling',
  ],
  [
    'https://github.com/advisories/GHSA-68fv-2mgg-jv7q',
    'source-map-js via Metro source maps: build-time only',
  ],
]);

function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // npm audit exits non-zero when advisories exist; the JSON still lands on stdout.
    if (typeof error.stdout === 'string' && error.stdout.trim() !== '') return error.stdout;
    throw error;
  }
}

const report = JSON.parse(runAudit());
const counts = report.metadata?.vulnerabilities ?? {};

const blocking = new Map();
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via !== 'object' || !via.url) continue;
    if (!BLOCKING_SEVERITIES.has(via.severity)) continue;
    const acceptedReason = ACCEPTED_ADVISORIES.get(via.url);
    if (acceptedReason) continue;
    blocking.set(`${via.url} (${name})`, via.title ?? via.url);
  }
}

console.log(
  `audit-policy: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
    `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low (production tree)`,
);
console.log(
  `audit-policy: ${ACCEPTED_ADVISORIES.size} accepted advisories documented in docs/release-checklist.md`,
);

if (blocking.size > 0) {
  console.error('audit-policy: failing high/critical advisories are not accepted:');
  for (const [key, title] of blocking) {
    console.error(`  - ${key}: ${title}`);
  }
  console.error(
    'Triage the advisory in docs/release-checklist.md section 2, then add it to ACCEPTED_ADVISORIES.',
  );
  process.exit(1);
}

console.log('audit-policy: no unaccepted high/critical advisories');
