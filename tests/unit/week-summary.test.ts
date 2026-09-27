import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekSnapshot, startOfLocalWeek } from '../../src/workout/week-summary';
import { WorkoutHistorySummary } from '../../src/types';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();

const summary = (id: string, startTime: string, volume = 1000): WorkoutHistorySummary => ({
  id,
  name: id,
  gymId: 'gym',
  startTime,
  durationSeconds: 3600,
  totalVolumeKg: volume,
  totalSets: 10,
  exerciseNames: [],
});

describe('buildWeekSnapshot', () => {
  // Thursday, 24 September 2026
  const now = new Date(2026, 8, 24, 18);

  it('starts weeks on Monday in local time', () => {
    const start = startOfLocalWeek(now);
    assert.equal(start.getDay(), 1);
    assert.equal(start.getDate(), 21);
  });

  it('marks trained days and totals only the current week', () => {
    const snapshot = buildWeekSnapshot(
      [
        summary('mon', at(2026, 9, 21), 1200),
        summary('wed-am', at(2026, 9, 23, 7), 800),
        summary('wed-pm', at(2026, 9, 23, 19), 500),
        summary('last-week', at(2026, 9, 18), 9999),
      ],
      now,
    );

    assert.deepEqual(
      snapshot.days.map(day => day.trained),
      [true, false, true, false, false, false, false],
    );
    assert.equal(snapshot.workouts, 3);
    assert.equal(snapshot.volumeKg, 2500);
    assert.equal(snapshot.durationSeconds, 3 * 3600);
    assert.equal(snapshot.days[3].isToday, true);
    assert.equal(snapshot.days[4].isFuture, true);
    assert.equal(snapshot.days[2].isFuture, false);
  });

  it('counts the streak from last week when nothing is logged yet this week', () => {
    const snapshot = buildWeekSnapshot(
      [summary('a', at(2026, 9, 16)), summary('b', at(2026, 9, 9)), summary('c', at(2026, 8, 26))],
      now,
    );
    assert.equal(snapshot.workouts, 0);
    assert.equal(snapshot.streakWeeks, 2);
  });

  it('includes the current week in the streak once trained', () => {
    const snapshot = buildWeekSnapshot([summary('a', at(2026, 9, 22)), summary('b', at(2026, 9, 15))], now);
    assert.equal(snapshot.streakWeeks, 2);
  });

  it('returns an empty week for no history', () => {
    const snapshot = buildWeekSnapshot([], now);
    assert.equal(snapshot.workouts, 0);
    assert.equal(snapshot.streakWeeks, 0);
    assert.equal(snapshot.days.length, 7);
  });
});
