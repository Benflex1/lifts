import assert from 'node:assert/strict';
import test from 'node:test';
import { createDebouncer } from '../../src/utils/debounce';

test('collapses rapid updates into a single trailing commit', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commits: string[] = [];
  const debouncer = createDebouncer<string>(200, value => commits.push(value));

  debouncer.schedule('b');
  debouncer.schedule('be');
  debouncer.schedule('ben');

  t.mock.timers.tick(199);
  assert.deepEqual(commits, [], 'nothing is committed before the delay elapses');

  t.mock.timers.tick(1);
  assert.deepEqual(commits, ['ben'], 'only the latest value is committed');
});

test('flushNow commits the pending value immediately', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commits: string[] = [];
  const debouncer = createDebouncer<string>(250, value => commits.push(value));

  debouncer.schedule('note text');
  debouncer.flushNow();
  assert.deepEqual(commits, ['note text']);

  t.mock.timers.tick(250);
  assert.deepEqual(commits, ['note text'], 'the flushed value is not committed twice');
});

test('cancel drops the pending value', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commits: string[] = [];
  const debouncer = createDebouncer<string>(200, value => commits.push(value));

  debouncer.schedule('discarded');
  debouncer.cancel();
  t.mock.timers.tick(500);

  assert.deepEqual(commits, []);
});

test('flushNow without a pending value is a no-op', () => {
  const commits: string[] = [];
  const debouncer = createDebouncer<string>(200, value => commits.push(value));
  debouncer.flushNow();
  assert.deepEqual(commits, []);
});
