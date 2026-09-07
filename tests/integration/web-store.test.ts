import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { createStoreFixture } from '../helpers/storeFixture';
import { createWebStore } from '../../src/database/webStore';
import { createSessionController } from '../../src/workout/session';
import { restoreBackup } from '../../src/utils/restore';

describe('webStore persistence and lease handling', () => {
  it('persists every user record type across store recreation and matches snapshot', async () => {
    const fixture = await createStoreFixture('web');

    // 1. Create custom exercise
    const customEx = await fixture.store.createCustomExercise({
      name: 'Cable Lateral Raise',
      category: 'Shoulders',
      equipment: 'Cable',
      primaryMuscles: ['Shoulders'],
    });
    assert.ok(customEx.id);

    // 2. Set setting
    await fixture.store.setSetting('weight_unit', 'lb');

    // 3. Save routine
    const routineId = await fixture.store.saveRoutine(
      'Upper Power',
      'Hypertrophy',
      [
        { exerciseId: customEx.id, targetSets: 4, targetReps: '10-12', restTimerSeconds: 60 },
      ],
      'Focus on mind-muscle connection'
    );

    // 4. Save completed workout
    await fixture.store.saveCompletedWorkout({
      id: 'workout-web-1',
      routineId,
      name: 'Upper Power Session',
      startTime: '2026-09-07T08:00:00.000Z',
      endTime: '2026-09-07T09:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 1500,
      notes: 'Great pump',
      exercises: [
        {
          id: 'we-web-1',
          exerciseId: customEx.id,
          exercise: customEx,
          restTimerSeconds: 60,
          sets: [
            {
              id: 'set-web-1',
              setNumber: 1,
              type: 'normal',
              weightKg: 25,
              reps: 12,
              rpe: 8,
              isCompleted: true,
              completedAt: '2026-09-07T08:15:00.000Z',
            },
          ],
        },
      ],
    });

    // 5. Save draft
    await fixture.store.saveDraft({
      version: 1,
      workout: {
        id: 'draft-web-1',
        name: 'In-Progress Web Session',
        startTime: '2026-09-07T10:00:00.000Z',
        durationSeconds: 500,
        totalVolumeKg: 300,
        exercises: [],
      },
      savedAt: '2026-09-07T10:08:20.000Z',
      revision: 1,
      restTimer: { endsAt: Date.now() + 60000, totalSeconds: 60 },
    });

    // Take snapshot before close
    const before = await fixture.store.readSnapshot();

    // 6. Reopen store against same database
    const reopened = await fixture.reopen();
    const after = await reopened.readSnapshot();

    assert.deepEqual(after, before, 'All user data and settings must match perfectly across reload');
    await fixture.dispose();
  });

  it('enforces single-writer browser lease and rejects stale writer', async () => {
    let currentTime = 100000;
    const now = () => currentTime;
    const dbName = `test-lease-${Date.now()}`;

    // Tab 1 opens and gets lease
    const tab1 = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 5000 });
    await tab1.init();
    assert.equal(tab1.isReadOnly(), false, 'Tab 1 should be writer');

    // Tab 2 opens same DB while Tab 1 lease is fresh
    const tab2 = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 5000 });
    await tab2.init();
    assert.equal(tab2.isReadOnly(), true, 'Tab 2 should be read-only while Tab 1 holds lease');

    // Tab 2 attempting write must be rejected
    await assert.rejects(async () => {
      await tab2.setSetting('theme', 'dark');
    }, /Cannot write: store is in read-only mode/);

    // Advance clock past lease duration
    currentTime += 6000;

    // Tab 2 tries to acquire lease or write after lease expiry
    const acquired = await tab2.tryAcquireLease();
    assert.equal(acquired, true, 'Tab 2 should acquire expired lease');
    assert.equal(tab2.isReadOnly(), false, 'Tab 2 is now active writer');

    // Tab 2 write succeeds
    await tab2.setSetting('theme', 'dark');
    assert.equal(await tab2.getSetting('theme'), 'dark');

    // Tab 1 tries to write with stale lease -> must be rejected
    await assert.rejects(async () => {
      await tab1.setSetting('theme', 'light');
    }, /Cannot write: lease has expired or was acquired by another tab/);

    if (tab1.close) await tab1.close();
    if (tab2.close) await tab2.close();
  });

  it('allows write and renews lease after being idle past lease duration when no other tab acquired lease', async () => {
    let currentTime = 200000;
    const now = () => currentTime;
    const dbName = `test-idle-${Date.now()}`;

    const tab = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 5000 });
    await tab.init();
    assert.equal(tab.isReadOnly(), false, 'Tab should initially be writer');

    // Tab is idle and clock advances beyond leaseDurationMs (15 seconds)
    currentTime += 15000;

    // Subsequent write must succeed and renew the lease without switching to read-only
    await tab.setSetting('auto_lock', 'enabled');
    assert.equal(await tab.getSetting('auto_lock'), 'enabled');
    assert.equal(tab.isReadOnly(), false, 'Tab should remain active writer');

    if (tab.close) await tab.close();
  });

  it('notifies onReadOnlyChange listeners when lease is lost to another tab', async () => {
    let currentTime = 300000;
    const now = () => currentTime;
    const dbName = `test-notify-${Date.now()}`;

    const tab1 = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 5000 });
    await tab1.init();

    const tab1StateChanges: boolean[] = [];
    const unsub = tab1.onReadOnlyChange((isReadOnly) => {
      tab1StateChanges.push(isReadOnly);
    });

    assert.equal(tab1.isReadOnly(), false);

    // Advance clock past lease duration
    currentTime += 6000;

    // Tab 2 acquires the expired lease
    const tab2 = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 5000 });
    await tab2.init();
    assert.equal(tab2.isReadOnly(), false, 'Tab 2 acquired the lease');

    // Tab 1 attempts a write -> must be rejected and switch Tab 1 to read-only, notifying listeners
    await assert.rejects(async () => {
      await tab1.setSetting('theme', 'neon');
    }, /Cannot write: lease has expired or was acquired by another tab/);

    assert.equal(tab1.isReadOnly(), true, 'Tab 1 is now read-only');
    assert.ok(tab1StateChanges.includes(true), 'onReadOnlyChange listener must be notified with true');

    unsub();
    if (tab1.close) await tab1.close();
    if (tab2.close) await tab2.close();
  });

  it('smoke tests workout recovery in browser storage: draft resume, idle update, completion, and rejects corrupt draft restore', async () => {
    let currentTime = 400000;
    const now = () => currentTime;
    const dbName = `test-smoke-${Date.now()}`;

    const store = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 10000 });
    await store.init();

    // 1. Verify attempting to restore corrupt draft (invalid timestamp and exercises: null) fails and mutates nothing
    const corruptBackup = JSON.stringify({
      version: 2,
      exportedAt: new Date(currentTime).toISOString(),
      workouts: [],
      routines: [],
      exercises: [],
      drafts: [
        {
          version: 1,
          savedAt: 'invalid-timestamp',
          revision: 1,
          workout: {
            id: 'corrupt-draft',
            name: 'Corrupt Draft',
            startTime: 'bad-date',
            exercises: null,
          },
        },
      ],
      settings: {},
    });

    await assert.rejects(async () => {
      await restoreBackup(corruptBackup, store);
    }, /Invalid timestamp/);

    const draftsBefore = await store.getWorkoutDrafts();
    assert.equal(draftsBefore.length, 0, 'No corrupt draft should be stored');

    // 2. Start a real workout session and save a valid draft
    const controller = createSessionController(store, now);
    const workout = {
      id: 'browser-workout-1',
      name: 'Chest & Triceps',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [
        {
          id: 'we-smoke-1',
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          orderIndex: 0,
          restTimerSeconds: 90,
          exercise: {
            id: 'Barbell_Bench_Press_-_Medium_Grip',
            name: 'Barbell Bench Press',
            category: 'Chest',
            equipment: 'Barbell',
            primaryMuscles: ['Chest'],
          },
          sets: [
            {
              id: 'set-smoke-1',
              setNumber: 1,
              type: 'normal' as const,
              weightKg: 80,
              reps: 10,
              isCompleted: true,
              completedAt: new Date(currentTime).toISOString(),
            },
          ],
        },
      ],
    };
    await controller.start(workout);

    // 3. Close old store and reopen (simulating page reload in browser)
    await store.close();

    const reopened = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 10000 });
    await reopened.init();
    const storedDrafts = await reopened.getWorkoutDrafts();
    assert.equal(storedDrafts.length, 1);
    assert.equal(storedDrafts[0].workout.id, 'browser-workout-1');

    // 4. Resume draft with new session controller
    currentTime += 30000; // 30s elapsed
    const recoveryController = createSessionController(reopened, now);
    recoveryController.resume(storedDrafts[0]);
    assert.equal(recoveryController.getState().phase, 'active');
    assert.equal(recoveryController.getState().workout?.exercises.length, 1);

    // 5. Simulate idle tab beyond lease duration (advanced clock by 25 seconds)
    currentTime += 25000;

    // Add another completed set and flush
    const activeWorkout = recoveryController.getState().workout!;
    const updatedWorkout = {
      ...activeWorkout,
      exercises: [
        {
          ...activeWorkout.exercises[0],
          sets: [
            ...activeWorkout.exercises[0].sets,
            {
              id: 'set-smoke-2',
              setNumber: 2,
              type: 'normal' as const,
              weightKg: 85,
              reps: 8,
              isCompleted: true,
              completedAt: new Date(currentTime).toISOString(),
            },
          ],
        },
      ],
    };
    recoveryController.update(updatedWorkout);
    // Flush should succeed even after 25s idle because the same tab still owns the lease
    await recoveryController.flush();

    // 6. Finish workout and verify durable state
    currentTime += 5000;
    const completed = await recoveryController.finish();
    assert.equal(completed.id, 'browser-workout-1');
    assert.equal(completed.exercises[0].sets.length, 2);

    const finalDrafts = await reopened.getWorkoutDrafts();
    assert.equal(finalDrafts.length, 0, 'Draft deleted after finish');

    const history = await reopened.getWorkoutHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].id, 'browser-workout-1');

    if (store.close) await store.close();
    if (reopened.close) await reopened.close();
  });

  it('rejects saving a routine with malformed targetReps in web store', async () => {
    const dbName = `test-bad-reps-${Date.now()}`;
    const store = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();

    await assert.rejects(async () => {
      await store.saveRoutine('Bad Reps Routine', 'Folder', [
        { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', targetSets: 3, targetReps: '7&x-9', restTimerSeconds: 60 },
      ]);
    }, /Invalid target reps/);

    if (store.close) await store.close();
  });

  it('browser regression: rapid number entry publishes distinct session-state objects and flushes cleanly without lag or stale values', async () => {
    const dbName = `test-browser-rapid-entry-${Date.now()}`;
    const store = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();

    let currentTime = new Date('2026-09-07T12:00:00.000Z').getTime();
    const controller = createSessionController(store, () => currentTime, { maxDirtyTimeMs: 1000 });

    const publishedStates: any[] = [];
    controller.subscribe((state) => {
      publishedStates.push(state);
    });

    const initialWorkout = {
      id: 'w-browser-rapid-1',
      name: 'Rapid Typing Session',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [
        {
          id: 'ae-b1',
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          exercise: {
            id: 'Barbell_Bench_Press_-_Medium_Grip',
            name: 'Barbell Bench Press',
            category: 'chest',
            equipment: 'barbell',
            primaryMuscles: ['chest'],
          },
          restTimerSeconds: 90,
          sets: [
            {
              id: 'set-b1',
              setNumber: 1,
              type: 'normal' as const,
              weightKg: 80,
              reps: 20,
              isCompleted: false,
            },
          ],
        },
      ],
    };

    await controller.start(initialWorkout);

    // Rapid number typing sequence: selecting 20, typing 1, then 12
    const baseCount = publishedStates.length;
    const typedRepsSequence = [1, 12];

    for (const repsVal of typedRepsSequence) {
      const activeW = controller.getState().workout!;
      const updated = {
        ...activeW,
        exercises: [
          {
            ...activeW.exercises[0],
            sets: [
              {
                ...activeW.exercises[0].sets[0],
                reps: repsVal,
              },
            ],
          },
        ],
      };
      controller.update(updated);
    }

    assert.equal(publishedStates.length, baseCount + 2, 'Every rapid update must notify subscribers');
    const firstTypedState = publishedStates[publishedStates.length - 2];
    const secondTypedState = publishedStates[publishedStates.length - 1];

    // Verify object reference identity changes immediately (satisfies React state identity)
    assert.notEqual(firstTypedState, secondTypedState);
    assert.equal(firstTypedState.workout.exercises[0].sets[0].reps, 1);
    assert.equal(secondTypedState.workout.exercises[0].sets[0].reps, 12);

    // Flush and verify IndexedDB draft storage has the latest value 12
    await controller.flush();
    const draft = await store.getWorkoutDraft('w-browser-rapid-1');
    assert.ok(draft);
    assert.equal(draft.workout.exercises[0].sets[0].reps, 12);

    if (store.close) await store.close();
  });

  it('browser regression: restores legacy backup with custom targetReps (e.g. 8 each side) into IndexedDB successfully', async () => {
    const dbName = `test-browser-legacy-restore-${Date.now()}`;
    const store = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();

    const legacyBackupJson = JSON.stringify({
      version: 2,
      exportedAt: '2026-09-07T12:00:00.000Z',
      workouts: [
        {
          id: 'w-legacy-browser-1',
          name: 'Legacy Workout',
          startTime: '2026-09-07T08:00:00.000Z',
          endTime: '2026-09-07T09:00:00.000Z',
          durationSeconds: 3600,
          totalVolumeKg: 1000,
          exercises: [
            {
              id: 'we-legacy-1',
              exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
              exercise: {
                id: 'Barbell_Bench_Press_-_Medium_Grip',
                name: 'Barbell Bench Press',
                category: 'chest',
                equipment: 'barbell',
                primaryMuscles: ['chest'],
              },
              targetReps: '8 each side',
              restTimerSeconds: 90,
              sets: [
                {
                  id: 's-leg-1',
                  setNumber: 1,
                  type: 'normal',
                  weightKg: 50,
                  reps: 8,
                  isCompleted: true,
                },
              ],
            },
          ],
        },
      ],
      routines: [
        {
          id: 'routine-legacy-browser-1',
          name: 'Legacy Upper Routine',
          folderName: 'Strength',
          notes: 'Legacy exported notes',
          exercises: [
            {
              id: 're-leg-b1',
              exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
              orderIndex: 0,
              targetSets: 3,
              targetReps: '8 each side',
              restTimerSeconds: 90,
            },
          ],
        },
      ],
      exercises: [],
      drafts: [],
      settings: { weight_unit: 'kg' },
    });

    // Should successfully restore without rejecting legacy targetReps
    await restoreBackup(legacyBackupJson, store);

    // Verify routine in IndexedDB
    const routines = await store.getRoutines();
    const legacyRoutine = routines.find((r) => r.id === 'routine-legacy-browser-1');
    assert.ok(legacyRoutine, 'Legacy routine should exist in IndexedDB');
    assert.equal(legacyRoutine.exercises[0].targetReps, '8 each side');

    // Verify workout history and workout detail in IndexedDB
    const history = await store.getWorkoutHistory();
    assert.equal(history.length, 1);
    const workoutDetail = await store.getWorkoutDetail('w-legacy-browser-1');
    assert.ok(workoutDetail, 'Legacy workout should exist in IndexedDB');
    assert.equal(workoutDetail.exercises[0].targetReps, '8 each side');

    if (store.close) await store.close();
  });
});
