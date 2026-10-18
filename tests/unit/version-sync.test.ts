import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = 'scripts/check-version-sync.mjs';

test('version check passes for the repository (DX-08)', () => {
  const output = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.match(output, /version-sync: package\.json and app\.json both at \d+\.\d+\.\d+/);
});

test('version check reports package and versionCode mismatches with exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lifts-version-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '9.9.9' }));
  writeFileSync(
    join(dir, 'app.json'),
    JSON.stringify({ expo: { version: '1.0.5', android: { versionCode: 1 } } }),
  );

  let failed = false;
  try {
    execFileSync(process.execPath, [SCRIPT, '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    failed = true;
    const exitError = error as { status?: number; stderr?: string };
    assert.equal(exitError.status, 1);
    assert.match(String(exitError.stderr), /does not match app\.json expo\.version/);
    assert.match(String(exitError.stderr), /must equal 1000005/);
  }
  assert.equal(failed, true);
});
