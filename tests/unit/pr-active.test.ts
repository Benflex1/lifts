import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildActiveWorkoutRecordIndex, evaluateActiveWorkoutPRs } from '../../src/workout/pr';
import { Exercise, Gym, Workout } from '../../src/types';

const gyms: Gym[] = [{ id: 'g1', name: 'Home', color: '#000000', isDefault: true } as Gym];
const bench: Exercise = { id: 'bench', name: 'Bench Press', category: 'strength', equipment: 'barbell', primaryMuscles: ['chest'] };

function workout(id: string, startTime: string, sets: [number, number][]): Workout {
  return {
    id,
    name: id,
    gymId: 'g1',
    startTime,
    durationSeconds: 3600,
    totalVolumeKg: 0,
    exercises: [{
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
    }],
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
    assert.equal(rank(workout('active', '2026-10-10T10:00:00.000Z', [[65, 12]]), history).goldCount, 1);
    assert.equal(rank(workout('active', '2026-10-10T10:00:00.000Z', [[65, 9]]), { bench: [] }).goldCount, 1);
  });
});
