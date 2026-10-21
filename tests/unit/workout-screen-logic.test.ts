import assert from 'node:assert/strict';
import test from 'node:test';
import { Exercise, Routine, RoutineExercise } from '../../src/types';
import {
  buildRoutineSummary,
  collectRoutineFolders,
  filterRoutinesByFolder,
  formatTodayLabel,
  formatWeekDuration,
} from '../../src/screens/workout/workoutScreenLogic';

function makeExercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    category: 'strength',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
  };
}

function makeRoutineExercise(
  id: string,
  name: string,
  overrides: Partial<RoutineExercise> = {},
): RoutineExercise {
  return {
    id,
    exerciseId: `ex-${id}`,
    exercise: makeExercise(`ex-${id}`, name),
    orderIndex: 0,
    targetSets: 3,
    targetReps: '8-12',
    restTimerSeconds: 90,
    ...overrides,
  };
}

function makeRoutine(id: string, name: string, overrides: Partial<Routine> = {}): Routine {
  return {
    id,
    name,
    exercises: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('collectRoutineFolders dedupes folder names in first-seen order', () => {
  const routines = [
    makeRoutine('r1', 'A', { folderName: 'Push' }),
    makeRoutine('r2', 'B', { folderName: 'Pull' }),
    makeRoutine('r3', 'C', { folderName: 'Push' }),
    makeRoutine('r4', 'D'),
  ];

  assert.deepEqual(collectRoutineFolders(routines), ['All', 'Push', 'Pull']);
  assert.deepEqual(collectRoutineFolders([]), ['All']);
});

test('filterRoutinesByFolder passes everything through for All and narrows otherwise', () => {
  const routines = [
    makeRoutine('r1', 'A', { folderName: 'Push' }),
    makeRoutine('r2', 'B', { folderName: 'Pull' }),
    makeRoutine('r3', 'C', { folderName: 'Push' }),
    makeRoutine('r4', 'D'),
  ];

  assert.deepEqual(
    filterRoutinesByFolder(routines, 'All').map(r => r.id),
    ['r1', 'r2', 'r3', 'r4'],
  );
  assert.deepEqual(
    filterRoutinesByFolder(routines, 'Push').map(r => r.id),
    ['r1', 'r3'],
  );
  assert.deepEqual(
    filterRoutinesByFolder(routines, 'Legs').map(r => r.id),
    [],
  );
});

test('buildRoutineSummary counts exercises, sets, and supersets', () => {
  const routine = makeRoutine('r1', 'Full Body', {
    exercises: [
      makeRoutineExercise('re1', 'Bench Press', { targetSets: 3 }),
      makeRoutineExercise('re2', 'Squat', { targetSets: 4 }),
    ],
  });

  assert.deepEqual(buildRoutineSummary(routine), {
    hasSupersets: false,
    exerciseCount: 2,
    setCount: 7,
    preview: 'Bench Press · Squat',
  });

  const supersetRoutine = makeRoutine('r2', 'Arm Blast', {
    exercises: [
      makeRoutineExercise('re3', 'Curl', { supersetId: 'ss1' }),
      makeRoutineExercise('re4', 'Pushdown', { supersetId: 'ss1' }),
    ],
  });

  assert.equal(buildRoutineSummary(supersetRoutine).hasSupersets, true);
});

test('formatTodayLabel includes the day of month', () => {
  const label = formatTodayLabel(new Date(2024, 5, 15, 12, 0, 0));
  assert.equal(typeof label, 'string');
  assert.ok(label.includes('15'), `expected the day number in "${label}"`);
});

test('formatWeekDuration switches between hours and minutes', () => {
  assert.equal(formatWeekDuration(5400), '1.5h');
  assert.equal(formatWeekDuration(3600), '1.0h');
  assert.equal(formatWeekDuration(2700), '45m');
  assert.equal(formatWeekDuration(0), '0m');
});
