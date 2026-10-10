import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { restAlarmForAppState, shiftRestCountdown } from '../../src/utils/restTimer';

const NOW = 1_700_000_000_000;

describe('shiftRestCountdown', () => {
  it('moves the end and the total together so the progress bar does not jump back', () => {
    const shifted = shiftRestCountdown({ endsAt: NOW + 60_000, totalSeconds: 60, exerciseName: 'Squat' }, 30, NOW);
    assert.deepEqual(shifted, { endsAt: NOW + 90_000, totalSeconds: 90, exerciseName: 'Squat' });
  });

  it('shortens a rest that still has time left', () => {
    const shifted = shiftRestCountdown({ endsAt: NOW + 40_000, totalSeconds: 60 }, -30, NOW);
    assert.deepEqual(shifted, { endsAt: NOW + 10_000, totalSeconds: 30 });
  });

  it('returns null when subtracting leaves no time', () => {
    assert.equal(shiftRestCountdown({ endsAt: NOW + 20_000, totalSeconds: 60 }, -30, NOW), null);
  });
});

describe('restAlarmForAppState', () => {
  const rest = { endsAt: NOW + 90_000, totalSeconds: 90, exerciseName: 'Bench Press' };

  it('arms the OS alarm for the running rest when the app goes to the background', () => {
    assert.deepEqual(restAlarmForAppState('background', rest, NOW + 10_000), {
      kind: 'arm',
      endsAt: NOW + 90_000,
      exerciseName: 'Bench Press',
    });
  });

  it('does not arm when no rest is running', () => {
    assert.deepEqual(restAlarmForAppState('background', null, NOW), { kind: 'none' });
  });

  it('does not arm once the rest has already ended', () => {
    assert.deepEqual(restAlarmForAppState('background', rest, NOW + 90_000), { kind: 'none' });
  });

  it('cancels the OS alarm when the app returns to the foreground, so the in-app countdown alerts instead', () => {
    assert.deepEqual(restAlarmForAppState('active', rest, NOW + 10_000), { kind: 'cancel' });
  });

  it('leaves the alarm alone on transient inactive states', () => {
    assert.deepEqual(restAlarmForAppState('inactive', rest, NOW + 10_000), { kind: 'none' });
  });
});
