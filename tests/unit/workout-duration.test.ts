import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  isExcessiveDuration,
  secondsToHoursMinutes,
  parseDurationInput,
  estimateWorkoutDuration,
  EXCESSIVE_DURATION_THRESHOLD_SECONDS,
} from '../../src/workout/duration';

describe('workout duration helpers', () => {
  it('isExcessiveDuration flags 4 hours and above', () => {
    assert.equal(isExcessiveDuration(0), false);
    assert.equal(isExcessiveDuration(3600), false);
    assert.equal(isExcessiveDuration(14399), false);
    assert.equal(isExcessiveDuration(14400), true);
    assert.equal(isExcessiveDuration(18000), true);
    assert.equal(isExcessiveDuration(EXCESSIVE_DURATION_THRESHOLD_SECONDS), true);
  });

  it('secondsToHoursMinutes correctly decomposes seconds', () => {
    assert.deepEqual(secondsToHoursMinutes(0), { hours: 0, minutes: 0, seconds: 0 });
    assert.deepEqual(secondsToHoursMinutes(65), { hours: 0, minutes: 1, seconds: 5 });
    assert.deepEqual(secondsToHoursMinutes(3661), { hours: 1, minutes: 1, seconds: 1 });
    assert.deepEqual(secondsToHoursMinutes(14520), { hours: 4, minutes: 2, seconds: 0 });
    assert.deepEqual(secondsToHoursMinutes(-50), { hours: 0, minutes: 0, seconds: 0 });
  });

  it('parseDurationInput parses hours, minutes and seconds strings and numbers', () => {
    assert.equal(parseDurationInput('1', '30'), 5400);
    assert.equal(parseDurationInput(2, 15), 8100);
    assert.equal(parseDurationInput('0', '45', '30'), 2730);
    assert.equal(parseDurationInput('', '60'), 3600);
    assert.equal(parseDurationInput('invalid', '10'), 600);
    assert.equal(parseDurationInput('-1', '10'), 600);
  });

  it('estimateWorkoutDuration estimates from set timestamps when available', () => {
    const baseTime = 1700000000000;
    const workout = {
      exercises: [
        {
          sets: [
            { isCompleted: true, completedAt: new Date(baseTime).toISOString() },
            { isCompleted: true, completedAt: new Date(baseTime + 900 * 1000).toISOString() },
            { isCompleted: true, completedAt: new Date(baseTime + 1800 * 1000).toISOString() },
          ],
        },
      ],
    };

    // Span is 1800s (30m) + 300s buffer = 2100s (35m)
    assert.equal(estimateWorkoutDuration(workout), 2100);
  });

  it('estimateWorkoutDuration falls back to set-count estimate when timestamps absent', () => {
    const workout = {
      exercises: [
        {
          sets: [
            { isCompleted: true },
            { isCompleted: true },
            { isCompleted: true },
            { isCompleted: true },
          ],
        },
      ],
    };

    // 4 sets * 150 + 300 = 900 -> clamped to minimum 1800s (30 mins)
    assert.equal(estimateWorkoutDuration(workout), 1800);

    const largeWorkout = {
      exercises: [
        {
          sets: Array.from({ length: 20 }, () => ({ isCompleted: true })),
        },
      ],
    };

    // 20 sets * 150 + 300 = 3300s (55 mins)
    assert.equal(estimateWorkoutDuration(largeWorkout), 3300);
  });

  it('estimateWorkoutDuration handles empty workout', () => {
    assert.equal(estimateWorkoutDuration({ exercises: [] }), 1800);
  });
});
