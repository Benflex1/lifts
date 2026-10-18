import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  clearErrorBreadcrumbs,
  getErrorBreadcrumbs,
  reportError,
  setErrorSink,
} from '../../src/utils/errorReporting';

describe('error reporting helper', () => {
  beforeEach(() => {
    clearErrorBreadcrumbs();
    setErrorSink(null);
  });

  it('normalizes non-Error values and returns the recorded error', () => {
    const normalized = reportError('storage unavailable', { scope: 'test.normalize' });

    assert.ok(normalized instanceof Error);
    assert.equal(normalized.message, 'storage unavailable');
    assert.equal(getErrorBreadcrumbs().length, 1);
    assert.equal(getErrorBreadcrumbs()[0].context.scope, 'test.normalize');
  });

  it('preserves Error instances and context metadata', () => {
    const original = new Error('disk full');
    const returned = reportError(original, { scope: 'test.preserve', workoutId: 'w-1' });

    assert.equal(returned, original);
    const [breadcrumb] = getErrorBreadcrumbs();
    assert.equal(breadcrumb.error, original);
    assert.equal(breadcrumb.context.workoutId, 'w-1');
    assert.ok(Number.isFinite(breadcrumb.at));
  });

  it('forwards reports to the registered sink', () => {
    const seen: Array<{ message: string; scope: string }> = [];
    setErrorSink((error, context) => {
      seen.push({ message: error.message, scope: context.scope });
    });

    reportError(new Error('sink target'), { scope: 'test.sink' });

    assert.deepEqual(seen, [{ message: 'sink target', scope: 'test.sink' }]);
  });

  it('never lets a failing sink break the caller', () => {
    setErrorSink(() => {
      throw new Error('sink exploded');
    });

    assert.doesNotThrow(() => reportError(new Error('original'), { scope: 'test.sink.failure' }));
    assert.equal(getErrorBreadcrumbs().length, 1);
  });

  it('bounds the breadcrumb buffer to the most recent reports', () => {
    for (let index = 0; index < 30; index++) {
      reportError(new Error(`failure-${index}`), { scope: 'test.bounded' });
    }

    const breadcrumbs = getErrorBreadcrumbs();
    assert.ok(breadcrumbs.length <= 20);
    assert.equal(breadcrumbs[breadcrumbs.length - 1].error.message, 'failure-29');
  });
});
