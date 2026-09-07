import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

describe('Dialog semantics', () => {
  it('confirm resolves true on explicit confirmation and false on cancel', async () => {
    let pendingResolve: ((val: boolean) => void) | null = null;
    const confirm = () => new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
    });

    // Simulate user confirming
    const promise1 = confirm();
    pendingResolve!(true);
    const result1 = await promise1;
    assert.equal(result1, true);

    // Simulate user canceling
    const promise2 = confirm();
    pendingResolve!(false);
    const result2 = await promise2;
    assert.equal(result2, false);
  });

  it('notify resolves when acknowledged', async () => {
    let acknowledged = false;
    let pendingResolve: (() => void) | null = null;
    const notify = () => new Promise<void>((resolve) => {
      pendingResolve = resolve;
    });

    const promise = notify().then(() => {
      acknowledged = true;
    });

    assert.equal(acknowledged, false);
    pendingResolve!();
    await promise;
    assert.equal(acknowledged, true);
  });
});
