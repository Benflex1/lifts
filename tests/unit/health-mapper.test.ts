import assert from 'node:assert/strict';
import test from 'node:test';

import type { Workout } from '../../src/types';
import { fingerprintHealthPayload } from '../../src/health/fingerprint';
import { toHealthWorkoutPayload } from '../../src/health/mapper';

const workoutFixture: Workout = {
  id: 'workout-1',
  name: 'Upper Body',
  gymId: 'gym-1',
  startTime: '2026-09-13T08:00:00.000Z',
  endTime: '2026-09-13T09:15:00.000Z',
  durationSeconds: 1,
  totalVolumeKg: 100,
  exercises: [
    {
      id: 'exercise-instance-1',
      exerciseId: 'bench-press',
      exercise: {
        id: 'bench-press',
        name: 'Bench Press',
        category: 'Chest',
        equipment: 'barbell',
        primaryMuscles: ['chest'],
      },
      sets: [
        {
          id: 'set-1',
          setNumber: 1,
          type: 'normal',
          weightKg: 100,
          reps: 1,
          isCompleted: true,
        },
      ],
      restTimerSeconds: 90,
    },
  ],
};

test('maps a completed workout to the minimal health payload', () => {
  assert.deepEqual(toHealthWorkoutPayload(workoutFixture), {
    workoutId: 'workout-1',
    title: 'Upper Body',
    startTime: '2026-09-13T08:00:00.000Z',
    endTime: '2026-09-13T09:15:00.000Z',
    durationSeconds: 4500,
  });
});

test('derives duration from timestamps instead of the stored duration', () => {
  const payload = toHealthWorkoutPayload(workoutFixture);

  assert.equal(payload.durationSeconds, 4500);
});

test('rejects reversed timestamps', () => {
  assert.throws(
    () =>
      toHealthWorkoutPayload({
        ...workoutFixture,
        startTime: '2026-09-13T09:15:00.000Z',
        endTime: '2026-09-13T08:00:00.000Z',
      }),
    /endTime must be later than startTime/,
  );
});

test('rejects invalid timestamps', () => {
  assert.throws(
    () => toHealthWorkoutPayload({ ...workoutFixture, startTime: 'not-a-date' }),
    /valid ISO timestamps/,
  );
});

test('does not include exercise or set data in the payload', () => {
  const payload = toHealthWorkoutPayload(workoutFixture);

  assert.deepEqual(Object.keys(payload).sort(), [
    'durationSeconds',
    'endTime',
    'startTime',
    'title',
    'workoutId',
  ]);
  assert.equal('exercises' in payload, false);
  assert.equal('gymId' in payload, false);
});

test('fingerprints the five health payload fields in fixed order', () => {
  const payload = toHealthWorkoutPayload(workoutFixture);

  assert.equal(
    fingerprintHealthPayload(payload),
    '["workout-1","Upper Body","2026-09-13T08:00:00.000Z","2026-09-13T09:15:00.000Z",4500]',
  );
});

test('changes the fingerprint when a payload field changes', () => {
  const payload = toHealthWorkoutPayload(workoutFixture);

  assert.notEqual(
    fingerprintHealthPayload(payload),
    fingerprintHealthPayload({ ...payload, title: 'Lower Body' }),
  );
});
