#!/usr/bin/env node
// ARCH-10 dead-code scan. Classifies every export in `src/`:
//   - DEAD: no reference in src/, tests/, App.tsx, or index.ts -> fails the run
//   - TEST-ONLY: referenced only from tests (deliberate test seams)
//   - INTERNAL-ONLY: referenced only inside its own module (could be unexported)
//
// Usage: node scripts/dead-code-scan.mjs [--verbose]

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const VERBOSE = process.argv.includes('--verbose');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

const srcFiles = walk(join(ROOT, 'src'));
const rootFiles = ['App.tsx', 'index.ts']
  .map(file => join(ROOT, file))
  .filter(file => existsSync(file));
const allFiles = [...srcFiles, ...walk(join(ROOT, 'tests')), ...rootFiles];

const contents = new Map(allFiles.map(file => [file, readFileSync(file, 'utf8')]));
const EXPORT_PATTERN =
  /export\s+(?:async\s+)?(?:const|function|class|let|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g;

const dead = [];
const testOnly = [];
const internalOnly = [];

for (const file of srcFiles) {
  const source = contents.get(file);
  const relativePath = relative(ROOT, file).split('\\').join('/');
  const names = [...source.matchAll(EXPORT_PATTERN)].map(match => match[1]);

  for (const name of names) {
    const reference = new RegExp(`\\b${name}\\b`);
    let inSrc = false;
    let inTestsOrRoot = false;
    for (const other of allFiles) {
      if (other === file) continue;
      if (!reference.test(contents.get(other))) continue;
      if (other.includes(`${join(ROOT, 'src')}`)) inSrc = true;
      else inTestsOrRoot = true;
    }

    if (!inSrc && !inTestsOrRoot) {
      const selfReferences = source.split(reference).length - 1;
      if (selfReferences > 1) internalOnly.push(`${relativePath} :: ${name}`);
      else dead.push(`${relativePath} :: ${name}`);
    } else if (!inSrc) {
      testOnly.push(`${relativePath} :: ${name}`);
    }
  }
}

console.log(
  `dead-code scan: ${dead.length} dead, ${testOnly.length} test-only, ${internalOnly.length} internal-only`,
);
if (VERBOSE) {
  for (const entry of internalOnly) console.log(`  internal-only: ${entry}`);
}
for (const entry of testOnly) {
  if (VERBOSE) console.log(`  test-only: ${entry}`);
}

if (dead.length > 0) {
  console.error('dead-code scan: exports with no reference anywhere:');
  for (const entry of dead) console.error(`  - ${entry}`);
  console.error('Delete them or wire them in; rerun with --verbose for the other categories.');
  process.exit(1);
}

console.log('dead-code scan: no unreferenced exports');
