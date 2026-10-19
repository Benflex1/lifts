#!/usr/bin/env node
// Verifies the release version contract:
// - app.json "expo.version" is MAJOR.MINOR.PATCH
// - package.json "version" matches app.json "expo.version"
// - app.json "expo.android.versionCode" equals MAJOR * 1,000,000 + MINOR * 1,000 + PATCH
//
// Usage: node scripts/check-version-sync.mjs [--root <dir>]
// Exits 1 and prints every mismatch on failure. Runs in CI and is part of the
// release checklist.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readJson(root, name) {
  try {
    return JSON.parse(readFileSync(join(root, name), 'utf8'));
  } catch (error) {
    throw new Error(`version-sync: cannot read ${name}: ${error.message}`, { cause: error });
  }
}

export function collectVersionProblems(root) {
  const problems = [];
  const pkg = readJson(root, 'package.json');
  const app = readJson(root, 'app.json');

  const appVersion = app?.expo?.version;
  if (typeof appVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(appVersion)) {
    problems.push(`app.json expo.version must be MAJOR.MINOR.PATCH (found ${String(appVersion)})`);
    return problems;
  }

  if (pkg.version !== appVersion) {
    problems.push(
      `package.json version (${String(pkg.version)}) does not match app.json expo.version (${appVersion})`,
    );
  }

  const [major, minor, patch] = appVersion.split('.').map(Number);
  const expectedCode = major * 1_000_000 + minor * 1_000 + patch;
  const versionCode = app?.expo?.android?.versionCode;
  if (versionCode !== expectedCode) {
    problems.push(
      `app.json android.versionCode (${String(versionCode)}) must equal ${expectedCode} for version ${appVersion}`,
    );
  }

  return problems;
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath;

if (invokedDirectly) {
  const rootFlag = process.argv.indexOf('--root');
  const root =
    rootFlag !== -1 && process.argv[rootFlag + 1]
      ? resolve(process.argv[rootFlag + 1])
      : join(dirname(scriptPath), '..');

  const problems = collectVersionProblems(root);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`version-sync: ${problem}`);
    }
    process.exitCode = 1;
  } else {
    const pkg = readJson(root, 'package.json');
    console.log(`version-sync: package.json and app.json both at ${pkg.version}`);
  }
}
