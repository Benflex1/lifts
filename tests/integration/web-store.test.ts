import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { createStoreFixture } from '../helpers/storeFixture';
import { createWebStore } from '../../src/database/webStore';

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
});
