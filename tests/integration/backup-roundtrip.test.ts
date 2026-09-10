import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';
import { buildBackupJson } from '../../src/utils/backup';
import { computeRestorePlan, restoreBackup } from '../../src/utils/restore';
import { Exercise, Routine, Workout } from '../../src/types';
import { DataSnapshot, Store, WorkoutDraft } from '../../src/database/contract';
import { NodeSqliteDriver } from '../helpers/storeFixture';
import { indexedDB } from 'fake-indexeddb';
import { createWebStore } from '../../src/database/webStore';
import { createNativeStore, SqliteDriver } from '../../src/database/nativeStore';

class FailingSqliteDriver implements SqliteDriver {
  private calls = 0;
  public armed = false;

  constructor(private readonly inner: NodeSqliteDriver, private readonly failAfter: number) {}

  execAsync(sql: string): Promise<void> { return this.inner.execAsync(sql); }
  getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> { return this.inner.getFirstAsync<T>(sql, ...params); }
  getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> { return this.inner.getAllAsync<T>(sql, ...params); }
  async runAsync(sql: string, ...params: any[]): Promise<{ changes: number; lastInsertRowId: number }> {
    const result = await this.inner.runAsync(sql, ...params);
    if (this.armed && ++this.calls === this.failAfter) throw new Error('Injected merge failure');
    return result;
  }
  withTransactionAsync(task: () => Promise<void>): Promise<void> { return this.inner.withTransactionAsync(task); }
  close(): void { this.inner.close(); }
}

function createFailingIdbFactory(failAfterWrites: number): { factory: IDBFactory; arm: () => void } {
  let enabled = false;
  let writes = 0;

  const wrapStore = (store: any, transaction: any): any => new Proxy(store, {
    get(target, property, receiver) {
      if (['add', 'clear', 'delete', 'put'].includes(String(property))) {
        return (...args: any[]) => {
          const result = target[property](...args);
          if (enabled && ++writes === failAfterWrites) transaction.abort();
          return result;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const wrapTransaction = (transaction: any): any => new Proxy(transaction, {
    get(target, property, receiver) {
      if (property === 'objectStore') return (name: string) => wrapStore(target.objectStore(name), target);
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const wrapDatabase = (database: any): any => new Proxy(database, {
    get(target, property, receiver) {
      if (property === 'transaction') return (...args: any[]) => wrapTransaction(target.transaction(...args));
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const factory = {
    open(name: string, version?: number): IDBOpenDBRequest {
      const request = indexedDB.open(name, version);
      return new Proxy(request, {
        get(target, property, receiver) {
          if (property === 'result') return target.result ? wrapDatabase(target.result) : target.result;
          return Reflect.get(target, property, receiver);
        },
      });
    },
  } as unknown as IDBFactory;

  return {
    factory,
    arm: () => { writes = 0; enabled = true; },
  };
}

function buildFailureSnapshot(before: DataSnapshot): DataSnapshot {
  const gym = {
    id: 'gym-merge-failure', name: 'Merge Failure Gym', color: '#10B981', isDefault: false,
    createdAt: '2026-09-10T00:00:00.000Z',
  };
  const workout: Workout = {
    id: 'merge-failure-workout', name: 'Merge Failure Workout', gymId: gym.id,
    startTime: '2026-09-10T08:00:00.000Z', durationSeconds: 1, totalVolumeKg: 0, exercises: [],
  };
  return {
    exercises: [],
    routines: [],
    workouts: [workout],
    drafts: [{ version: 1, workout: { ...workout, id: 'merge-failure-draft' }, savedAt: '2026-09-10T08:01:00.000Z', revision: 1, restTimer: null }],
    settings: { 'merge-failure-setting': 'present' },
    gyms: [...before.gyms, gym],
    exerciseGymScopes: [...before.exerciseGymScopes, {
      exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
      scopeType: 'linked_group',
      linkedGymIds: ['gym-default', gym.id],
    }],
  };
}

describe('Backup Roundtrip & Merge Safety', () => {
  async function populateSourceStore(store: any) {
    // 1. Create a custom exercise
    const customEx: Exercise = {
      id: 'custom-pause-squat',
      name: 'Pause Squat',
      category: 'legs',
      bodyPart: 'quads',
      equipment: 'barbell',
      targetMuscle: 'quadriceps',
      isCustom: true,
      instructions: ['Pause 2 seconds at the bottom'],
      primaryMuscles: ['quads'],
      secondaryMuscles: ['glutes'],
    };
    await store.createCustomExercise(customEx);
    const sourceGym = await store.createGym('Satellite Gym', '#10B981');
    await store.saveExerciseGymScope({
      exerciseId: customEx.id,
      scopeType: 'linked_group',
      linkedGymIds: ['gym-default', sourceGym.id],
    });

    // 2. Create routine with targets
    const routineId = await store.saveRoutine(
      'Upper Body Hypertrophy',
      'Upper / Lower',
      [
        {
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          targetSets: 4,
          targetReps: '8-12',
          restTimerSeconds: 120,
        },
      ],
      'Focus on mind-muscle connection'
    );

    // 3. Create completed workout with:
    // - two occurrences of one exercise
    // - zero and fractional weights
    // - all set types ('normal', 'warmup', 'drop', 'failure')
    // - RPE
    // - notes
    const completedWorkout: Workout = {
      id: 'w-roundtrip-1',
      routineId,
      name: 'Upper Body Blast',
      gymId: 'gym-default',
      startTime: '2026-09-07T08:00:00.000Z',
      endTime: '2026-09-07T09:15:00.000Z',
      durationSeconds: 4500,
      totalVolumeKg: 2500.5,
      notes: 'Great workout session',
      exercises: [
        {
          id: 'we-bench-occ0',
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          orderIndex: 0,
          notes: 'Bench occurrence 1',
          restTimerSeconds: 120,
          targetReps: '8-12',
          exercise: {
            id: 'Barbell_Bench_Press_-_Medium_Grip',
            name: 'Bench Press (Barbell)',
            category: 'chest',
            bodyPart: 'chest',
            equipment: 'barbell',
            targetMuscle: 'pectorals',
          },
          sets: [
            { id: 's1', setNumber: 1, type: 'warmup', weightKg: 20, reps: 15, isCompleted: true, rpe: 5 },
            { id: 's2', setNumber: 2, type: 'normal', weightKg: 100, reps: 8, isCompleted: true, rpe: 8.5 },
            { id: 's3', setNumber: 3, type: 'drop', weightKg: 72.5, reps: 10, isCompleted: true, rpe: 9 },
            { id: 's4', setNumber: 4, type: 'failure', weightKg: 60, reps: 12, isCompleted: true, rpe: 10 },
          ],
        },
        {
          id: 'we-bench-occ1',
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          orderIndex: 1,
          notes: 'Bench occurrence 2 (close grip variation)',
          restTimerSeconds: 90,
          exercise: {
            id: 'Barbell_Bench_Press_-_Medium_Grip',
            name: 'Bench Press (Barbell)',
            category: 'chest',
            bodyPart: 'chest',
            equipment: 'barbell',
            targetMuscle: 'pectorals',
          },
          sets: [
            { id: 's5', setNumber: 1, type: 'normal', weightKg: 0, reps: 20, isCompleted: true },
            { id: 's6', setNumber: 2, type: 'normal', weightKg: 12.25, reps: 15, isCompleted: true },
          ],
        },
      ],
    };
    await store.finishWorkout(completedWorkout);

    // 4. Save a draft
    const draft: WorkoutDraft = {
      version: 1,
      revision: 2,
      savedAt: '2026-09-07T09:30:00.000Z',
      restTimer: { endsAt: Date.now() + 60000, totalSeconds: 60 },
      workout: {
        id: 'draft-active-1',
        name: 'In-Progress Session',
        gymId: 'gym-default',
        startTime: '2026-09-07T09:20:00.000Z',
        durationSeconds: 600,
        totalVolumeKg: 200,
        exercises: [
          {
            id: 'we-draft-1',
            exerciseId: 'custom-pause-squat',
            orderIndex: 0,
            exercise: customEx,
            restTimerSeconds: 0,
            sets: [
              { id: 'ds1', setNumber: 1, type: 'normal', weightKg: 100, reps: 2, isCompleted: true },
            ],
          },
        ],
      },
    };
    await store.saveDraft(draft);

    // 5. Settings
    await store.setSetting('unit', 'lb');
  }

  for (const [fromPlatform, toPlatform] of [
    ['native', 'native'],
    ['web', 'web'],
    ['native', 'web'],
    ['web', 'native'],
  ] as const) {
    it(`cross-platform roundtrip [${fromPlatform} -> ${toPlatform}] preserves semantic snapshot content`, async () => {
      const sourceFixture = await createStoreFixture(fromPlatform);
      const destFixture = await createStoreFixture(toPlatform);

      await populateSourceStore(sourceFixture.store);

      // Export snapshot
      const backupJson = await buildBackupJson(sourceFixture.store);
      const exportedBackup = JSON.parse(backupJson);
      assert.equal(exportedBackup.version, 3);
      assert.ok(Array.isArray(exportedBackup.gyms));
      assert.ok(Array.isArray(exportedBackup.exerciseGymScopes));

      // Restore into empty destination
      await restoreBackup(backupJson, destFixture.store);

      const sourceSnap = await sourceFixture.store.readSnapshot();
      const destSnap = await destFixture.store.readSnapshot();

      // Compare workouts
      assert.equal(destSnap.workouts.length, sourceSnap.workouts.length);
      const destW = destSnap.workouts[0];
      const srcW = sourceSnap.workouts[0];
      assert.equal(destW.id, srcW.id);
      assert.equal(destW.name, srcW.name);
      assert.equal(destW.totalVolumeKg, srcW.totalVolumeKg);
      assert.equal(destW.exercises.length, srcW.exercises.length);
      assert.equal(destW.exercises[0].sets.length, srcW.exercises[0].sets.length);
      assert.equal(destW.exercises[1].sets[0].weightKg, 0); // zero preserved!
      assert.equal(destW.exercises[1].sets[1].weightKg, 12.25); // fractional weight preserved!

      // Compare routines
      assert.equal(destSnap.routines.length, sourceSnap.routines.length);
      assert.equal(destSnap.routines[0].name, sourceSnap.routines[0].name);

      // Compare custom exercises
      const destCustom = destSnap.exercises.filter((e) => e.isCustom);
      const srcCustom = sourceSnap.exercises.filter((e) => e.isCustom);
      assert.equal(destCustom.length, srcCustom.length);
      assert.equal(destCustom[0].name, 'Pause Squat');

      // Compare drafts
      assert.equal(destSnap.drafts.length, sourceSnap.drafts.length);
      assert.equal(destSnap.drafts[0].workout.id, sourceSnap.drafts[0].workout.id);

      // Compare multi-gym snapshot data
      assert.deepEqual(
        destSnap.gyms.filter((gym) => !gym.isDefault),
        sourceSnap.gyms.filter((gym) => !gym.isDefault),
      );
      assert.deepEqual(destSnap.exerciseGymScopes, sourceSnap.exerciseGymScopes);

      // Compare settings
      assert.equal(destSnap.settings.unit, 'lb');

      await sourceFixture.dispose();
      await destFixture.dispose();
    });
  }

  it('repeated import is idempotent and skips identical records without error', async () => {
    const fixture = await createStoreFixture('native');
    await populateSourceStore(fixture.store);

    const backupJson = await buildBackupJson(fixture.store);

    // Re-importing into the same store
    await restoreBackup(backupJson, fixture.store);

    const snap = await fixture.store.readSnapshot();
    assert.equal(snap.workouts.length, 1);
    assert.equal(snap.drafts.length, 1);

    await fixture.dispose();
  });

  it('conflicting record ID aborts restore without modifying destination', async () => {
    const fixture = await createStoreFixture('native');
    await populateSourceStore(fixture.store);

    const backupJson = await buildBackupJson(fixture.store);
    const parsed = JSON.parse(backupJson);

    // Create a conflict: same workout ID, but different name
    parsed.workouts[0].name = 'Conflicting Modified Name';
    const conflictingJson = JSON.stringify(parsed);

    // Attempting restore must reject with conflict error
    await assert.rejects(async () => {
      await restoreBackup(conflictingJson, fixture.store);
    }, /Conflicting/);

    // Destination remains unmodified
    const snap = await fixture.store.readSnapshot();
    assert.equal(snap.workouts[0].name, 'Upper Body Blast');

    await fixture.dispose();
  });

  it('routine with modified notes or rest timers is recognized as conflict and aborts restore', async () => {
    const fixture = await createStoreFixture('native');
    await populateSourceStore(fixture.store);

    const backupJson = await buildBackupJson(fixture.store);

    // Test 1: Changed routine notes
    const parsedNotes = JSON.parse(backupJson);
    parsedNotes.routines[0].notes = 'Changed routine notes text';
    await assert.rejects(async () => {
      await restoreBackup(JSON.stringify(parsedNotes), fixture.store);
    }, /Conflicting routine ID/);

    // Test 2: Changed routine exercise restTimerSeconds
    const parsedTimer = JSON.parse(backupJson);
    parsedTimer.routines[0].exercises[0].restTimerSeconds = 180;
    await assert.rejects(async () => {
      await restoreBackup(JSON.stringify(parsedTimer), fixture.store);
    }, /Conflicting routine ID/);

    await fixture.dispose();
  });

  it('workout with modified notes or RPE is recognized as conflict and aborts restore', async () => {
    const fixture = await createStoreFixture('native');
    await populateSourceStore(fixture.store);

    const backupJson = await buildBackupJson(fixture.store);

    // Test 1: Changed workout notes
    const parsedNotes = JSON.parse(backupJson);
    parsedNotes.workouts[0].notes = 'Modified post-workout notes';
    await assert.rejects(async () => {
      await restoreBackup(JSON.stringify(parsedNotes), fixture.store);
    }, /Conflicting workout ID/);

    // Test 2: Changed workout set RPE
    const parsedRpe = JSON.parse(backupJson);
    parsedRpe.workouts[0].exercises[0].sets[0].rpe = 9.5;
    await assert.rejects(async () => {
      await restoreBackup(JSON.stringify(parsedRpe), fixture.store);
    }, /Conflicting workout ID/);

    // Destination remains intact
    const snap = await fixture.store.readSnapshot();
    assert.equal(snap.workouts[0].notes, 'Great workout session');
    assert.equal(snap.workouts[0].exercises[0].sets[0].rpe, 5);

    await fixture.dispose();
  });

  for (const destinationPlatform of ['native', 'web'] as const) {
    it(`remaps colliding gym IDs without overwriting ${destinationPlatform} destination records`, async () => {
    const sourceFixture = await createStoreFixture('native');
    const destinationFixture = await createStoreFixture(destinationPlatform);
    await populateSourceStore(sourceFixture.store);
    const destinationGym = await destinationFixture.store.createGym('Destination Gym', '#F59E0B');

    const parsed = JSON.parse(await buildBackupJson(sourceFixture.store));
    const sourceGym = parsed.gyms.find((gym: any) => gym.name === 'Satellite Gym');
    sourceGym.id = destinationGym.id;
    parsed.workouts[0].gymId = destinationGym.id;
    parsed.drafts[0].workout.gymId = destinationGym.id;
    parsed.exerciseGymScopes[0].linkedGymIds[1] = destinationGym.id;

    const { preview, snapshotToMerge } = await computeRestorePlan(parsed, destinationFixture.store);
    assert.equal(preview.gymsCount, 1);
    assert.equal(preview.scopeOverridesCount, 1);
    const importedGym = snapshotToMerge.gyms[0];
    assert.match(importedGym.id, /^gym-import-restore-/);
    assert.equal(snapshotToMerge.workouts[0].gymId, importedGym.id);
    assert.equal(snapshotToMerge.drafts[0].workout.gymId, importedGym.id);
    assert.deepEqual(snapshotToMerge.exerciseGymScopes[0].linkedGymIds, ['gym-default', importedGym.id]);

    await destinationFixture.store.mergeSnapshot(snapshotToMerge);
    const destinationSnapshot = await destinationFixture.store.readSnapshot();
    assert.equal(destinationSnapshot.gyms.find((gym) => gym.id === destinationGym.id)?.name, 'Destination Gym');
    assert.equal(destinationSnapshot.workouts[0].gymId, importedGym.id);
    assert.equal(destinationSnapshot.drafts[0].workout.gymId, importedGym.id);
    assert.deepEqual(destinationSnapshot.exerciseGymScopes[0].linkedGymIds, ['gym-default', importedGym.id]);

    await sourceFixture.dispose();
    await destinationFixture.dispose();
    });
  }

  it('aborts a conflicting exercise scope before writing any restore data', async () => {
    const fixture = await createStoreFixture('native');
    await populateSourceStore(fixture.store);
    const parsed = JSON.parse(await buildBackupJson(fixture.store));
    parsed.exerciseGymScopes[0] = {
      exerciseId: parsed.exerciseGymScopes[0].exerciseId,
      scopeType: 'global',
    };
    const before = await fixture.store.readSnapshot();

    await assert.rejects(() => restoreBackup(JSON.stringify(parsed), fixture.store), /Conflicting exercise gym scope/);
    assert.deepEqual(await fixture.store.readSnapshot(), before);
    await fixture.dispose();
  });

  for (const platform of ['native', 'web'] as const) {
    it(`rejects duplicate set IDs across exercises in direct ${platform} workout and draft merges`, async () => {
      const fixture = await createStoreFixture(platform);
      const before = await fixture.store.readSnapshot();
      const exercise = before.exercises[0];
      const duplicateSetId = `duplicate-set-${platform}`;
      const makeExercise = (id: string): any => ({
        id,
        exerciseId: exercise.id,
        exercise,
        restTimerSeconds: 90,
        sets: [{ id: duplicateSetId, setNumber: 1, type: 'normal', weightKg: 20, reps: 8, isCompleted: true }],
      });
      const workout: Workout = {
        id: `duplicate-set-workout-${platform}`,
        name: 'Duplicate Set Workout',
        gymId: before.gyms[0].id,
        startTime: '2026-09-10T08:00:00.000Z',
        durationSeconds: 60,
        totalVolumeKg: 320,
        exercises: [makeExercise('duplicate-exercise-1'), makeExercise('duplicate-exercise-2')],
      };
      const draft: WorkoutDraft = {
        version: 1,
        workout: {
          ...workout,
          id: `duplicate-set-draft-${platform}`,
          name: 'Duplicate Set Draft',
          exercises: [makeExercise('duplicate-draft-exercise-1'), makeExercise('duplicate-draft-exercise-2')],
        },
        savedAt: '2026-09-10T08:01:00.000Z',
        revision: 1,
        restTimer: null,
      };
      const merge = (candidate: { workouts: Workout[]; drafts: WorkoutDraft[] }) => fixture.store.mergeSnapshot({
        exercises: [],
        routines: [],
        workouts: candidate.workouts,
        drafts: candidate.drafts,
        settings: {},
        gyms: [],
        exerciseGymScopes: [],
      });

      await assert.rejects(() => merge({ workouts: [workout], drafts: [] }), /Duplicate set ID/);
      assert.deepEqual(await fixture.store.readSnapshot(), before);
      await assert.rejects(() => merge({ workouts: [], drafts: [draft] }), /Duplicate set ID/);
      assert.deepEqual(await fixture.store.readSnapshot(), before);
      await fixture.dispose();
    });
  }

  for (const platform of ['native', 'web'] as const) {
    it(`rejects globally duplicate nested IDs in direct ${platform} merges without mutation`, async () => {
      const fixture = await createStoreFixture(platform);
      const before = await fixture.store.readSnapshot();
      const exercise = before.exercises[0];
      const gymId = before.gyms[0].id;
      const makeExercise = (id: string, setId: string): any => ({
        id,
        exerciseId: exercise.id,
        exercise,
        restTimerSeconds: 90,
        sets: [{ id: setId, setNumber: 1, type: 'normal', weightKg: 20, reps: 8, isCompleted: true }],
      });
      const makeWorkout = (id: string, exerciseId: string, setId: string): Workout => ({
        id,
        name: id,
        gymId,
        startTime: '2026-09-10T08:00:00.000Z',
        durationSeconds: 60,
        totalVolumeKg: 160,
        exercises: [makeExercise(exerciseId, setId)],
      });
      const makeRoutine = (id: string, exerciseInstanceId: string): Routine => ({
        id,
        name: id,
        createdAt: '2026-09-10T08:00:00.000Z',
        exercises: [{
          id: exerciseInstanceId,
          exerciseId: exercise.id,
          exercise,
          orderIndex: 0,
          targetSets: 1,
          targetReps: '8',
          restTimerSeconds: 90,
        }],
      });
      const merge = (workouts: Workout[], routines: Routine[], drafts: WorkoutDraft[] = []) => fixture.store.mergeSnapshot({
        exercises: [],
        routines,
        workouts,
        drafts,
        settings: {},
        gyms: [],
        exerciseGymScopes: [],
      });

      await assert.rejects(() => merge([
        makeWorkout('duplicate-workout-1', 'duplicate-workout-exercise', 'duplicate-workout-set-1'),
        makeWorkout('duplicate-workout-2', 'duplicate-workout-exercise', 'duplicate-workout-set-2'),
      ], []), /Duplicate workout exercise ID/);
      assert.deepEqual(await fixture.store.readSnapshot(), before);

      await assert.rejects(() => merge([
        makeWorkout('duplicate-set-workout-1', 'duplicate-set-exercise-1', 'duplicate-set-id'),
        makeWorkout('duplicate-set-workout-2', 'duplicate-set-exercise-2', 'duplicate-set-id'),
      ], []), /Duplicate set ID/);
      assert.deepEqual(await fixture.store.readSnapshot(), before);

      await assert.rejects(() => merge([
        makeWorkout('duplicate-cross-parent-workout', 'duplicate-cross-parent-exercise', 'duplicate-cross-parent-set'),
      ], [], [{
        version: 1,
        workout: makeWorkout('duplicate-cross-parent-draft', 'duplicate-cross-parent-exercise', 'duplicate-cross-parent-set'),
        savedAt: '2026-09-10T08:01:00.000Z',
        revision: 1,
        restTimer: null,
      }]), /Duplicate workout exercise ID|Duplicate set ID/);
      assert.deepEqual(await fixture.store.readSnapshot(), before);

      await assert.rejects(() => merge([], [
        makeRoutine('duplicate-routine-1', 'duplicate-routine-exercise'),
        makeRoutine('duplicate-routine-2', 'duplicate-routine-exercise'),
      ]), /Duplicate routine exercise ID/);
      assert.deepEqual(await fixture.store.readSnapshot(), before);
      await fixture.dispose();
    });
  }

  for (const platform of ['native', 'web'] as const) {
    it(`rejects destination nested-ID collisions for new ${platform} parents without mutation`, async () => {
      const fixture = await createStoreFixture(platform);
      const before = await fixture.store.readSnapshot();
      const exercise = before.exercises[0];
      const gymId = before.gyms[0].id;
      const makeExercise = (id: string, setId: string): any => ({
        id,
        exerciseId: exercise.id,
        exercise,
        restTimerSeconds: 90,
        sets: [{ id: setId, setNumber: 1, type: 'normal', weightKg: 20, reps: 8, isCompleted: true }],
      });
      const makeWorkout = (id: string, exerciseId: string, setId: string): Workout => ({
        id,
        name: id,
        gymId,
        startTime: '2026-09-10T08:00:00.000Z',
        durationSeconds: 60,
        totalVolumeKg: 160,
        exercises: [makeExercise(exerciseId, setId)],
      });
      const makeRoutine = (id: string, exerciseInstanceId: string): Routine => ({
        id,
        name: id,
        createdAt: '2026-09-10T08:00:00.000Z',
        exercises: [{
          id: exerciseInstanceId,
          exerciseId: exercise.id,
          exercise,
          orderIndex: 0,
          targetSets: 1,
          targetReps: '8',
          restTimerSeconds: 90,
        }],
      });
      const existingWorkout = makeWorkout('destination-workout', 'destination-workout-exercise', 'destination-workout-set');
      const existingRoutine = makeRoutine('destination-routine', 'destination-routine-exercise');
      const existingDraft: WorkoutDraft = {
        version: 1,
        workout: makeWorkout('destination-draft', 'destination-draft-exercise', 'destination-draft-set'),
        savedAt: '2026-09-10T08:01:00.000Z',
        revision: 1,
        restTimer: null,
      };
      const merge = (workouts: Workout[], routines: Routine[], drafts: WorkoutDraft[] = []) => fixture.store.mergeSnapshot({
        exercises: [],
        routines,
        workouts,
        drafts,
        settings: {},
        gyms: [],
        exerciseGymScopes: [],
      });

      await merge([existingWorkout], [existingRoutine], [existingDraft]);
      const seeded = await fixture.store.readSnapshot();

      await assert.rejects(() => merge([
        makeWorkout('new-workout-parent', 'destination-workout-exercise', 'destination-workout-set'),
      ], []), /existing|collision|Duplicate workout exercise ID|Duplicate set ID/i);
      assert.deepEqual(await fixture.store.readSnapshot(), seeded);

      await assert.rejects(() => merge([], [
        makeRoutine('new-routine-parent', 'destination-routine-exercise'),
      ]), /existing|collision|Duplicate routine exercise ID/i);
      assert.deepEqual(await fixture.store.readSnapshot(), seeded);

      await assert.rejects(() => merge([], [], [{
        version: 1,
        workout: makeWorkout('new-draft-parent', 'destination-draft-exercise', 'destination-draft-set'),
        savedAt: '2026-09-10T08:02:00.000Z',
        revision: 1,
        restTimer: null,
      }]), /existing|collision|Duplicate workout exercise ID|Duplicate set ID/i);
      assert.deepEqual(await fixture.store.readSnapshot(), seeded);
      await fixture.dispose();
    });
  }

  for (const platform of ['native', 'web'] as const) {
    for (const [field, value] of [
      ['id', undefined],
      ['setNumber', '1'],
      ['isCompleted', 'true'],
      ['completedAt', 1234567890],
    ] as const) {
      it(`rejects malformed ${field} in a direct ${platform} snapshot merge without mutation`, async () => {
        const fixture = await createStoreFixture(platform);
        const before = await fixture.store.readSnapshot();
        const exercise = before.exercises[0];
        const set: any = { id: 'merge-set-1', setNumber: 1, type: 'normal', weightKg: 20, reps: 8, isCompleted: true };
        if (value === undefined) delete set[field];
        else set[field] = value;
        const workout: Workout = {
          id: `malformed-${platform}-${field}`,
          name: 'Malformed Snapshot',
          gymId: before.gyms[0].id,
          startTime: '2026-09-10T08:00:00.000Z',
          durationSeconds: 60,
          totalVolumeKg: 160,
          exercises: [{
            id: 'merge-exercise-1',
            exerciseId: exercise.id,
            exercise,
            sets: [set],
            restTimerSeconds: 90,
          }],
        };

        await assert.rejects(() => fixture.store.mergeSnapshot({
          exercises: [],
          routines: [],
          workouts: [workout],
          drafts: [],
          settings: {},
          gyms: [],
          exerciseGymScopes: [],
        }), new RegExp(field));
        assert.deepEqual(await fixture.store.readSnapshot(), before);
        await fixture.dispose();
      });
    }
  }

  for (const platform of ['native', 'web'] as const) {
    it(`canonicalizes gym names and rejects invalid timestamps during ${platform} snapshot merge`, async () => {
      const fixture = await createStoreFixture(platform);
      const before = await fixture.store.readSnapshot();
      const trimmedGym = {
        id: `gym-trim-${platform}`, name: '  Trimmed Gym  ', color: '#10B981', isDefault: false,
        createdAt: '2026-09-10T00:00:00.000Z',
      };
      await fixture.store.mergeSnapshot({
        ...before,
        gyms: [...before.gyms, trimmedGym],
      });
      assert.equal((await fixture.store.getGyms()).find((gym) => gym.id === trimmedGym.id)?.name, 'Trimmed Gym');

      const afterTrim = await fixture.store.readSnapshot();
      for (const createdAt of [1234567890, 'not-a-timestamp'] as const) {
        await assert.rejects(() => fixture.store.mergeSnapshot({
          ...afterTrim,
          gyms: [...afterTrim.gyms, {
            id: `gym-invalid-${String(createdAt)}`, name: 'Invalid Timestamp', color: '#F59E0B', isDefault: false,
            createdAt,
          }],
        } as any), /createdAt timestamp/);
      }
      assert.deepEqual(await fixture.store.readSnapshot(), afterTrim);
      await fixture.dispose();
    });
  }

  it('rolls back a mid-merge native transaction failure with no partial snapshot changes', async () => {
    const driver = new FailingSqliteDriver(new NodeSqliteDriver(), 2);
    const store = createNativeStore(driver);
    await store.init();
    const before = await store.readSnapshot();
    driver.armed = true;

    await assert.rejects(() => store.mergeSnapshot(buildFailureSnapshot(before)), /Injected merge failure/);
    assert.deepEqual(await store.readSnapshot(), before);
    driver.close();
  });

  it('rolls back a mid-merge web transaction failure with no partial snapshot changes', async () => {
    const dbName = `test-backup-merge-failure-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const failingIdb = createFailingIdbFactory(2);
    const store = await createWebStore(dbName, { idbFactory: failingIdb.factory });
    await store.init();
    const before = await store.readSnapshot();
    failingIdb.arm();

    await assert.rejects(() => store.mergeSnapshot(buildFailureSnapshot(before)), /AbortError|TransactionInactiveError|merge failure/i);
    assert.deepEqual(await store.readSnapshot(), before);
    await store.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
});
