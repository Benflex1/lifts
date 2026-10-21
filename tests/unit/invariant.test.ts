import assert from 'node:assert/strict';
import test from 'node:test';
import { errorMessage, requireDefined, toError } from '../../src/utils/invariant';

test('requireDefined returns present values and fails with context (ARCH-11)', () => {
  assert.equal(requireDefined(0, 'zero'), 0);
  assert.equal(requireDefined('', 'empty string'), '');
  assert.throws(() => requireDefined(null, 'gym row'), /Expected gym row to be defined/);
  assert.throws(() => requireDefined(undefined, 'lease'), /Expected lease to be defined/);
});

test('errorMessage normalizes unknown thrown values (ARCH-11)', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage('plain failure'), 'plain failure');
  assert.equal(errorMessage({ code: 'E_OFFLINE' }), '{"code":"E_OFFLINE"}');
  assert.equal(errorMessage(42), '42');

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(typeof errorMessage(circular), 'string');
});

test('toError preserves Error instances and wraps others (ARCH-11)', () => {
  const original = new Error('original');
  assert.equal(toError(original), original);

  const wrapped = toError('offline');
  assert.ok(wrapped instanceof Error);
  assert.equal(wrapped.message, 'offline');
});
