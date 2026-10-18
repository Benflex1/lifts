import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getDialogActionErrorMessage } from '../../src/utils/dialogAction';

describe('dialog action error messages', () => {
  it('prefers an action-specific message when provided', () => {
    const message = getDialogActionErrorMessage(new Error('underlying failure'), {
      label: 'Open Settings',
      errorMessage: 'Could not open system settings.',
    });

    assert.equal(message, 'Could not open system settings.');
  });

  it('uses the thrown Error message as the fallback', () => {
    const message = getDialogActionErrorMessage(new Error('permission denied'), {
      label: 'Open Settings',
    });

    assert.equal(message, 'permission denied');
  });

  it('handles string rejections', () => {
    const message = getDialogActionErrorMessage('network down', { label: 'Retry sync' });

    assert.equal(message, 'network down');
  });

  it('returns a generic message for empty or unknown failures', () => {
    assert.equal(
      getDialogActionErrorMessage(undefined, { label: 'Retry' }),
      'The action could not be completed. Please try again.',
    );
    assert.equal(
      getDialogActionErrorMessage(new Error(''), { label: 'Retry' }),
      'The action could not be completed. Please try again.',
    );
  });
});
