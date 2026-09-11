import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseDurationSeconds, parseWorkoutDate } from '../../src/utils/importer/date-parser';

describe('CSV Date & Duration Parser', () => {
  it('parses standard ISO strings', () => {
    const iso = '2024-05-15T10:30:00.000Z';
    assert.equal(parseWorkoutDate(iso), iso);
  });

  it('parses Hevy textual date format ("15 Jul 2024, 09:30")', () => {
    const res = parseWorkoutDate('15 Jul 2024, 09:30');
    assert.ok(res.startsWith('2024-07-15T'));
  });

  it('parses Hevy textual date with AM/PM ("Jul 15, 2024, 5:30 PM")', () => {
    const res = parseWorkoutDate('Jul 15, 2024, 5:30 PM');
    assert.ok(res.startsWith('2024-07-15'));
    assert.ok(!Number.isNaN(Date.parse(res)));
  });

  it('parses Strong date with space ("2024-05-20 18:00:00")', () => {
    const res = parseWorkoutDate('2024-05-20 18:00:00');
    assert.ok(res.startsWith('2024-05-20'));
  });

  it('parses European dot date ("15.03.2024 10:30")', () => {
    const res = parseWorkoutDate('15.03.2024 10:30');
    assert.ok(res.startsWith('2024-03-15T10:30:00'));
  });

  it('parses FitNotes date only ("2024-07-01")', () => {
    const res = parseWorkoutDate('2024-07-01');
    assert.ok(res.startsWith('2024-07-01'));
  });

  it('parses duration strings accurately', () => {
    assert.equal(parseDurationSeconds('1h 10m'), 4200);
    assert.equal(parseDurationSeconds('45m'), 2700);
    assert.equal(parseDurationSeconds('1h'), 3600);
    assert.equal(parseDurationSeconds('2h 5m 30s'), 7530);
    assert.equal(parseDurationSeconds('01:15:30'), 4530);
    assert.equal(parseDurationSeconds('45:00'), 2700);
    assert.equal(parseDurationSeconds('4200'), 4200);
    assert.equal(parseDurationSeconds('45'), 2700); // 45 minutes
    assert.equal(parseDurationSeconds('240', 'seconds'), 240); // Respects seconds hint
    assert.equal(parseDurationSeconds('45', 'minutes'), 2700);
  });
});
