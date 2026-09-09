import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createScopedId } from '../../src/utils/ids';

describe('createScopedId', () => {
  it('creates distinct IDs with the requested prefix', () => {
    const first = createScopedId('routine');
    const second = createScopedId('routine');

    assert.match(first, /^routine-/);
    assert.match(second, /^routine-/);
    assert.notEqual(first, second);
  });
});
