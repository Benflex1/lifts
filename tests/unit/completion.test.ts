import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { saveCompletedWorkoutEdit } from '../../src/workout/completion';
import { clearErrorBreadcrumbs, setErrorSink } from '../../src/utils/errorReporting';
import { Workout } from '../../src/types';

const workout: Workout = {
  id: 'completed-1',
  name: 'Push Day',
  gymId: 'gym-default',
  startTime: '2026-09-07T10:00:00.000Z',
  durationSeconds: 3600,
  totalVolumeKg: 1200,
  exercises: [],
};

describe('completion update use case', () => {
  beforeEach(() => {
    clearErrorBreadcrumbs();
    setErrorSink(null);
  });

  it('persists the edit and resolves with the updated workout', async () => {
    const saved: Workout[] = [];

    const result = await saveCompletedWorkoutEdit(workout, async (candidate) => {
      saved.push(candidate);
    });

    assert.equal(saved.length, 1);
    assert.equal(saved[0], workout);
    assert.equal(result, workout);
  });

  it('rethrows persistence failures after reporting them', async () => {
    const failure = new Error('write failed');
    const scopes: string[] = [];
    setErrorSink((_error, context) => scopes.push(context.scope));

    await assert.rejects(
      () =>
        saveCompletedWorkoutEdit(workout, async () => {
          throw failure;
        }),
      (error: unknown) => error === failure,
    );

    assert.deepEqual(scopes, ['completion.update']);
  });
});
