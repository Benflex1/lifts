import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

/**
 * A11Y-06 enforcement: every raw touchable left in `src/` must expose an
 * accessibility label and role, or explicitly opt out as a dismiss scrim
 * (`accessible={false}`). New interactive components should use `AppTouchable`
 * from `src/components/ui`, whose props make the label a type requirement.
 */

const SRC_ROOT = join(__dirname, '..', '..', 'src');
const RAW_TOUCHABLES = ['TouchableOpacity', 'TouchableHighlight', 'Pressable'];
// The AppTouchable primitive is the one place allowed to spread props through.
const SPREAD_ALLOWED_FILE = 'components/ui.tsx';

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** Finds the `>` that closes a JSX opening tag, ignoring braces and quotes. */
function findTagEnd(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === quote && source[cursor - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return cursor;
  }
  return -1;
}

test('every raw touchable in src is labelled or an explicit scrim (A11Y-06)', () => {
  const offenders: string[] = [];

  for (const file of walk(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const relativePath = relative(SRC_ROOT, file).split('\\').join('/');

    for (const tagName of RAW_TOUCHABLES) {
      let index = source.indexOf(`<${tagName}`);
      while (index !== -1) {
        const end = findTagEnd(source, index + tagName.length + 1);
        assert.ok(end !== -1, `unterminated <${tagName} in ${relativePath}`);
        const tagText = source.slice(index, end + 1);
        const line = source.slice(0, index).split('\n').length;
        const isScrim = /\baccessible=\{false\}/.test(tagText);
        const spreads = tagText.includes('{...');

        if (!isScrim && !(spreads && relativePath === SPREAD_ALLOWED_FILE)) {
          if (!tagText.includes('accessibilityLabel')) {
            offenders.push(`${relativePath}:${line} <${tagName}> is missing accessibilityLabel`);
          } else if (!tagText.includes('accessibilityRole')) {
            offenders.push(`${relativePath}:${line} <${tagName}> is missing accessibilityRole`);
          }
        }

        index = source.indexOf(`<${tagName}`, end);
      }
    }
  }

  assert.deepEqual(offenders, [], `raw touchables need labels/roles:\n${offenders.join('\n')}`);
});
