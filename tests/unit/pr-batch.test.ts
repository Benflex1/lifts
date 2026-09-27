import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAllWorkoutPRs, evaluateWorkoutPRs } from '../../src/workout/pr';
import { Exercise, ExerciseGymScope, Gym, Workout, WorkoutSet } from '../../src/types';

// Small deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const gyms: Gym[] = [
  { id: 'g1', name: 'Home', color: '#000000', isDefault: true } as Gym,
  { id: 'g2', name: 'FitX', color: '#111111' } as Gym,
  { id: 'g3', name: 'Hotel', color: '#222222' } as Gym,
];

const exercises: Exercise[] = [
  { id: 'bench', name: 'Bench Press', category: 'strength', equipment: 'barbell', primaryMuscles: ['chest'] },
  { id: 'press', name: 'Chest Press', category: 'strength', equipment: 'machine', primaryMuscles: ['chest'] },
  { id: 'pullup', name: 'Pull-up', category: 'strength', equipment: 'body only', primaryMuscles: ['lats'] },
  { id: 'row', name: 'Cable Row', category: 'strength', equipment: 'cable', primaryMuscles: ['back'] },
];

const scopes: Record<string, ExerciseGymScope | undefined> = {
  row: { exerciseId: 'row', scopeType: 'linked_group', linkedGymIds: ['g1', 'g2'] },
};

function randomHistory(seed: number, count: number): Workout[] {
  const rand = rng(seed);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const base = Date.UTC(2025, 0, 1);
  const workouts: Workout[] = [];
  let day = 0;
  for (let w = 0; w < count; w++) {
    // Occasionally reuse the previous start time to exercise the "strictly before" rule.
    if (rand() > 0.15) day += 1 + Math.floor(rand() * 3);
    const startTime = new Date(base + day * 86400000).toISOString();
    const chosen = exercises.filter(() => rand() > 0.35);
    workouts.push({
      id: `w${w}`,
      name: `Workout ${w}`,
      gymId: pick(gyms).id,
      startTime,
      durationSeconds: 3600,
      totalVolumeKg: 0,
      exercises: chosen.map((exercise, e) => ({
        id: `w${w}-e${e}`,
        exerciseId: exercise.id,
        exercise,
        sets: Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, s): WorkoutSet => {
          const bodyweight = exercise.equipment === 'body only';
          return {
            id: `w${w}-e${e}-s${s}`,
            setNumber: s + 1,
            // Coarse values produce plenty of ties and exact repeats.
            weightKg: bodyweight ? 0 : 40 + Math.floor(rand() * 12) * 5,
            reps: 3 + Math.floor(rand() * 8),
            type: rand() > 0.9 ? 'warmup' : 'normal',
            isCompleted: rand() > 0.1,
          } as WorkoutSet;
        }),
      })),
    } as Workout);
  }
  return workouts;
}

function perWorkout(workouts: Workout[], gymTrackingEnabled: boolean) {
  const byExercise: Record<string, Workout[]> = {};
  for (const w of workouts) for (const ex of w.exercises) (byExercise[ex.exerciseId] ||= []).push(w);
  return Object.fromEntries(
    workouts.map(w => [w.id, evaluateWorkoutPRs(w, byExercise, gyms, gymTrackingEnabled, scopes)]),
  );
}

describe('evaluateAllWorkoutPRs', () => {
  for (const gymTrackingEnabled of [true, false]) {
    for (const seed of [1, 7, 42, 1234, 99991]) {
      it(`matches per-workout evaluation (seed ${seed}, gym tracking ${gymTrackingEnabled ? 'on' : 'off'})`, () => {
        const history = randomHistory(seed, 60);
        assert.deepStrictEqual(evaluateAllWorkoutPRs(history, gyms, gymTrackingEnabled, scopes), perWorkout(history, gymTrackingEnabled));
      });
    }
  }

  it('finds PRs in the expected places for a simple progression', () => {
    const history = randomHistory(5, 3).map((w, i) => ({
      ...w,
      gymId: 'g1',
      exercises: [{
        id: `e${i}`,
        exerciseId: 'bench',
        exercise: exercises[0],
        sets: [{ id: `s${i}`, setNumber: 1, weightKg: 100 + i * 5, reps: 5, type: 'normal', isCompleted: true } as WorkoutSet],
      }],
    })) as Workout[];
    const result = evaluateAllWorkoutPRs(history, gyms, true, scopes);
    for (const w of history) assert.equal(result[w.id].setPRs.get(w.exercises[0].sets[0].id)?.primary?.rank, 1);
  });
});
