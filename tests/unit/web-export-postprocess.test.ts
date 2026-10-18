import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = 'scripts/postprocess-web-export.mjs';

function makeExport(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lifts-web-export-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><head><title>Lifts</title></head><body><div id="root"></div></body></html>',
  );
  cpSync('public/manifest.webmanifest', join(dir, 'manifest.webmanifest'));
  cpSync('public/sw.js', join(dir, 'sw.js'));
  return dir;
}

test('web export postprocess wires the manifest and service worker once (PROD-06)', () => {
  const dir = makeExport();

  const first = execFileSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  assert.match(first, /manifest and service worker wired/);

  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('rel="manifest"'));
  assert.ok(html.includes('content="#09090B"'));
  assert.ok(html.includes("navigator.serviceWorker.register('/sw.js')"));
  assert.equal((html.match(/lifts-web-shell/g) ?? []).length, 1);

  const second = execFileSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  assert.match(second, /already contains/);
  const again = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.equal((again.match(/rel="manifest"/g) ?? []).length, 1);
  assert.equal((again.match(/lifts-web-shell/g) ?? []).length, 1);
});

test('web export postprocess fails when the shell assets are missing (PROD-06)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lifts-web-export-empty-'));

  let failed = false;
  try {
    execFileSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    failed = true;
    const exit = error as { status?: number; stderr?: string };
    assert.equal(exit.status, 1);
    assert.match(String(exit.stderr), /web export is missing/);
  }
  assert.equal(failed, true);
});
