import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { installReactNativeMock, loadRNTL, mockModule } from '../helpers/rntlHarness';

/**
 * PERF-03 renderer-level verification (deferred to DX-02): the Records screen
 * must never re-run `buildTrophyRoomSummary` while the user types. The spy
 * wraps the real implementation so the rendered records stay meaningful.
 */

installReactNativeMock();
const rntl = loadRNTL();

const aggregateCalls: unknown[][] = [];
const trophyRoom =
  require('../../src/workout/trophy-room') as typeof import('../../src/workout/trophy-room');
mockModule('../../src/workout/trophy-room', {
  ...trophyRoom,
  buildTrophyRoomSummary: (...args: unknown[]) => {
    aggregateCalls.push(args);
    return (trophyRoom.buildTrophyRoomSummary as (...inner: unknown[]) => unknown)(...args);
  },
});

mockModule('../../src/components/ui', { Chip: 'Chip', PRMark: 'PRMark' });
mockModule('../../src/components/ExerciseDetailModal', {
  ExerciseDetailModal: 'ExerciseDetailModal',
});

const bench = {
  id: 'bench',
  name: 'Bench Press',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: 'barbell',
  category: 'strength',
};
const squat = {
  id: 'squat',
  name: 'Barbell Squat',
  primaryMuscles: ['legs'],
  secondaryMuscles: [],
  equipment: 'barbell',
  category: 'strength',
};

const workouts = [
  {
    id: 'w1',
    name: 'Power Day',
    gymId: 'g1',
    startTime: '2026-08-01T10:00:00.000Z',
    durationSeconds: 3600,
    totalVolumeKg: 3000,
    exercises: [
      {
        id: 'ae1',
        exerciseId: bench.id,
        exercise: bench,
        restTimerSeconds: 90,
        sets: [
          { id: 's1', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true },
        ],
      },
      {
        id: 'ae2',
        exerciseId: squat.id,
        exercise: squat,
        restTimerSeconds: 90,
        sets: [
          { id: 's2', setNumber: 1, type: 'normal', weightKg: 140, reps: 5, isCompleted: true },
        ],
      },
    ],
  },
];

const analytics = {
  workouts,
  exercises: [bench, squat],
  gyms: [],
  scopes: {},
  gymTrackingEnabled: false,
  unit: 'kg',
  reload: () => {},
};

test('typing in the records search never re-runs the trophy-room aggregate (PERF-03)', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { RecordsSection } = await import('../../src/screens/analytics/RecordsSection');

  aggregateCalls.length = 0;
  const view = await rntl.render(
    React.createElement(RecordsSection, { analytics: analytics as never }),
  );

  assert.equal(aggregateCalls.length, 1, 'the aggregate runs once on mount');
  assert.equal(view.getAllByTestId('record-row').length, 2, 'both records render as rows');

  const searchInput = view.getByPlaceholderText('Search records');
  await rntl.fireEvent.changeText(searchInput, 'squat');
  await rntl.act(async () => {
    t.mock.timers.tick(250);
  });

  assert.equal(
    aggregateCalls.length,
    1,
    'the aggregate must not re-run when the committed search text changes',
  );
  const squattedRows = view.getAllByTestId('record-row');
  assert.equal(squattedRows.length, 1, 'non-matching rows are filtered out');
  assert.ok(view.getAllByText('Barbell Squat').length > 0);

  await rntl.fireEvent.changeText(searchInput, 'no-such-exercise');
  await rntl.act(async () => {
    t.mock.timers.tick(250);
  });
  assert.equal(aggregateCalls.length, 1);
  assert.equal(view.queryAllByTestId('record-row').length, 0);
  assert.ok(view.getByText('No records match these filters.'));
});
