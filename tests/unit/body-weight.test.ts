import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  bodyWeightTrend,
  filterBodyWeightRange,
  formatWeighInDate,
  isValidBodyWeightKg,
  mergeBodyWeightLogs,
  parseBodyWeightEnabled,
  parseBodyWeightLog,
  removeBodyWeight,
  serializeBodyWeightLog,
  summarizeBodyWeight,
  toDateKey,
  upsertBodyWeight,
} from '../../src/workout/body-weight';

describe('body weight log', () => {
  it('is off unless turned on', () => {
    assert.equal(parseBodyWeightEnabled(null), false);
    assert.equal(parseBodyWeightEnabled('false'), false);
    assert.equal(parseBodyWeightEnabled('true'), true);
  });

  it('parses oldest first and drops malformed or implausible entries', () => {
    const log = parseBodyWeightLog(JSON.stringify([
      { date: '2026-10-05', weightKg: 81 },
      { date: '2026-10-01', weightKg: 82 },
      { date: '2026-10-02', weightKg: 820 },
      { date: 'yesterday', weightKg: 80 },
      { date: '2026-10-03', weightKg: '80' },
      { date: '2026-02-31', weightKg: 80 },
      null,
    ]));
    assert.deepEqual(log, [
      { date: '2026-10-01', weightKg: 82 },
      { date: '2026-10-05', weightKg: 81 },
    ]);
    assert.deepEqual(parseBodyWeightLog('not json'), []);
    assert.deepEqual(parseBodyWeightLog('{"a":1}'), []);
  });

  it('keeps one weigh-in per day', () => {
    let log = upsertBodyWeight([], '2026-10-02', 80);
    log = upsertBodyWeight(log, '2026-10-01', 81);
    log = upsertBodyWeight(log, '2026-10-02', 79.5);
    assert.deepEqual(log, [
      { date: '2026-10-01', weightKg: 81 },
      { date: '2026-10-02', weightKg: 79.5 },
    ]);
    assert.deepEqual(removeBodyWeight(log, '2026-10-01'), [{ date: '2026-10-02', weightKg: 79.5 }]);
    assert.deepEqual(parseBodyWeightLog(serializeBodyWeightLog(log)), log);
  });

  it('refuses typos outside 20 to 400 kg', () => {
    assert.equal(isValidBodyWeightKg(19.9), false);
    assert.equal(isValidBodyWeightKg(80), true);
    assert.equal(isValidBodyWeightKg(400.1), false);
    assert.equal(isValidBodyWeightKg(Number.NaN), false);
  });

  it('uses the local calendar day', () => {
    assert.equal(toDateKey(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  });

  it('merges restores per day with this device winning', () => {
    const existing = serializeBodyWeightLog([{ date: '2026-10-02', weightKg: 80 }]);
    const incoming = serializeBodyWeightLog([
      { date: '2026-10-01', weightKg: 81 },
      { date: '2026-10-02', weightKg: 90 },
    ]);
    assert.deepEqual(parseBodyWeightLog(mergeBodyWeightLogs(existing, incoming)), [
      { date: '2026-10-01', weightKg: 81 },
      { date: '2026-10-02', weightKg: 80 },
    ]);
    assert.deepEqual(parseBodyWeightLog(mergeBodyWeightLogs(undefined, incoming)).length, 2);
  });

  it('marks the log as merged on restore', async () => {
    const { isMergedOnRestore } = await import('../../src/utils/settings');
    assert.equal(isMergedOnRestore('body_weight_log'), true);
    assert.equal(isMergedOnRestore('body_weight_enabled'), false);
  });

  it('summarizes change over about 30 days and the 7-day average', () => {
    const log = parseBodyWeightLog(JSON.stringify([
      { date: '2026-08-20', weightKg: 85 },
      { date: '2026-09-05', weightKg: 84 },
      { date: '2026-09-20', weightKg: 83 },
      { date: '2026-10-04', weightKg: 82.4 },
      { date: '2026-10-06', weightKg: 82 },
    ]));
    const summary = summarizeBodyWeight(log)!;
    assert.deepEqual(summary.latest, { date: '2026-10-06', weightKg: 82 });
    assert.deepEqual(summary.change, { kg: -2, days: 31 });
    assert.equal(summary.weekAverageKg, 82.2);
    assert.equal(summary.lowestKg, 82);
    assert.equal(summary.highestKg, 85);
  });

  it('measures change from the first weigh-in while the log is young, and none with one entry', () => {
    const young = parseBodyWeightLog(JSON.stringify([
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-06', weightKg: 80.6 },
    ]));
    assert.deepEqual(summarizeBodyWeight(young)!.change, { kg: 0.6, days: 5 });
    assert.equal(summarizeBodyWeight([{ date: '2026-10-06', weightKg: 80 }])!.change, undefined);
    assert.equal(summarizeBodyWeight([]), null);
  });

  it('filters chart ranges back from today', () => {
    const log = parseBodyWeightLog(JSON.stringify([
      { date: '2025-09-01', weightKg: 90 },
      { date: '2026-08-01', weightKg: 85 },
      { date: '2026-10-01', weightKg: 82 },
    ]));
    const now = new Date(2026, 9, 11, 9);
    assert.equal(filterBodyWeightRange(log, '1M', now).length, 1);
    assert.equal(filterBodyWeightRange(log, '3M', now).length, 2);
    assert.equal(filterBodyWeightRange(log, '1Y', now).length, 2);
    assert.equal(filterBodyWeightRange(log, 'ALL', now).length, 3);
  });

  it('labels weigh-in days', () => {
    const now = new Date(2026, 9, 11, 9);
    assert.equal(formatWeighInDate('2026-10-11', now), 'Today');
    assert.equal(formatWeighInDate('2026-10-10', now), 'Yesterday');
    assert.equal(formatWeighInDate('2026-10-06', now), 'Tue 6 Oct');
    assert.equal(formatWeighInDate('2025-10-06', now), 'Mon 6 Oct 2025');
  });

  it('averages the trend over the 7 days up to each weigh-in', () => {
    const log = parseBodyWeightLog(JSON.stringify([
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-03', weightKg: 82 },
      { date: '2026-10-07', weightKg: 84 },
      { date: '2026-10-08', weightKg: 86 },
    ]));
    assert.deepEqual(bodyWeightTrend(log).map((entry) => entry.weightKg), [80, 81, 82, 84]);
  });
});
