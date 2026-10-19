import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { RoutinesQuery } from '../../src/hooks/useRoutines';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as NodeJS.Module;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let activate: (() => void) | undefined;
let routineReads = 0;
let historyReads = 0;
mockModule('../../src/hooks/useReloadOnActivate', {
  useReloadOnActivate: (callback: () => void) => {
    activate = callback;
  },
});
mockModule('../../src/database/db', {
  getStore: async () => ({ getDataRevision: async () => 5 }),
  getRoutines: async () => {
    routineReads++;
    return [];
  },
  getWorkoutHistory: async () => {
    historyReads++;
    return [
      { id: 'sunday', startTime: new Date(2026, 9, 18, 12).toISOString(), totalVolumeKg: 100 },
    ];
  },
});

test('activation refreshes day and week across midnight without rehydrating unchanged data', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 18, 23, 59).getTime() });
  const { useRoutines } = await import('../../src/hooks/useRoutines');
  let query!: RoutinesQuery;
  function Probe() {
    query = useRoutines();
    return null;
  }
  let mounted!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      mounted = TestRenderer.create(React.createElement(Probe));
    });
    assert.equal(query.week?.workouts, 1);
    assert.equal(query.week?.days.find(day => day.isToday)?.dateKey, '2026-10-18');
    t.mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
    await act(async () => {
      activate!();
    });
    assert.equal(query.week?.days.find(day => day.isToday)?.dateKey, '2026-10-19');
    assert.equal(query.week?.workouts, 0);
    assert.equal(query.week?.streakWeeks, 1);
    assert.equal(routineReads, 1);
    assert.equal(historyReads, 1);
  } finally {
    await act(async () => {
      mounted?.unmount();
    });
  }
});
