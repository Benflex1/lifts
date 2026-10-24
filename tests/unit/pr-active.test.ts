import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActiveWorkoutRecordIndex,
  evaluateActiveWorkoutPRs,
  evaluateAllWorkoutPRs,
  formatPRDescription,
  isSameSetPRResult,
} from '../../src/workout/pr';
import { Exercise, Gym, Workout } from '../../src/types';

const gyms: Gym[] = [{ id: 'g1', name: 'Home', color: '#000000', isDefault: true } as Gym];
const bench: Exercise = {
  id: 'bench',
  name: 'Bench Press',
  category: 'strength',
  equipment: 'barbell',
  primaryMuscles: ['chest'],
};

function workout(id: string, startTime: string, sets: [number, number][]): Workout {
  return {
    id,
    name: id,
    gymId: 'g1',
    startTime,
    durationSeconds: 3600,
    totalVolumeKg: 0,
    exercises: [
      {
        id: `${id}-bench`,
        exerciseId: 'bench',
        exercise: bench,
        sets: sets.map(([weightKg, reps], i) => ({
          id: `${id}-s${i}`,
          setNumber: i + 1,
          weightKg,
          reps,
          isCompleted: true,
        })),
      },
    ],
  } as Workout;
}

function rank(active: Workout, history: Record<string, Workout[]>) {
  const index = buildActiveWorkoutRecordIndex(history, active.id);
  return evaluateActiveWorkoutPRs(active, history, index, gyms, false);
}

describe('Live PR ranking during a workout', () => {
  it('does not call 9x65 a PR when 11x65 is already on record', () => {
    const history = { bench: [workout('prev', '2026-10-01T10:00:00.000Z', [[65, 11]])] };
    const active = workout('active', '2026-10-10T10:00:00.000Z', [[65, 9]]);
    assert.equal(rank(active, history).goldCount, 0);
  });

  it('counts records saved after the active workout started, e.g. from a resumed draft', () => {
    const history = { bench: [workout('later', '2026-10-09T10:00:00.000Z', [[65, 11]])] };
    const active = workout('draft', '2026-10-08T10:00:00.000Z', [[65, 9]]);
    assert.equal(rank(active, history).goldCount, 0);
  });

  it('ignores the active workout if it already appears in history', () => {
    const active = workout('active', '2026-10-10T10:00:00.000Z', [[70, 5]]);
    const history = { bench: [workout('prev', '2026-10-01T10:00:00.000Z', [[65, 11]]), active] };
    const summary = rank(active, history);
    assert.equal(summary.setPRs.get('active-s0')?.primary?.metric, 'weight');
    assert.equal(summary.setPRs.get('active-s0')?.primary?.rank, 1);
  });

  it('flags nothing until the exercise history has loaded', () => {
    const active = workout('active', '2026-10-10T10:00:00.000Z', [[65, 9]]);
    assert.equal(rank(active, {}).totalCount, 0);
  });

  it('still flags a real record and a first-ever performance', () => {
    const history = { bench: [workout('prev', '2026-10-01T10:00:00.000Z', [[65, 11]])] };
    assert.equal(
      rank(workout('active', '2026-10-10T10:00:00.000Z', [[65, 12]]), history).goldCount,
      1,
    );
    assert.equal(
      rank(workout('active', '2026-10-10T10:00:00.000Z', [[65, 9]]), { bench: [] }).goldCount,
      1,
    );
  });

  it('does not call 60x10 a new record against an earlier 45 kg and a later-dated 60x14', () => {
    const history = {
      bench: [
        workout('old', '2026-09-01T10:00:00.000Z', [[45, 10]]),
        workout('imported', '2026-10-21T09:00:00.000Z', [[60, 14]]),
      ],
    };
    const active = workout('active', '2026-10-20T20:00:00.000Z', [[60, 10]]);
    assert.equal(rank(active, history).goldCount, 0);
  });

  it('describes what a record beat, including first-ever and reps at the same weight', () => {
    const history = { bench: [workout('prev', '2026-10-01T10:00:00.000Z', [[65, 11]])] };
    const reps = rank(workout('a', '2026-10-10T10:00:00.000Z', [[65, 12]]), history);
    const repsDesc = formatPRDescription(reps.setPRs.get('a-s0')!.achievements[0], 'kg');
    assert.match(repsDesc, /Most reps at 65 kg ever \(beats 11 reps\)/);

    const first = rank(workout('b', '2026-10-10T10:00:00.000Z', [[65, 9]]), { bench: [] });
    const firstDesc = formatPRDescription(first.setPRs.get('b-s0')!.achievements[0], 'kg');
    assert.match(firstDesc, /first time logged/);
  });
});

describe('PR wording and comparison helpers', () => {
  const base = {
    rank: 1 as const,
    metric: 'weight' as const,
    value: 100,
    isTie: false,
  };

  it('does not claim a gym-scoped first record is new overall', () => {
    const gymText = formatPRDescription({ ...base, scope: 'gym', gymName: 'Home' });
    assert.ok(gymText.endsWith('(first time logged here)'), gymText);
    const globalText = formatPRDescription({ ...base, scope: 'global' });
    assert.ok(globalText.endsWith('(first time logged)'), globalText);
  });

  it('treats results with different secondary achievements as different', () => {
    const primary = { ...base, scope: 'global' as const };
    const volumeA = { ...primary, metric: 'volume' as const, value: 500 };
    const volumeB = { ...volumeA, value: 600 };
    const a = { setId: 's', primary, achievements: [primary, volumeA] };
    const b = { setId: 's', primary, achievements: [primary, volumeB] };
    assert.equal(isSameSetPRResult(a, b), false);
    assert.equal(isSameSetPRResult(a, { ...a, achievements: [primary, { ...volumeA }] }), true);
  });

  it('ranks a workout without a start time against others, not against itself', () => {
    const prev = workout('prev', '2026-10-01T10:00:00.000Z', [[100, 5]]);
    const noTime = workout('x', '', [[90, 5]]);
    (noTime as { startTime?: string }).startTime = undefined;
    const results = evaluateAllWorkoutPRs([prev, noTime], gyms, false);
    assert.equal(results.x.setPRs.size, 1, 'only 2nd place against the 100 kg set');
    assert.equal(results.x.goldCount, 0);
    const lone = workout('y', '', [[90, 5]]);
    (lone as { startTime?: string }).startTime = undefined;
    assert.equal(evaluateAllWorkoutPRs([lone], gyms, false).y.goldCount, 1);
  });
});
