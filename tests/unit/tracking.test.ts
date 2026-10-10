import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActiveExercise, Exercise, Workout, WorkoutSet } from '../../src/types';
import {
  displayToMeters,
  exerciseVolumeKg,
  fillTrackedSetFromPrevious,
  formatSetDuration,
  formatTrackedSet,
  mergeTrackingTypeOverrides,
  parseSetDuration,
  parseTrackingTypeOverrides,
  parseTrackingTypesEnabled,
  resolveTrackingTypeForExercise,
  setRecordValues,
  suggestTrackingType,
  validateTrackedSet,
  withPreviousTracked,
  withTrackingType,
} from '../../src/workout/tracking';
import { evaluateAllWorkoutPRs, evaluateWorkoutPRs, extractExercisePodium, formatPRDescription } from '../../src/workout/pr';
import { calculate1RM } from '../../src/utils/calculator';
import { createWorkoutSetsFromSuggestions } from '../../src/workout/gym-session';
import { formatPreviousMetric } from '../../src/workout/gym-display';

const plank: Exercise = { id: 'Plank', name: 'Plank', category: 'strength', equipment: 'body only', primaryMuscles: ['abdominals'] };
const run: Exercise = { id: 'Running_Treadmill', name: 'Running, Treadmill', category: 'cardio', equipment: 'machine', primaryMuscles: ['quadriceps'] };
const pushUp: Exercise = { id: 'Pushups', name: 'Pushups', category: 'strength', equipment: 'body only', primaryMuscles: ['chest'] };
const bench: Exercise = { id: 'Bench', name: 'Bench Press', category: 'strength', equipment: 'barbell', primaryMuscles: ['chest'] };
const stretch: Exercise = { id: 'Calf_Stretch', name: 'Calf Stretch', category: 'stretching', equipment: 'body only', primaryMuscles: ['calves'] };

function set(overrides: Partial<WorkoutSet>): WorkoutSet {
  return { id: 's1', setNumber: 1, type: 'normal', weightKg: 0, reps: 0, isCompleted: true, ...overrides };
}

function workout(id: string, startTime: string, exercises: ActiveExercise[]): Workout {
  return { id, name: id, gymId: 'gym-default', startTime, durationSeconds: 0, totalVolumeKg: 0, exercises };
}

describe('tracking type setting', () => {
  it('is off unless explicitly turned on', () => {
    assert.equal(parseTrackingTypesEnabled(null), false);
    assert.equal(parseTrackingTypesEnabled('false'), false);
    assert.equal(parseTrackingTypesEnabled('true'), true);
  });

  it('logs every exercise as weight and reps while the setting is off', () => {
    for (const exercise of [plank, run, pushUp, bench, stretch]) {
      assert.equal(resolveTrackingTypeForExercise(exercise, false, { [exercise.id]: 'duration' }), 'weight_reps');
    }
  });

  it('suggests a type from the library category and equipment when on', () => {
    assert.equal(suggestTrackingType(plank), 'duration');
    assert.equal(suggestTrackingType(run), 'distance_duration');
    assert.equal(suggestTrackingType(stretch), 'duration');
    assert.equal(suggestTrackingType(pushUp), 'bodyweight_reps');
    assert.equal(suggestTrackingType(bench), 'weight_reps');
  });

  it('prefers the user choice over the suggestion', () => {
    assert.equal(resolveTrackingTypeForExercise(pushUp, true, { Pushups: 'weighted_bodyweight' }), 'weighted_bodyweight');
  });

  it('never stores the default type, so weight-only workouts are unchanged', () => {
    const exercise = { id: 'ae', trackingType: 'duration' as const };
    assert.deepEqual(withTrackingType(exercise, 'weight_reps'), { id: 'ae' });
    assert.deepEqual(withTrackingType({ id: 'ae' }, 'duration'), { id: 'ae', trackingType: 'duration' });
  });

  it('parses overrides defensively and merges a backup under local choices', () => {
    assert.deepEqual(parseTrackingTypeOverrides('not json'), {});
    assert.deepEqual(parseTrackingTypeOverrides('{"a":"duration","b":"bogus"}'), { a: 'duration' });
    const merged = mergeTrackingTypeOverrides('{"a":"duration"}', '{"a":"bodyweight_reps","b":"distance_duration"}');
    assert.deepEqual(JSON.parse(merged), { a: 'duration', b: 'distance_duration' });
  });
});

describe('time and distance values', () => {
  it('parses and formats set times', () => {
    assert.equal(parseSetDuration('45'), 45);
    assert.equal(parseSetDuration('1:30'), 90);
    assert.equal(parseSetDuration('1:02:05'), 3725);
    assert.equal(parseSetDuration('1:75'), undefined);
    assert.equal(parseSetDuration('abc'), undefined);
    assert.equal(formatSetDuration(90), '1:30');
    assert.equal(formatSetDuration(3725), '1:02:05');
  });

  it('formats sets per type', () => {
    assert.equal(formatTrackedSet({ weightKg: 100, reps: 5 }, 'weight_reps', 'kg'), '100 kg × 5');
    assert.equal(formatTrackedSet({ weightKg: 0, reps: 12 }, 'bodyweight_reps', 'kg'), '12 reps');
    assert.equal(formatTrackedSet({ weightKg: 20, reps: 8 }, 'weighted_bodyweight', 'kg'), '+20 kg × 8');
    assert.equal(formatTrackedSet({ weightKg: 30, reps: 8 }, 'assisted_bodyweight', 'kg'), '−30 kg × 8');
    assert.equal(formatTrackedSet({ weightKg: 0, reps: 0, durationSeconds: 60 }, 'duration', 'kg'), '1:00');
    assert.equal(
      formatTrackedSet({ weightKg: 0, reps: 0, distanceM: 5000, durationSeconds: 1500 }, 'distance_duration', 'kg'),
      '5 km · 25:00',
    );
    assert.equal(formatTrackedSet({ weightKg: 0, reps: 0, distanceM: displayToMeters(3, 'mi') }, 'distance_duration', 'lb'), '3 mi');
  });

  it('shows the previous column per type', () => {
    assert.equal(formatPreviousMetric({ weightKg: 0, reps: 0, durationSeconds: 45 }, 'kg', 'duration'), '0:45');
    assert.equal(formatPreviousMetric({ weightKg: 80, reps: 8 }, 'kg'), '80 kg × 8');
  });
});

describe('tracked set validation and volume', () => {
  it('requires the values each type records', () => {
    assert.equal(validateTrackedSet(set({ reps: 10 }), 'bodyweight_reps'), null);
    assert.equal(validateTrackedSet(set({}), 'bodyweight_reps'), 'Reps must be greater than 0');
    assert.equal(validateTrackedSet(set({ durationSeconds: 30 }), 'duration'), null);
    assert.equal(validateTrackedSet(set({}), 'duration'), 'Time must be greater than 0');
    assert.equal(validateTrackedSet(set({ distanceM: 400 }), 'distance_duration'), null);
    assert.equal(validateTrackedSet(set({}), 'distance_duration'), 'Enter a distance or a time');
    assert.equal(validateTrackedSet(set({ weightKg: -1, reps: 5 }), 'weight_reps'), 'Weight cannot be negative');
  });

  it('fills an empty timed set from last session when it is checked off', () => {
    const filled = fillTrackedSetFromPrevious(set({ previousDurationSeconds: 60, previousDistanceM: 1000 }), 'distance_duration');
    assert.equal(filled.durationSeconds, 60);
    assert.equal(filled.distanceM, 1000);
    const typed = fillTrackedSetFromPrevious(set({ durationSeconds: 75, previousDurationSeconds: 60, previousDistanceM: 1000 }), 'distance_duration');
    assert.equal(typed.durationSeconds, 75);
    assert.equal(typed.distanceM, undefined);
  });

  it('only counts load from weight and weighted bodyweight sets toward volume', () => {
    const sets = [set({ weightKg: 20, reps: 10 })];
    assert.equal(exerciseVolumeKg({ sets }), 200);
    assert.equal(exerciseVolumeKg({ sets, trackingType: 'weighted_bodyweight' }), 200);
    assert.equal(exerciseVolumeKg({ sets, trackingType: 'assisted_bodyweight' }), 0);
    assert.equal(exerciseVolumeKg({ sets, trackingType: 'duration' }), 0);
  });

  it('keeps weight and reps record values identical to the previous rules', () => {
    const estimate = (w: number, r: number) => calculate1RM(w, r).average;
    assert.deepEqual(setRecordValues(set({ weightKg: 100, reps: 5 }), 'weight_reps', estimate), {
      weight: 100, '1rm': estimate(100, 5), volume: 500, reps: 0, duration: 0, distance: 0,
    });
    assert.equal(setRecordValues(set({ reps: 12 }), 'weight_reps', estimate).reps, 12);
    assert.equal(setRecordValues(set({ weightKg: 30, reps: 8 }), 'assisted_bodyweight', estimate).weight, 0);
  });

  it('adds previous time and distance only when last session had them', () => {
    const base = { id: 'x', previousDurationSeconds: 10 };
    assert.deepEqual(withPreviousTracked(base, { durationSeconds: 30 }), { id: 'x', previousDurationSeconds: 30 });
    assert.deepEqual(withPreviousTracked(base, undefined), { id: 'x' });
    const [plain] = createWorkoutSetsFromSuggestions({
      activeExerciseId: 'ae', targetSets: 1, suggestions: [{ weightKg: 50, reps: 5 }],
    });
    assert.equal('previousDurationSeconds' in plain, false);
  });
});

describe('records for tracked exercises', () => {
  const timed = (id: string, start: string, seconds: number[]): Workout =>
    workout(id, start, [{
      id: `ae-${id}`, exerciseId: plank.id, exercise: plank, restTimerSeconds: 0, trackingType: 'duration',
      sets: seconds.map((durationSeconds, index) => set({ id: `${id}-${index}`, setNumber: index + 1, durationSeconds })),
    }]);

  it('ranks the longest hold as a time record', () => {
    const first = timed('w1', '2026-01-01T10:00:00Z', [60]);
    const second = timed('w2', '2026-01-08T10:00:00Z', [45, 90]);
    const summary = evaluateWorkoutPRs(second, { [plank.id]: [first, second] }, [], false);
    const best = summary.setPRs.get('w2-1');
    assert.equal(best?.primary?.metric, 'duration');
    assert.equal(best?.primary?.rank, 1);
    assert.equal(best?.primary?.previousRecord, 60);
    assert.equal(formatPRDescription(best!.primary!), 'Longest time ever (beats 1:00)');

    const all = evaluateAllWorkoutPRs([first, second], [], false);
    assert.equal(all.w2.setPRs.get('w2-1')?.primary?.metric, 'duration');
  });

  it('builds a time podium and leaves weight podiums empty', () => {
    const podium = extractExercisePodium([timed('w1', '2026-01-01T10:00:00Z', [60, 75])], plank.id, [], null);
    assert.equal(podium.duration[0].value, 75);
    assert.equal(podium.weight.length, 0);
  });

  it('does not count assistance as a weight record', () => {
    const assisted = workout('w1', '2026-01-01T10:00:00Z', [{
      id: 'ae', exerciseId: pushUp.id, exercise: pushUp, restTimerSeconds: 0, trackingType: 'assisted_bodyweight',
      sets: [set({ id: 'a', weightKg: 30, reps: 8 })],
    }]);
    const summary = evaluateWorkoutPRs(assisted, { [pushUp.id]: [assisted] }, [], false);
    assert.equal(summary.totalCount, 0);
  });
});
