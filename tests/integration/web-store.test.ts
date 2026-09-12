import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { createStoreFixture } from '../helpers/storeFixture';
import { createWebStore } from '../../src/database/webStore';
import { createSessionController } from '../../src/workout/session';
import { restoreBackup } from '../../src/utils/restore';
import { getBundledExercise } from '../../src/database/seedData';

function openLegacyVersionOneDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, keyPath] of [
        ['exercises', 'id'], ['routines', 'id'], ['workouts', 'id'],
        ['workout_drafts', 'id'], ['settings', 'key'], ['metadata', 'key'],
      ] as [string, string][]) {
        db.createObjectStore(storeName, { keyPath });
      }
      const upgradeTx = request.transaction!;
      upgradeTx.objectStore('workouts').put({
        id: 'legacy-workout', name: 'Legacy', startTime: '2026-09-10T08:00:00.000Z',
        durationSeconds: 10, totalVolumeKg: 0, exercises: [],
      });
      upgradeTx.objectStore('workout_drafts').put({
        id: 'legacy-draft', version: 1, savedAt: '2026-09-10T08:01:00.000Z', revision: 1,
        restTimer: null, workout: {
          id: 'legacy-draft', name: 'Draft', startTime: '2026-09-10T08:00:00.000Z',
          durationSeconds: 10, totalVolumeKg: 0, exercises: [],
        },
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('webStore persistence and lease handling', () => {
  it('upgrades legacy records and exposes multi-gym CRUD, scopes, and snapshot arrays', async () => {
    const dbName = `test-web-v2-${Date.now()}`;
    const legacy = await openLegacyVersionOneDatabase(dbName);
    legacy.close();

    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    assert.deepEqual((await store.getGyms()).map((gym: any) => gym.id), ['gym-default']);
    assert.equal((await store.getWorkoutDetail('legacy-workout')).gymId, 'gym-default');
    assert.equal((await store.getWorkoutDrafts())[0].workout.gymId, 'gym-default');

    const gym = await store.createGym('Downtown', '#10B981');
    assert.equal(gym.name, 'Downtown');
    await store.updateGym(gym.id, { name: 'Downtown 2' });
    await store.setDefaultGym(gym.id);
    await assert.rejects(() => store.deleteGym(gym.id, gym.id), /Replacement gym must be different/);
    await store.saveExerciseGymScope({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', scopeType: 'global' });
    assert.equal((await store.getExerciseGymScope('Barbell_Bench_Press_-_Medium_Grip')).scopeType, 'global');
    const snapshot = await store.readSnapshot();
    assert.deepEqual(snapshot.gyms.map((g: any) => g.id), [gym.id, 'gym-default']);
    assert.equal(snapshot.exerciseGymScopes.length, 1);
    await store.close();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    });
  });

  it('deletes a gym atomically by reassigning workouts, drafts, and linked scopes', async () => {
    const dbName = `test-web-gym-delete-${Date.now()}`;
    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    const gym = await store.createGym('Temporary');
    const workout = { id: 'gym-workout', name: 'Gym workout', gymId: gym.id, startTime: '2026-09-10T08:00:00.000Z', durationSeconds: 1, totalVolumeKg: 0, exercises: [] };
    await store.saveCompletedWorkout(workout);
    await store.saveDraft({ version: 1, workout: { ...workout, id: 'gym-draft', endTime: '2026-09-10T09:00:00.000Z' }, savedAt: '2026-09-10T08:01:00.000Z', revision: 1, restTimer: null });
    await store.saveExerciseGymScope({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', scopeType: 'linked_group', linkedGymIds: [gym.id, 'gym-default'] });
    await store.deleteGym(gym.id, 'gym-default');
    assert.equal((await store.getWorkoutDetail('gym-workout')).gymId, 'gym-default');
    assert.equal((await store.getWorkoutDraft('gym-draft')).workout.gymId, 'gym-default');
    assert.equal((await store.getExerciseGymScope('Barbell_Bench_Press_-_Medium_Grip')).scopeType, 'gym_specific');
    await store.close();
  });

  it('rejects invalid completed-workout gym IDs before writing', async () => {
    const dbName = `test-web-invalid-workout-gym-${Date.now()}`;
    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    try {
      const workout = (gymId: string) => ({
        id: `invalid-gym-${gymId.trim() || 'empty'}`,
        name: 'Invalid gym workout',
        gymId,
        startTime: '2026-09-10T08:00:00.000Z',
        durationSeconds: 1,
        totalVolumeKg: 0,
        exercises: [],
      });
      await assert.rejects(() => store.saveCompletedWorkout(workout('missing-gym')), /unknown gym/i);
      await assert.rejects(() => store.saveCompletedWorkout(workout('  ')), /gym ID cannot be empty/i);
      assert.equal(await store.getWorkoutDetail('invalid-gym-missing-gym'), null);
      assert.equal(await store.getWorkoutDetail('invalid-gym-empty'), null);
      assert.deepEqual(await store.getWorkoutHistory(), []);
    } finally {
      await store.close();
    }
  });

  it('orders equal-timestamp history by descending code-point workout ID', async () => {
    const dbName = `test-web-history-order-${Date.now()}`;
    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    try {
      const startTime = '2026-09-10T08:00:00.000Z';
      for (const id of ['history-a', 'history-z', 'history-Ω', 'history-😀']) {
        await store.saveCompletedWorkout({
          id,
          name: id,
          gymId: 'gym-default',
          startTime,
          durationSeconds: 1,
          totalVolumeKg: 0,
          exercises: [],
        });
      }

      assert.deepEqual(
        (await store.getWorkoutHistory()).map((workout: { id: string }) => workout.id),
        ['history-😀', 'history-Ω', 'history-z', 'history-a'],
      );
    } finally {
      await store.close();
    }
  });

  it('rejects invalid scope references and all new writes in a read-only tab', async () => {
    const dbName = `test-web-gym-validation-${Date.now()}`;
    const first: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await first.init();
    const second: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await second.init();
    await assert.rejects(() => first.saveExerciseGymScope({ exerciseId: 'missing', scopeType: 'global' }), /Exercise not found/);
    await assert.rejects(() => first.saveExerciseGymScope({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', scopeType: 'invalid' }), /scope type/i);
    await assert.rejects(() => second.createGym('Read only'), /read-only mode/);
    await assert.rejects(() => second.saveExerciseGymScope({ exerciseId: 'missing', scopeType: 'global' }), /read-only mode/);
    await first.close(); await second.close();
  });

  it('matches canonical gym validation and default-first name ordering', async () => {
    const dbName = `test-web-gym-policy-${Date.now()}`;
    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    await assert.rejects(() => store.createGym('  '), /gym name cannot be empty/i);
    await assert.rejects(() => store.createGym('valid', '#06B6D4'), /approved palette/);
    const zulu = await store.createGym('Zulu');
    const alpha = await store.createGym('Alpha');
    await store.setDefaultGym(zulu.id);
    assert.deepEqual((await store.getGyms()).map((gym: any) => gym.name), ['Zulu', 'Alpha', 'Default Gym']);
    await store.close();
  });

  it('persists v2 normalization across reopen and allows read-only legacy reads', async () => {
    const dbName = `test-web-v2-repeat-${Date.now()}`;
    const legacy = await openLegacyVersionOneDatabase(dbName);
    legacy.close();
    const writer: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await writer.init();
    await writer.close();
    const reopened: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await reopened.init();
    const readOnly: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await readOnly.init();
    const raw = await new Promise<any>((resolve, reject) => {
      const req = (indexedDB as any).open(dbName, 2);
      req.onsuccess = () => { const db = req.result; const tx = db.transaction('workouts', 'readonly'); const get = tx.objectStore('workouts').get('legacy-workout'); get.onsuccess = () => { db.close(); resolve(get.result); }; get.onerror = () => reject(get.error); };
      req.onerror = () => reject(req.error);
    });
    assert.equal(raw.gymId, 'gym-default');
    assert.equal((await readOnly.getWorkoutDetail('legacy-workout')).gymId, 'gym-default');
    assert.equal((await reopened.getGyms()).filter((gym: any) => gym.isDefault).length, 1);
    await reopened.close(); await readOnly.close();
  });

  it('rejects invalid snapshot scopes without partially merging any data', async () => {
    const dbName = `test-web-merge-validation-${Date.now()}`;
    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    const before = await store.readSnapshot();
    await assert.rejects(() => store.mergeSnapshot({
      ...before,
      exercises: [...before.exercises, { id: 'new-exercise', name: 'New', category: 'Test', equipment: 'barbell', primaryMuscles: [] }],
      gyms: [...before.gyms, { id: 'gym-new', name: 'New Gym', color: '#10B981', isDefault: false, createdAt: '2026-09-10T00:00:01.000Z' }],
      exerciseGymScopes: [{ exerciseId: 'missing-exercise', scopeType: 'linked_group', linkedGymIds: ['gym-new', 'gym-new'] }],
    }), /duplicate|unknown exercise|at least two/i);
    const after = await store.readSnapshot();
    assert.deepEqual(after, before);
    await store.close();
  });

  it('enforces web gym deletion invariants and preserves default references', async () => {
    const dbName = `test-web-gym-deletion-invariants-${Date.now()}`;
    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    const secondary = await store.createGym('Secondary');
    const workout = { id: 'default-gym-workout', name: 'Default gym workout', gymId: 'gym-default', startTime: '2026-09-10T08:00:00.000Z', durationSeconds: 1, totalVolumeKg: 0, exercises: [] };
    await store.saveCompletedWorkout(workout);
    await store.saveDraft({ version: 1, workout: { ...workout, id: 'default-gym-draft', endTime: '2026-09-10T09:00:00.000Z' }, savedAt: '2026-09-10T08:01:00.000Z', revision: 1, restTimer: null });
    const beforeInvalidDelete = await store.readSnapshot();
    await assert.rejects(() => store.deleteGym('gym-default', 'missing-gym'), /unknown replacement gym/i);
    assert.deepEqual(await store.readSnapshot(), beforeInvalidDelete);
    await assert.rejects(() => store.deleteGym(secondary.id, secondary.id), /replacement gym must be different/i);

    await store.deleteGym('gym-default', secondary.id);
    const gyms = await store.getGyms();
    assert.equal(gyms.filter((gym: any) => gym.isDefault).length, 1);
    assert.equal(gyms.find((gym: any) => gym.id === secondary.id).isDefault, true);
    assert.equal((await store.getWorkoutDetail(workout.id)).gymId, secondary.id);
    assert.equal((await store.getWorkoutDraft('default-gym-draft')).workout.gymId, secondary.id);
    await store.close();
  });

  it('rejects deleting the only gym with a distinct replacement ID', async () => {
    const dbName = `test-web-last-gym-${Date.now()}`;
    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    const before = await store.getGyms();
    await assert.rejects(() => store.deleteGym('gym-default', 'replacement-that-does-not-exist'), /at least two gyms/i);
    assert.deepEqual(await store.getGyms(), before);
    await store.close();
  });

  it('rejects deleting a gym used by an active draft without a caller-supplied gym ID', async () => {
    const dbName = `test-web-active-gym-delete-${Date.now()}`;
    const store: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    try {
      const replacement = await store.createGym('Replacement');
      const controller = createSessionController(store);
      await controller.start({
        id: 'active-web-delete-guard',
        name: 'Active workout',
        gymId: 'gym-default',
        startTime: new Date().toISOString(),
        durationSeconds: 0,
        totalVolumeKg: 0,
        exercises: [],
      });
      await assert.rejects(
        () => store.deleteGym('gym-default', replacement.id),
        /active workout/i,
      );
      assert.deepEqual((await store.getGyms()).map((gym: any) => gym.id), ['gym-default', replacement.id]);
      assert.equal((await store.getWorkoutDraft('active-web-delete-guard'))?.workout.gymId, 'gym-default');
      await controller.discard();
    } finally {
      await store.close();
    }
  });

  it('rejects read-only gym update, default, and delete mutations without changing state', async () => {
    const dbName = `test-web-gym-read-only-mutations-${Date.now()}`;
    const writer: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await writer.init();
    const secondary = await writer.createGym('Secondary');
    const before = await writer.getGyms();
    const reader: any = await createWebStore(dbName, { idbFactory: indexedDB });
    await reader.init();
    await assert.rejects(() => reader.updateGym(secondary.id, { name: 'Changed' }), /read-only mode/);
    await assert.rejects(() => reader.setDefaultGym(secondary.id), /read-only mode/);
    await assert.rejects(() => reader.deleteGym(secondary.id, 'gym-default'), /read-only mode/);
    assert.deepEqual(await writer.getGyms(), before);
    await writer.close(); await reader.close();
  });
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
      gymId: 'gym-default',
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
        gymId: 'gym-default',
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
            gymId: 'gym-default',
            startTime: 'bad-date',
            exercises: null,
          },
        },
      ],
      settings: {},
      gyms: [{ id: 'gym-default', name: 'Default Gym', isDefault: true, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }],
      exerciseGymScopes: [],
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
      gymId: 'gym-default',
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
      gymId: 'gym-default',
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
          gymId: 'gym-default',
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
      gyms: [{ id: 'gym-default', name: 'Default Gym', isDefault: true, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }],
      exerciseGymScopes: [],
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

  it('browser regression: multi-select adding multiple exercises (Air Bike and Alternate Hammer Curl) preserves all exercises and sets across persistence and reload', async () => {
    let currentTime = new Date('2026-09-08T08:00:00.000Z').getTime();
    const now = () => currentTime;
    const dbName = `test-browser-multi-exercise-${Date.now()}`;

    const store = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 10000 });
    await store.init();

    const controller = createSessionController(store, now, { maxDirtyTimeMs: 1000 });

    // 1. Start workout with 4 initial exercises (3 sets each = 12 sets total)
    const initialExerciseIds = [
      'Barbell_Bench_Press_-_Medium_Grip',
      'Barbell_Curl',
      'Barbell_Deadlift',
      'Barbell_Full_Squat',
    ];

    const initialActiveExercises = initialExerciseIds.map((id, idx) => {
      const ex = getBundledExercise(id);
      return {
        id: `ae-init-${idx}`,
        exerciseId: id,
        exercise: ex,
        targetReps: '10',
        restTimerSeconds: 90,
        sets: [1, 2, 3].map((setNum) => ({
          id: `set-init-${idx}-${setNum}`,
          setNumber: setNum,
          type: 'normal' as const,
          weightKg: 50 + idx * 10,
          reps: 10,
          targetReps: '10',
          isCompleted: false,
        })),
      };
    });

    const initialWorkout = {
      id: 'w-browser-multi-1',
      name: 'Full Body Session',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: initialActiveExercises,
    };

    await controller.start(initialWorkout);

    const startingWorkout = controller.getState().workout!;
    assert.equal(startingWorkout.exercises.length, 4, 'Should start with 4 exercises');
    const startingSetsCount = startingWorkout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    assert.equal(startingSetsCount, 12, 'Should start with exactly 12 sets');

    // 2. Select Air Bike and Alternate Hammer Curl to add to active workout
    const airBike = getBundledExercise('Air_Bike');
    const hammerCurl = getBundledExercise('Alternate_Hammer_Curl');
    const selectedExercises = [airBike, hammerCurl];

    // Batch addition (as performed by ActiveWorkoutScreen onSelectMultiple -> addExercisesToWorkout)
    const addExercisesBatch = async (exercises: typeof selectedExercises) => {
      const currentState = controller.getState();
      if (currentState.phase !== 'active' || !currentState.workout) return;

      const currentWorkout = currentState.workout;
      const exerciseCounts = new Map<string, number>();
      for (const ex of currentWorkout.exercises) {
        exerciseCounts.set(ex.exerciseId, (exerciseCounts.get(ex.exerciseId) || 0) + 1);
      }

      const newActiveExercises: any[] = [];
      for (const exercise of exercises) {
        const occurrenceIndex = exerciseCounts.get(exercise.id) || 0;
        exerciseCounts.set(exercise.id, occurrenceIndex + 1);

        const activeExId = `ae-${currentWorkout.id}-${exercise.id}-occ${occurrenceIndex}-${Math.random().toString(36).slice(2, 8)}`;
        const prevSets = await store.getPreviousSetsForExercise(exercise.id, occurrenceIndex);
        const initialSets: any[] = [];
        const count = 3;

        for (let i = 1; i <= count; i++) {
          const ghost = prevSets[i - 1];
          initialSets.push({
            id: `set-${activeExId}-${i}`,
            setNumber: i,
            type: 'normal',
            weightKg: ghost ? ghost.weightKg : 0,
            reps: ghost ? ghost.reps : 10,
            targetReps: '10',
            rpe: 8,
            isCompleted: false,
          });
        }

        newActiveExercises.push({
          id: activeExId,
          exerciseId: exercise.id,
          exercise,
          sets: initialSets,
          notes: '',
          targetReps: '10',
          restTimerSeconds: 90,
        });
      }

      const latestState = controller.getState();
      if (latestState.phase !== 'active' || !latestState.workout) return;

      const updated = {
        ...latestState.workout,
        exercises: [...latestState.workout.exercises, ...newActiveExercises],
      };
      controller.update(updated, null);
    };

    await addExercisesBatch(selectedExercises);

    // Verify in-memory controller state
    const workoutAfterAdd = controller.getState().workout!;
    assert.equal(workoutAfterAdd.exercises.length, 6, 'Active workout should contain all 6 exercises');
    const totalSetsAfterAdd = workoutAfterAdd.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    assert.equal(totalSetsAfterAdd, 18, 'Total sets must increase from 12 to 18 (not 15)');
    assert.ok(
      workoutAfterAdd.exercises.some((e) => e.exerciseId === 'Air_Bike'),
      'Air Bike must be present'
    );
    assert.ok(
      workoutAfterAdd.exercises.some((e) => e.exerciseId === 'Alternate_Hammer_Curl'),
      'Alternate Hammer Curl must be present'
    );

    // 3. Flush to IndexedDB
    await controller.flush();

    // Verify draft in IndexedDB before browser reload
    const draftsBefore = await store.getWorkoutDrafts();
    assert.equal(draftsBefore.length, 1, 'IndexedDB must contain 1 draft');
    assert.equal(draftsBefore[0].workout.exercises.length, 6, 'Draft in IndexedDB must contain 6 exercises');
    const draftSetsBefore = draftsBefore[0].workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    assert.equal(draftSetsBefore, 18, 'Draft in IndexedDB must contain all 18 sets');

    // 4. Simulate page reload / store recreation
    await store.close();

    const reopened = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 10000 });
    await reopened.init();

    // Verify drafts survived browser reload
    const draftsAfterReload = await reopened.getWorkoutDrafts();
    assert.equal(draftsAfterReload.length, 1, 'Draft must survive reload');
    const reloadedWorkout = draftsAfterReload[0].workout;
    assert.equal(reloadedWorkout.exercises.length, 6, 'Reloaded draft must retain all 6 exercises');
    const reloadedSetsCount = reloadedWorkout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    assert.equal(reloadedSetsCount, 18, 'Reloaded draft must retain all 18 sets');
    assert.ok(
      reloadedWorkout.exercises.some((e) => e.exerciseId === 'Air_Bike'),
      'Air Bike must survive reload'
    );
    assert.ok(
      reloadedWorkout.exercises.some((e) => e.exerciseId === 'Alternate_Hammer_Curl'),
      'Alternate Hammer Curl must survive reload'
    );

    // 5. Resume draft in new session controller
    currentTime += 10000;
    const recoveryController = createSessionController(reopened, now);
    recoveryController.resume(draftsAfterReload[0]);
    assert.equal(recoveryController.getState().phase, 'active');
    assert.equal(recoveryController.getState().workout?.exercises.length, 6);

    // 6. Complete sets and finish workout
    const resumedWorkout = recoveryController.getState().workout!;
    const completedWorkout = {
      ...resumedWorkout,
      exercises: resumedWorkout.exercises.map((ex, exIdx) => ({
        ...ex,
        sets: ex.sets.map((s, sIdx) => ({
          ...s,
          isCompleted: true,
          completedAt: new Date(currentTime + exIdx * 60000 + sIdx * 10000).toISOString(),
        })),
      })),
    };
    recoveryController.update(completedWorkout);
    await recoveryController.flush();

    const finished = await recoveryController.finish();
    assert.equal(finished.id, 'w-browser-multi-1');
    assert.equal(finished.exercises.length, 6);
    const finishedSetsCount = finished.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    assert.equal(finishedSetsCount, 18);

    // 7. Verify draft removed and history durable in IndexedDB
    const draftsAfterFinish = await reopened.getWorkoutDrafts();
    assert.equal(draftsAfterFinish.length, 0, 'Draft deleted after finish');

    const history = await reopened.getWorkoutHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].id, 'w-browser-multi-1');

    const detail = await reopened.getWorkoutDetail('w-browser-multi-1');
    assert.ok(detail);
    assert.equal(detail!.exercises.length, 6);
    assert.equal(detail!.exercises.reduce((sum, e) => sum + e.sets.length, 0), 18);

    if (reopened.close) await reopened.close();
  });

  it('browser regression: concurrent asynchronous exercise additions do not overwrite earlier additions', async () => {
    let currentTime = new Date('2026-09-08T09:00:00.000Z').getTime();
    const now = () => currentTime;
    const dbName = `test-browser-concurrent-add-${Date.now()}`;

    const store = await createWebStore(dbName, { idbFactory: indexedDB, now, leaseDurationMs: 10000 });
    await store.init();

    const controller = createSessionController(store, now, { maxDirtyTimeMs: 1000 });

    const workout = {
      id: 'w-browser-concurrent-1',
      name: 'Concurrent Add Session',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [],
    };

    await controller.start(workout);

    const airBike = getBundledExercise('Air_Bike');
    const hammerCurl = getBundledExercise('Alternate_Hammer_Curl');

    // Simulate concurrent individual additions with async lookups reading latest controller state
    const addSingleExercise = async (exercise: any) => {
      const currentState = controller.getState();
      if (currentState.phase !== 'active' || !currentState.workout) return;

      const occurrenceIndex = currentState.workout.exercises.filter(
        (e) => e.exerciseId === exercise.id
      ).length;
      const activeExId = `ae-${currentState.workout.id}-${exercise.id}-occ${occurrenceIndex}-${Math.random().toString(36).slice(2, 8)}`;

      // Asynchronous lookup
      const prevSets = await store.getPreviousSetsForExercise(exercise.id, occurrenceIndex);
      const initialSets = [1, 2, 3].map((setNum) => ({
        id: `set-${activeExId}-${setNum}`,
        setNumber: setNum,
        type: 'normal' as const,
        weightKg: 20,
        reps: 10,
        targetReps: '10',
        rpe: 8,
        isCompleted: false,
      }));

      const newExercise = {
        id: activeExId,
        exerciseId: exercise.id,
        exercise,
        sets: initialSets,
        notes: '',
        targetReps: '10',
        restTimerSeconds: 90,
      };

      // Read fresh controller state after async lookup
      const latestState = controller.getState();
      if (latestState.phase !== 'active' || !latestState.workout) return;

      const updated = {
        ...latestState.workout,
        exercises: [...latestState.workout.exercises, newExercise],
      };
      controller.update(updated, null);
    };

    // Run both additions concurrently (like concurrent addExerciseToWorkout calls)
    await Promise.all([
      addSingleExercise(airBike),
      addSingleExercise(hammerCurl),
    ]);

    // Verify both exercises are retained and neither clobbered the other
    const state = controller.getState();
    assert.equal(state.workout?.exercises.length, 2, 'Both concurrent additions must be retained');
    assert.ok(state.workout?.exercises.some((e) => e.exerciseId === 'Air_Bike'));
    assert.ok(state.workout?.exercises.some((e) => e.exerciseId === 'Alternate_Hammer_Curl'));
    assert.equal(state.workout?.exercises.reduce((sum, e) => sum + e.sets.length, 0), 6);

    await controller.flush();
    const drafts = await store.getWorkoutDrafts();
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].workout.exercises.length, 2);

    if (store.close) await store.close();
  });

  it('updates custom exercises and synchronizes embedded exercises in routines and workouts in web store', async () => {
    const dbName = `test-custom-edit-web-${Date.now()}`;
    const store = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();

    // 1. Create custom exercise
    const created = await store.createCustomExercise({
      name: 'Old Web Custom Lift',
      category: 'strength',
      equipment: 'dumbbell',
      primaryMuscles: ['shoulders'],
    });

    assert.equal(created.name, 'Old Web Custom Lift');
    assert.equal(created.isCustom, true);

    // 2. Save a routine referencing this custom exercise
    const routineId = await store.saveRoutine('Custom Routine', 'Folder', [
      { exerciseId: created.id, targetSets: 3, targetReps: '10-12', restTimerSeconds: 60 },
    ]);

    // 3. Update the custom exercise
    const updated = await store.updateCustomExercise(created.id, {
      name: 'Updated Web Custom Press',
      equipment: 'machine',
      primaryMuscles: ['shoulders', 'triceps'],
    });

    assert.equal(updated.id, created.id);
    assert.equal(updated.name, 'Updated Web Custom Press');
    assert.equal(updated.equipment, 'machine');

    // Verify getExerciseById
    const fetched = await store.getExerciseById(created.id);
    assert.ok(fetched);
    assert.equal(fetched.name, 'Updated Web Custom Press');

    // Verify routine has updated embedded exercise
    const routine = await store.getRoutineById(routineId);
    assert.ok(routine);
    assert.equal(routine.exercises[0].exercise.name, 'Updated Web Custom Press');

    // 4. Reject editing built-in exercise
    await assert.rejects(async () => {
      await store.updateCustomExercise('Barbell_Bench_Press_-_Medium_Grip', {
        name: 'Hacked Bench',
      });
    }, /Cannot edit built-in exercise/);

    // 5. Reject empty name
    await assert.rejects(async () => {
      await store.updateCustomExercise(created.id, {
        name: '',
      });
    }, /Exercise name cannot be empty/);

    if (store.close) await store.close();
  });

  it('persists supersetId across routine creation, retrieval, and duplication in web store', async () => {
    const fixture = await createStoreFixture('web');
    const store = fixture.store;

    const supersetGroupId = 'ss-web-routine-group';
    const routineId = await store.saveRoutine(
      'Web Superset Routine',
      'Full Body',
      [
        {
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          targetSets: 3,
          targetReps: '8-12',
          restTimerSeconds: 60,
          supersetId: supersetGroupId,
        },
        {
          exerciseId: 'Incline_Dumbbell_Press',
          targetSets: 3,
          targetReps: '10',
          restTimerSeconds: 90,
          supersetId: supersetGroupId,
        },
        {
          exerciseId: 'Barbell_Curl',
          targetSets: 4,
          targetReps: '12',
          restTimerSeconds: 60,
        },
      ],
      'Test web superset routine'
    );

    const routine = await store.getRoutineById(routineId);
    assert.ok(routine);
    assert.equal(routine.exercises.length, 3);
    assert.equal(routine.exercises[0].supersetId, supersetGroupId);
    assert.equal(routine.exercises[1].supersetId, supersetGroupId);
    assert.equal(routine.exercises[2].supersetId, undefined);

    // Duplicate routine
    const dupId = await store.duplicateRoutine(routineId);
    const dupRoutine = await store.getRoutineById(dupId);
    assert.ok(dupRoutine);
    assert.equal(dupRoutine.exercises.length, 3);
    // Preserves grouping and has supersetId
    assert.ok(dupRoutine.exercises[0].supersetId);
    assert.equal(dupRoutine.exercises[0].supersetId, dupRoutine.exercises[1].supersetId);
    assert.notEqual(dupRoutine.exercises[0].supersetId, supersetGroupId);
    assert.equal(dupRoutine.exercises[2].supersetId, undefined);

    await fixture.dispose();
  });
});
