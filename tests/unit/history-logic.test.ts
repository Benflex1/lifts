import assert from 'node:assert/strict';
import test from 'node:test';
import { ActiveExercise, Gym, Workout, WorkoutHistorySummary, WorkoutSet } from '../../src/types';
import { PRAchievement, SetPRResult } from '../../src/workout/pr';
import {
  buildPRDetailsNotification,
  buildRepeatExercises,
  computeHistoryTotals,
  filterHistoryByGym,
  formatHistoryDate,
} from '../../src/screens/history/historyLogic';

function makeSummary(
  id: string,
  gymId: string,
  overrides: Partial<WorkoutHistorySummary> = {},
): WorkoutHistorySummary {
  return {
    id,
    name: `Workout ${id}`,
    gymId,
    startTime: '2024-06-15T10:00:00.000Z',
    durationSeconds: 3600,
    totalVolumeKg: 1000,
    totalSets: 10,
    exerciseNames: ['Bench Press'],
    ...overrides,
  };
}

function makeSet(id: string, setNumber: number, overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    setNumber,
    type: 'normal',
    weightKg: 100,
    reps: 5,
    isCompleted: true,
    ...overrides,
  };
}

function makeActiveExercise(
  id: string,
  exerciseId: string,
  overrides: Partial<ActiveExercise> = {},
): ActiveExercise {
  return {
    id,
    exerciseId,
    exercise: {
      id: exerciseId,
      name: `Exercise ${exerciseId}`,
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
    },
    restTimerSeconds: 120,
    sets: [makeSet(`set-${id}-1`, 1)],
    ...overrides,
  };
}

function makeWorkoutDetail(): Workout {
  return {
    id: 'w-detail',
    name: 'Push Day',
    gymId: 'g1',
    startTime: '2024-06-01T10:00:00.000Z',
    durationSeconds: 3600,
    totalVolumeKg: 2000,
    exercises: [
      makeActiveExercise('ae1', 'ex1', {
        targetReps: '8-12',
        supersetId: 'ss1',
        sets: [
          makeSet('s1', 1, { type: 'drop', weightKg: 80, reps: 8, rpe: 9 }),
          makeSet('s2', 2, { type: undefined, weightKg: 60, reps: 12 }),
        ],
      }),
      makeActiveExercise('ae2', 'ex2', {
        targetReps: undefined,
        restTimerSeconds: undefined,
        sets: [makeSet('s3', 1, { targetReps: '5' }), makeSet('s4', 2, { targetReps: undefined })],
      }),
    ],
  };
}

function makeGym(): Gym {
  return {
    id: 'g1',
    name: 'Home Gym',
    isDefault: true,
    color: '#ff0000',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

test('formatHistoryDate renders short weekday labels and never throws', () => {
  const local = new Date(2024, 5, 15, 12, 0, 0); // Sat, Jun 15 2024 local time
  assert.equal(formatHistoryDate(local.toISOString()), 'Sat, Jun 15');

  // Unparseable input falls through without throwing.
  assert.equal(typeof formatHistoryDate('definitely-not-a-date'), 'string');
});

test('filterHistoryByGym narrows to the selected gym or passes everything through', () => {
  const history = [makeSummary('w1', 'g1'), makeSummary('w2', 'g2'), makeSummary('w3', 'g1')];

  assert.deepEqual(
    filterHistoryByGym(history, null).map(w => w.id),
    ['w1', 'w2', 'w3'],
  );
  assert.deepEqual(
    filterHistoryByGym(history, 'g1').map(w => w.id),
    ['w1', 'w3'],
  );
  assert.deepEqual(
    filterHistoryByGym(history, 'missing').map(w => w.id),
    [],
  );
});

test('computeHistoryTotals counts workouts and sums volume', () => {
  const history = [
    makeSummary('w1', 'g1', { totalVolumeKg: 1200 }),
    makeSummary('w2', 'g1', { totalVolumeKg: 800.5 }),
  ];

  assert.deepEqual(computeHistoryTotals(history), { totalWorkouts: 2, totalVolumeKg: 2000.5 });
  assert.deepEqual(computeHistoryTotals([]), { totalWorkouts: 0, totalVolumeKg: 0 });
});

test('buildRepeatExercises rebuilds the draft with fresh IDs and preserved history', () => {
  let counter = 0;
  const uuid = () => `uuid${counter++}`;

  const exercises = buildRepeatExercises(makeWorkoutDetail(), makeGym(), uuid);

  assert.equal(exercises.length, 2);

  const [first, second] = exercises;
  assert.equal(first.id, 'ae-wo-again-uuid0-ex1-occ0-uuid1');
  assert.equal(first.exerciseId, 'ex1');
  assert.equal(first.supersetId, 'ss1');
  assert.equal(first.restTimerSeconds, 120);
  assert.equal(first.targetReps, '8-12');
  assert.equal(first.notes, '');

  assert.equal(first.sets.length, 2);
  assert.equal(first.sets[0].id, 'set-ae-wo-again-uuid0-ex1-occ0-uuid1-1-uuid2');
  assert.equal(first.sets[0].setNumber, 1);
  assert.equal(first.sets[0].type, 'drop');
  assert.equal(first.sets[0].weightKg, 80);
  assert.equal(first.sets[0].reps, 8);
  assert.equal(first.sets[0].rpe, 9);
  assert.equal(first.sets[0].isCompleted, false);
  assert.equal(first.sets[0].previousWeightKg, 80);
  assert.equal(first.sets[0].previousReps, 8);
  assert.equal(first.sets[0].previousGymId, 'g1');
  assert.equal(first.sets[0].previousGymName, 'Home Gym');
  assert.equal(first.sets[1].type, 'normal');

  assert.equal(second.restTimerSeconds, 90);
  assert.equal(second.targetReps, '5');
  assert.equal(second.sets[0].targetReps, '5');
  assert.equal(second.sets[1].targetReps, '10');
});

test('buildRepeatExercises drops gym provenance when the source gym is unknown', () => {
  const exercises = buildRepeatExercises(makeWorkoutDetail(), null, () => 'abcdef');

  assert.equal(exercises[0].sets[0].previousGymId, undefined);
  assert.equal(exercises[0].sets[0].previousGymName, undefined);
});

test('buildPRDetailsNotification maps ranks to titles and formats the body', () => {
  const achievement: PRAchievement = {
    rank: 2,
    metric: 'weight',
    scope: 'gym',
    value: 105,
    previousRecord: 100,
  };
  const setPR: SetPRResult = { setId: 's1', primary: achievement, achievements: [achievement] };

  const notification = buildPRDetailsNotification('Bench Press', 3, setPR, 'kg');
  assert.equal(notification.title, 'Silver Record');
  assert.ok(notification.message.startsWith('Bench Press (Set #3)\n\n• '));

  assert.equal(
    buildPRDetailsNotification(
      'Bench Press',
      1,
      { ...setPR, primary: { ...achievement, rank: 1 } },
      'kg',
    ).title,
    'Personal Record',
  );
  assert.equal(
    buildPRDetailsNotification(
      'Bench Press',
      1,
      { ...setPR, primary: { ...achievement, rank: 1, isTie: true } },
      'kg',
    ).title,
    'Tied Personal Record',
  );
  assert.equal(
    buildPRDetailsNotification(
      'Bench Press',
      1,
      { ...setPR, primary: { ...achievement, rank: 3 } },
      'kg',
    ).title,
    'Bronze Record',
  );
});
