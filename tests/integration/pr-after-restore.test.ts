import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';
import { buildBackupJson } from '../../src/utils/backup';
import { restoreBackup } from '../../src/utils/restore';
import { Exercise, Workout } from '../../src/types';
import {
  buildActiveWorkoutRecordIndex,
  evaluateActiveWorkoutPRs,
  evaluateAllWorkoutPRs,
  formatPRDescription,
} from '../../src/workout/pr';

function workout(
  id: string,
  startTime: string,
  exercise: Exercise,
  sets: [number, number][],
): Workout {
  return {
    id,
    name: id,
    gymId: 'gym-default',
    startTime,
    endTime: startTime,
    durationSeconds: 3600,
    totalVolumeKg: 0,
    exercises: [
      {
        id: `${id}-we`,
        exerciseId: exercise.id,
        exercise,
        restTimerSeconds: 0,
        sets: sets.map(([weightKg, reps], i) => ({
          id: `${id}-s${i}`,
          setNumber: i + 1,
          type: 'normal',
          weightKg,
          reps,
          isCompleted: true,
        })),
      },
    ],
  } as Workout;
}

for (const platform of ['native', 'web'] as const) {
  describe(`PR ranking after fresh install + restore [${platform}]`, () => {
    it('ranks a new set against restored history, not as a first-time record', async () => {
      const source = await createStoreFixture(platform);
      const fresh = await createStoreFixture(platform);
      const exercises = await source.store.getAllExercises();
      const bench = exercises.find(e => e.equipment === 'barbell')!;
      const machine = exercises.find(e => e.equipment === 'machine')!;

      await source.store.saveCompletedWorkout(
        workout('w1', '2026-09-01T10:00:00.000Z', bench, [[100, 5]]),
      );
      await source.store.saveCompletedWorkout(
        workout('w2', '2026-09-08T10:00:00.000Z', bench, [
          [100, 8],
          [110, 3],
        ]),
      );
      await source.store.saveCompletedWorkout(
        workout('m1', '2026-09-09T10:00:00.000Z', machine, [[80, 10]]),
      );

      await restoreBackup(await buildBackupJson(source.store), fresh.store);

      const history = await fresh.store.getCompletedWorkoutsForExercises([bench.id, machine.id]);
      assert.equal(history[bench.id].length, 2);
      assert.equal(history[machine.id].length, 1);

      const gyms = await fresh.store.getGyms();
      const scopes = {};
      for (const gymTracking of [false, true]) {
        const active = workout('now', '2026-10-23T10:00:00.000Z', bench, [[100, 4]]);
        active.exercises.push(
          workout('now2', '2026-10-23T10:00:00.000Z', machine, [[60, 10]]).exercises[0],
        );
        const index = buildActiveWorkoutRecordIndex(history, active.id);
        const summary = evaluateActiveWorkoutPRs(active, history, index, gyms, gymTracking, scopes);
        for (const pr of summary.achievements) {
          assert.notEqual(
            formatPRDescription(pr.achievement).includes('first time logged'),
            true,
            `${pr.exerciseName} flagged first-time (gymTracking=${gymTracking})`,
          );
        }
      }

      const all = evaluateAllWorkoutPRs((await fresh.store.readSnapshot()).workouts, gyms, false);
      assert.ok(all);
    });
  });
}

describe('PR ranking when the backup was trained at a non-default gym', () => {
  it(
    'machine exercise logged at default gym after restore says "first time logged"',
    { todo: 'gym-scoped baseline, see review findings' },
    async () => {
      const source = await createStoreFixture('native');
      const fresh = await createStoreFixture('native');
      const machine = (await source.store.getAllExercises()).find(e => e.equipment === 'machine')!;
      const gym = await source.store.createGym('Iron Temple');
      const w = workout('m1', '2026-09-09T10:00:00.000Z', machine, [[80, 10]]);
      w.gymId = gym.id;
      await source.store.saveCompletedWorkout(w);

      await restoreBackup(await buildBackupJson(source.store), fresh.store);

      const history = await fresh.store.getCompletedWorkoutsForExercises([machine.id]);
      assert.equal(history[machine.id].length, 1, 'history is there');
      const gyms = await fresh.store.getGyms();
      const active = workout('now', '2026-10-23T10:00:00.000Z', machine, [[85, 10]]);
      const summary = evaluateActiveWorkoutPRs(
        active,
        history,
        buildActiveWorkoutRecordIndex(history, active.id),
        gyms,
        true,
        {},
      );
      const texts = summary.achievements.map(a => formatPRDescription(a.achievement));
      assert.ok(summary.totalCount >= 1);
      assert.ok(
        texts.every(t => !t.includes('first time logged')),
        `got: ${texts.join(' | ')}`,
      );
    },
  );
});
