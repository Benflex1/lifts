import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NodeSqliteDriver } from '../helpers/storeFixture';
import { createNativeStore } from '../../src/database/nativeStore';
import { applyMigrations } from '../../src/database/migrations';
import { Exercise, Workout } from '../../src/types';
import { createStoreFixture } from '../helpers/storeFixture';
import { createSessionController } from '../../src/workout/session';
import { BUNDLED_EXERCISE_CATALOG_VERSION, DEFAULT_EXERCISES } from '../../src/database/seedData';

class FailingCatalogSyncDriver extends NodeSqliteDriver {
  shouldFail = true;
  exerciseUpdates = 0;

  override async runAsync(sql: string, ...params: any[]): Promise<{ changes: number; lastInsertRowId: number }> {
    if (this.shouldFail && sql.trimStart().startsWith('UPDATE exercises')) {
      this.exerciseUpdates++;
      if (this.exerciseUpdates === 2) {
        throw new Error('Injected catalog synchronization failure');
      }
    }
    return super.runAsync(sql, ...params);
  }
}

describe('nativeStore and migration safety', () => {
  it('adds link columns to legacy exercises and preserves existing custom rows', async () => {
    const driver = new NodeSqliteDriver();
    await applyMigrations(driver, { maxVersion: 7 });
    await driver.runAsync(
      `INSERT INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'built-in-id', 'Built-in Exercise', 'strength', 'barbell', '["chest"]', null, null, 0
    );
    await driver.runAsync(
      `INSERT INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'custom-id', 'User Exercise', 'strength', 'machine', '["back"]', null, null, 1
    );

    const store = createNativeStore(driver);
    await store.init();

    const columns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
    assert.ok(columns.some(column => column.name === 'instruction_url'));
    assert.ok(columns.some(column => column.name === 'instruction_url_type'));
    assert.equal((await store.getExerciseById('built-in-id'))?.secondaryMuscles instanceof Array, true);
    assert.equal((await store.getExerciseById('custom-id'))?.name, 'User Exercise');
    assert.equal(
      (await driver.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', 'exercise_catalog_version'))?.value,
      String(BUNDLED_EXERCISE_CATALOG_VERSION),
    );

    await store.init();
    const columnNames = columns.map(column => column.name);
    const rereadColumns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
    assert.equal(rereadColumns.filter(column => column.name === 'instruction_url').length, 1);
    assert.deepEqual(rereadColumns.map(column => column.name), columnNames);
    driver.close();
  });

  it('rolls back migration 8 schema and catalog marker when failure is injected', async () => {
    const driver = new NodeSqliteDriver();
    await applyMigrations(driver, { maxVersion: 7 });

    await assert.rejects(
      () => applyMigrations(driver, { failAtVersion: 8 }),
      /Injected migration failure at version 8/,
    );

    const columns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
    assert.equal(columns.some(column => column.name === 'instruction_url'), false);
    assert.equal(columns.some(column => column.name === 'instruction_url_type'), false);
    assert.equal(await driver.getFirstAsync<any>('SELECT value FROM app_meta WHERE key = ?', 'exercise_catalog_version'), null);
    assert.equal(await driver.getFirstAsync<any>('SELECT version FROM schema_migrations WHERE version = 8'), null);
    driver.close();
  });

  it('synchronizes built-ins by ID without replacing a custom row with a bundled ID', async () => {
    const driver = new NodeSqliteDriver();
    await applyMigrations(driver, { maxVersion: 7 });
    const bundled = DEFAULT_EXERCISES[0];
    await driver.runAsync(
      `INSERT INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      bundled.id, 'Stale Built-in Name', 'old-category', 'old-equipment', '[]', '[]', '[]'
    );
    await driver.runAsync(
      `INSERT INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      DEFAULT_EXERCISES[1].id, 'User Override', 'custom', 'machine', '["arms"]', '["shoulders"]', '["Keep this"]'
    );

    const store = createNativeStore(driver);
    await store.init();

    const synchronized = await store.getExerciseById(bundled.id);
    assert.ok(synchronized);
    assert.equal(synchronized.name, bundled.name);
    assert.deepEqual(synchronized.secondaryMuscles, bundled.secondaryMuscles);
    assert.deepEqual(synchronized.instructions, bundled.instructions);
    assert.equal((await store.getExerciseById(DEFAULT_EXERCISES[1].id))?.name, 'User Override');
    assert.equal((await store.getAllExercises()).length, DEFAULT_EXERCISES.length);
    driver.close();
  });

  it('round-trips curated links and omits null links through native mappings and merges', async () => {
    const driver = new NodeSqliteDriver();
    const store = createNativeStore(driver);
    await store.init();

    const linked = await store.createCustomExercise({
      name: 'Linked Custom Exercise',
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps'],
      instructions: ['Press with control.'],
      instructionUrl: 'https://example.com/linked-exercise',
      instructionUrlType: 'website',
    });
    const unlinked = await store.createCustomExercise({
      name: 'Unlinked Custom Exercise',
      category: 'strength',
      equipment: 'machine',
      primaryMuscles: ['back'],
    });

    const directLinked = await store.getExerciseById(linked.id);
    const directUnlinked = await store.getExerciseById(unlinked.id);
    assert.equal(directLinked?.instructionUrl, 'https://example.com/linked-exercise');
    assert.equal(directLinked?.instructionUrlType, 'website');
    assert.equal('instructionUrl' in (directUnlinked || {}), false);
    assert.equal('instructionUrlType' in (directUnlinked || {}), false);

    await store.updateCustomExercise(linked.id, { name: 'Edited Linked Custom Exercise' });
    const edited = await store.getExerciseById(linked.id);
    assert.equal(edited?.name, 'Edited Linked Custom Exercise');
    assert.equal(edited?.instructionUrl, 'https://example.com/linked-exercise');
    assert.equal(edited?.instructionUrlType, 'website');

    const routineId = await store.saveRoutine('Link Mapping Routine', 'Testing', [
      { exerciseId: linked.id, targetSets: 1, targetReps: '8', restTimerSeconds: 60 },
      { exerciseId: unlinked.id, targetSets: 1, targetReps: '8', restTimerSeconds: 60 },
    ]);
    const routine = await store.getRoutineById(routineId);
    assert.equal(routine?.exercises[0].exercise.instructionUrl, 'https://example.com/linked-exercise');
    assert.equal('instructionUrl' in routine!.exercises[1].exercise, false);
    assert.equal('instructionUrlType' in routine!.exercises[1].exercise, false);

    await store.saveCompletedWorkout({
      id: 'link-mapping-workout',
      name: 'Link Mapping Workout',
      gymId: 'gym-default',
      startTime: '2026-09-14T08:00:00.000Z',
      endTime: '2026-09-14T09:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 0,
      exercises: [
        { id: 'link-mapping-linked', exerciseId: linked.id, exercise: edited!, sets: [], restTimerSeconds: 60 },
        { id: 'link-mapping-unlinked', exerciseId: unlinked.id, exercise: directUnlinked!, sets: [], restTimerSeconds: 60 },
      ],
    });
    const workout = await store.getWorkoutDetail('link-mapping-workout');
    assert.equal(workout?.exercises[0].exercise.instructionUrl, 'https://example.com/linked-exercise');
    assert.equal('instructionUrl' in workout!.exercises[1].exercise, false);
    assert.equal('instructionUrlType' in workout!.exercises[1].exercise, false);

    const raw = await driver.getFirstAsync<any>('SELECT instruction_url, instruction_url_type FROM exercises WHERE id = ?', linked.id);
    assert.equal(raw?.instruction_url, 'https://example.com/linked-exercise');
    assert.equal(raw?.instruction_url_type, 'website');

    const destinationDriver = new NodeSqliteDriver();
    const destination = createNativeStore(destinationDriver);
    await destination.init();
    await destination.mergeSnapshot({
      workouts: [],
      routines: [],
      exercises: [edited!, directUnlinked!],
      drafts: [],
      settings: {},
      gyms: [await store.getDefaultGym()],
      exerciseGymScopes: [],
    });
    const mergedLinked = await destination.getExerciseById(linked.id);
    const mergedUnlinked = await destination.getExerciseById(unlinked.id);
    assert.equal(mergedLinked?.instructionUrl, 'https://example.com/linked-exercise');
    assert.equal(mergedLinked?.instructionUrlType, 'website');
    assert.equal('instructionUrl' in (mergedUnlinked || {}), false);
    assert.equal('instructionUrlType' in (mergedUnlinked || {}), false);
    destinationDriver.close();
    driver.close();
  });

  it('normalizes omitted custom exercise arrays at native create and read boundaries', async () => {
    const driver = new NodeSqliteDriver();
    const store = createNativeStore(driver);
    await store.init();

    const created = await store.createCustomExercise({
      name: 'Legacy Native Custom',
      category: 'strength',
      equipment: 'machine',
      primaryMuscles: ['back'],
      instructionUrl: 'https://example.com/legacy-native-custom',
      instructionUrlType: 'website',
    });

    assert.deepEqual(created.secondaryMuscles, []);
    assert.deepEqual(created.instructions, []);
    assert.equal(created.instructionUrl, 'https://example.com/legacy-native-custom');
    assert.deepEqual((await store.getExerciseById(created.id))?.secondaryMuscles, []);
    assert.deepEqual((await store.getExerciseById(created.id))?.instructions, []);
    assert.equal((await store.getExerciseById(created.id))?.instructionUrlType, 'website');
    driver.close();
  });

  it('normalizes omitted and null arrays in native draft save and read payloads', async () => {
    const driver = new NodeSqliteDriver();
    const store = createNativeStore(driver);
    await store.init();
    const created = await store.createCustomExercise({
      name: 'Legacy Draft Custom',
      category: 'strength',
      equipment: 'body only',
      primaryMuscles: ['core'],
    });
    const legacyEmbedded = {
      ...created,
      secondaryMuscles: null,
      instructions: undefined,
    } as unknown as Exercise;

    await store.saveDraft({
      version: 1,
      savedAt: '2026-09-15T08:00:00.000Z',
      revision: 1,
      restTimer: null,
      workout: {
        id: 'native-legacy-draft',
        name: 'Legacy Draft',
        gymId: 'gym-default',
        startTime: '2026-09-15T08:00:00.000Z',
        durationSeconds: 0,
        totalVolumeKg: 0,
        exercises: [{
          id: 'native-legacy-draft-exercise',
          exerciseId: created.id,
          exercise: legacyEmbedded,
          sets: [],
          restTimerSeconds: 60,
        }],
      },
    });

    const draft = await store.getWorkoutDraft('native-legacy-draft');
    assert.deepEqual(draft?.workout.exercises[0].exercise.secondaryMuscles, []);
    assert.deepEqual(draft?.workout.exercises[0].exercise.instructions, []);
    driver.close();
  });

  it('normalizes omitted and null arrays in native merged drafts and snapshots', async () => {
    const driver = new NodeSqliteDriver();
    const store = createNativeStore(driver);
    await store.init();
    const mergedExercise: Exercise = {
      id: 'native-merged-legacy-custom',
      name: 'Merged Legacy Custom',
      category: 'strength',
      equipment: 'other',
      primaryMuscles: ['shoulders'],
      secondaryMuscles: null as unknown as string[],
      instructions: undefined,
      instructionUrl: 'https://example.com/merged-legacy-custom',
      instructionUrlType: 'website',
      isCustom: true,
    };

    await store.mergeSnapshot({
      workouts: [],
      routines: [],
      exercises: [mergedExercise],
      drafts: [{
        version: 1,
        savedAt: '2026-09-15T09:00:00.000Z',
        revision: 1,
        restTimer: null,
        workout: {
          id: 'native-merged-legacy-draft',
          name: 'Merged Legacy Draft',
          gymId: 'gym-default',
          startTime: '2026-09-15T09:00:00.000Z',
          durationSeconds: 0,
          totalVolumeKg: 0,
          exercises: [{
            id: 'native-merged-legacy-draft-exercise',
            exerciseId: mergedExercise.id,
            exercise: mergedExercise,
            sets: [],
            restTimerSeconds: 60,
          }],
        },
      }],
      settings: {},
      gyms: [],
      exerciseGymScopes: [],
    });

    const merged = await store.getExerciseById(mergedExercise.id);
    assert.deepEqual(merged?.secondaryMuscles, []);
    assert.deepEqual(merged?.instructions, []);
    assert.equal(merged?.instructionUrl, mergedExercise.instructionUrl);
    const draft = await store.getWorkoutDraft('native-merged-legacy-draft');
    assert.deepEqual(draft?.workout.exercises[0].exercise.secondaryMuscles, []);
    assert.deepEqual(draft?.workout.exercises[0].exercise.instructions, []);
    const snapshotDraft = (await store.readSnapshot()).drafts.find(item => item.workout.id === 'native-merged-legacy-draft');
    assert.deepEqual(snapshotDraft?.workout.exercises[0].exercise.secondaryMuscles, []);
    assert.deepEqual(snapshotDraft?.workout.exercises[0].exercise.instructions, []);
    driver.close();
  });

  it('keeps catalog synchronization data and marker atomic when synchronization fails', async () => {
    const driver = new FailingCatalogSyncDriver();
    await applyMigrations(driver, { maxVersion: 7 });
    await driver.runAsync(
      `INSERT INTO app_meta (key, value) VALUES (?, ?), (?, ?)`,
      'exercises_seeded', '1', 'routines_seeded', '1',
    );
    const first = DEFAULT_EXERCISES[0];
    const second = DEFAULT_EXERCISES[1];
    for (const exercise of [first, second]) {
      await driver.runAsync(
        `INSERT INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        exercise.id, `Stale ${exercise.name}`, 'stale', 'stale', '[]', '[]', '[]',
      );
    }
    await driver.runAsync(
      `INSERT INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      'sync-custom-id', 'Keep Custom', 'custom', 'machine', '[]', '[]',
    );

    const store = createNativeStore(driver);
    await assert.rejects(() => store.init(), /Injected catalog synchronization failure/);
    assert.equal(
      (await driver.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', 'exercise_catalog_version'))?.value,
      '0',
    );
    assert.equal((await store.getExerciseById(first.id))?.name, `Stale ${first.name}`);
    assert.equal((await store.getExerciseById(second.id))?.name, `Stale ${second.name}`);
    assert.equal((await store.getExerciseById('sync-custom-id'))?.name, 'Keep Custom');

    driver.shouldFail = false;
    await store.init();
    assert.equal(
      (await driver.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', 'exercise_catalog_version'))?.value,
      String(BUNDLED_EXERCISE_CATALOG_VERSION),
    );
    assert.equal((await store.getExerciseById(first.id))?.name, first.name);
    assert.equal((await store.getExerciseById(second.id))?.name, second.name);
    assert.equal((await store.getExerciseById('sync-custom-id'))?.name, 'Keep Custom');
    driver.close();
  });

  it('bootstraps the default gym and backfills legacy workout and draft gym IDs', async () => {
    const tempFile = path.join(os.tmpdir(), `test-native-gym-backfill-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    await applyMigrations(driver, { maxVersion: 4 });
    await driver.runAsync(
      `INSERT INTO exercises (id, name, category, equipment, primary_muscles) VALUES (?, ?, ?, ?, ?)`,
      'legacy-exercise', 'Legacy Exercise', 'strength', 'machine', '[]'
    );
    await driver.runAsync(
      `INSERT INTO workouts (id, name, start_time, end_time, in_progress) VALUES (?, ?, ?, ?, 0)`,
      'legacy-workout', 'Legacy Workout', '2026-09-09T08:00:00.000Z', '2026-09-09T09:00:00.000Z'
    );
    await driver.runAsync(
      `INSERT INTO workout_drafts (id, revision, saved_at, data) VALUES (?, ?, ?, ?)`,
      'legacy-draft', 1, '2026-09-09T10:00:00.000Z', JSON.stringify({
        version: 1, workout: { id: 'legacy-draft', name: 'Draft', startTime: '2026-09-09T10:00:00.000Z', durationSeconds: 0, totalVolumeKg: 0, exercises: [] },
        savedAt: '2026-09-09T10:00:00.000Z', revision: 1, restTimer: null,
      })
    );
    const store = createNativeStore(driver);
    await store.init();
    const gyms = await store.getGyms();
    assert.equal(gyms.length, 1);
    assert.equal(gyms[0].id, 'gym-default');
    assert.equal(gyms[0].name, 'Default Gym');
    assert.equal(gyms[0].isDefault, true);
    assert.equal(gyms[0].color, '#3B82F6');
    const columns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)');
    assert.ok(columns.some(column => column.name === 'gym_id'));
    assert.equal((await store.getWorkoutDetail('legacy-workout'))?.gymId, 'gym-default');
    assert.equal((await store.getWorkoutDrafts())[0].workout.gymId, 'gym-default');
    driver.close();
    fs.unlinkSync(tempFile);
  });

  it('rolls back all migration 5 changes when failure is injected', async () => {
    const driver = new NodeSqliteDriver();
    await applyMigrations(driver, { maxVersion: 4 });
    await driver.runAsync(
      `INSERT INTO workouts (id, name, start_time, in_progress) VALUES (?, ?, ?, 0)`,
      'rollback-workout', 'Keep Workout', '2026-09-09T08:00:00.000Z'
    );
    const legacyDraft = JSON.stringify({ version: 1, workout: { id: 'rollback-draft', name: 'Keep Draft' } });
    await driver.runAsync(
      `INSERT INTO workout_drafts (id, revision, saved_at, data) VALUES (?, ?, ?, ?)`,
      'rollback-draft', 1, '2026-09-09T09:00:00.000Z', legacyDraft
    );
    await assert.rejects(() => applyMigrations(driver, { failAtVersion: 5 }), /Injected migration failure at version 5/);
    assert.equal(await driver.getFirstAsync<any>("SELECT name FROM sqlite_master WHERE type='table' AND name='gyms'"), null);
    assert.equal((await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)')).some(c => c.name === 'gym_id'), false);
    const rollbackWorkout = await driver.getFirstAsync<any>('SELECT id, name FROM workouts WHERE id = ?', 'rollback-workout');
    assert.equal(rollbackWorkout?.id, 'rollback-workout');
    assert.equal(rollbackWorkout?.name, 'Keep Workout');
    assert.equal((await driver.getFirstAsync<{ data: string }>('SELECT data FROM workout_drafts WHERE id = ?', 'rollback-draft'))?.data, legacyDraft);
    assert.equal(await driver.getFirstAsync<any>('SELECT version FROM schema_migrations WHERE version = 5'), null);
    driver.close();
  });

  it('persists gym CRUD, atomic reassignment, and scope overrides', async () => {
    const fixture = await createStoreFixture('native');
    try {
      const { store } = fixture;
      const first = await store.createGym('Home', '#10B981');
      const second = await store.createGym('Away', '#F59E0B');
      const exercise = await store.getExerciseById('Barbell_Bench_Press_-_Medium_Grip');
      assert.ok(exercise);
      const workout: Workout = {
        id: 'gym-reassignment-workout', name: 'Gym Reassignment', gymId: first.id,
        startTime: '2026-09-09T11:00:00.000Z', durationSeconds: 60, totalVolumeKg: 0, exercises: [],
      };
      await store.saveCompletedWorkout(workout);
      await store.saveDraft({ version: 1, workout: { ...workout, id: 'gym-reassignment-draft', endTime: '2026-09-09T12:00:00.000Z' }, savedAt: workout.startTime, revision: 1, restTimer: null });
      await store.saveExerciseGymScope({ exerciseId: exercise.id, scopeType: 'linked_group', linkedGymIds: [first.id, second.id] });
      await store.setDefaultGym(first.id);
      assert.equal((await store.getDefaultGym()).id, first.id);
      assert.equal((await store.updateGym(first.id, { name: 'Home Gym', color: '#EF4444' })).name, 'Home Gym');
      assert.deepEqual((await store.getExerciseGymScope(exercise.id))?.linkedGymIds, [first.id, second.id]);
      await store.deleteGym(first.id, second.id);
      assert.equal((await store.getGyms()).length, 2);
      assert.equal((await store.getDefaultGym()).id, second.id);
      assert.equal((await store.getWorkoutDetail(workout.id))?.gymId, second.id);
      assert.equal((await store.getWorkoutDrafts()).find(d => d.workout.id === 'gym-reassignment-draft')?.workout.gymId, second.id);
      assert.deepEqual((await store.getExerciseGymScope(exercise.id))?.scopeType, 'gym_specific');
      await store.deleteExerciseGymScope(exercise.id);
      assert.equal(await store.getExerciseGymScope(exercise.id), null);
      await assert.rejects(() => store.deleteGym(second.id, second.id), /different/);
      await assert.rejects(() => store.createGym('   '), /empty/);
    } finally {
      await fixture.dispose();
    }
  });

  it('rejects invalid completed-workout gym IDs before writing', async () => {
    const fixture = await createStoreFixture('native');
    try {
      const workout = (gymId: string): Workout => ({
        id: `invalid-gym-${gymId.trim() || 'empty'}`,
        name: 'Invalid gym workout',
        gymId,
        startTime: '2026-09-10T08:00:00.000Z',
        durationSeconds: 1,
        totalVolumeKg: 0,
        exercises: [],
      });
      await assert.rejects(() => fixture.store.saveCompletedWorkout(workout('missing-gym')), /unknown gym/i);
      await assert.rejects(() => fixture.store.saveCompletedWorkout(workout('  ')), /gym ID cannot be empty/i);
      assert.equal(await fixture.store.getWorkoutDetail('invalid-gym-missing-gym'), null);
      assert.equal(await fixture.store.getWorkoutDetail('invalid-gym-empty'), null);
      assert.deepEqual(await fixture.store.getWorkoutHistory(), []);
    } finally {
      await fixture.dispose();
    }
  });

  it('orders equal-timestamp history by descending SQLite-binary workout ID', async () => {
    const fixture = await createStoreFixture('native');
    try {
      const startTime = '2026-09-10T08:00:00.000Z';
      for (const id of ['history-a', 'history-z', 'history-Ω', 'history-😀']) {
        await fixture.store.saveCompletedWorkout({
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
        (await fixture.store.getWorkoutHistory()).map(workout => workout.id),
        ['history-😀', 'history-Ω', 'history-z', 'history-a'],
      );
    } finally {
      await fixture.dispose();
    }
  });

  it('rejects deletion when the default gym is the only gym', async () => {
    const fixture = await createStoreFixture('native');
    try {
      await assert.rejects(() => fixture.store.deleteGym('gym-default', 'replacement'), /at least two/);
    } finally {
      await fixture.dispose();
    }
  });

  it('rejects deleting a gym used by an active draft without a caller-supplied gym ID', async () => {
    const fixture = await createStoreFixture('native');
    try {
      const replacement = await fixture.store.createGym('Replacement');
      const controller = createSessionController(fixture.store);
      await controller.start({
        id: 'active-native-delete-guard',
        name: 'Active workout',
        gymId: 'gym-default',
        startTime: new Date().toISOString(),
        durationSeconds: 0,
        totalVolumeKg: 0,
        exercises: [],
      });
      await assert.rejects(
        () => fixture.store.deleteGym('gym-default', replacement.id),
        /active workout/i,
      );
      assert.deepEqual((await fixture.store.getGyms()).map((gym) => gym.id), ['gym-default', replacement.id]);
      assert.equal((await fixture.store.getWorkoutDraft('active-native-delete-guard'))?.workout.gymId, 'gym-default');
      await controller.discard();
    } finally {
      await fixture.dispose();
    }
  });

  it('rejects deleting a gym referenced by a legacy in-progress workout row', async () => {
    const fixture = await createStoreFixture('native');
    try {
      const replacement = await fixture.store.createGym('Replacement');
      await fixture.driver!.runAsync(
        `INSERT INTO workouts (id, name, gym_id, start_time, duration_seconds, total_volume_kg, in_progress)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        'legacy-active-delete-guard',
        'Legacy active workout',
        'gym-default',
        new Date().toISOString(),
        0,
        0,
      );
      await assert.rejects(
        () => fixture.store.deleteGym('gym-default', replacement.id),
        /in-progress|active workout/i,
      );
      assert.deepEqual((await fixture.store.getGyms()).map((gym) => gym.id), ['gym-default', replacement.id]);
    } finally {
      await fixture.dispose();
    }
  });

  it('includes gyms and scopes in native snapshots', async () => {
    const fixture = await createStoreFixture('native');
    try {
      const snapshot = await fixture.store.readSnapshot();
      assert.equal(snapshot.gyms[0].id, 'gym-default');
      assert.deepEqual(snapshot.exerciseGymScopes, []);
    } finally {
      await fixture.dispose();
    }
  });

  it('migrates an old-schema database with completed workouts and in-progress drafts without data loss', async () => {
    const tempFile = path.join(os.tmpdir(), `test-old-schema-${Date.now()}.db`);
    const rawDriver = new NodeSqliteDriver(tempFile);

    // 1. Setup old-schema database directly
    await rawDriver.execAsync(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE exercises (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
        equipment TEXT NOT NULL, primary_muscles TEXT NOT NULL,
        secondary_muscles TEXT, instructions TEXT, is_custom INTEGER DEFAULT 0
      );
      CREATE TABLE routines (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, folder_name TEXT,
        notes TEXT, created_at TEXT DEFAULT (datetime('now')), last_performed_at TEXT
      );
      CREATE TABLE routine_exercises (
        id TEXT PRIMARY KEY, routine_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
        order_index INTEGER NOT NULL, target_sets INTEGER DEFAULT 3,
        target_reps TEXT DEFAULT '8-12', rest_timer_seconds INTEGER DEFAULT 90,
        FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
        FOREIGN KEY (exercise_id) REFERENCES exercises(id)
      );
      CREATE TABLE workouts (
        id TEXT PRIMARY KEY, routine_id TEXT, name TEXT NOT NULL,
        start_time TEXT NOT NULL, end_time TEXT, duration_seconds INTEGER DEFAULT 0,
        total_volume_kg REAL DEFAULT 0, notes TEXT, in_progress INTEGER DEFAULT 0
      );
      CREATE TABLE workout_exercises (
        id TEXT PRIMARY KEY, workout_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
        order_index INTEGER NOT NULL, notes TEXT, rest_timer_seconds INTEGER DEFAULT 90,
        FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
        FOREIGN KEY (exercise_id) REFERENCES exercises(id)
      );
      CREATE TABLE exercise_sets (
        id TEXT PRIMARY KEY, workout_exercise_id TEXT NOT NULL,
        set_number INTEGER NOT NULL, set_type TEXT NOT NULL DEFAULT 'normal',
        weight_kg REAL NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0,
        rpe REAL, is_completed INTEGER DEFAULT 0, completed_at TEXT,
        FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
      );
    `);

    // Insert custom exercise
    await rawDriver.runAsync(
      `INSERT INTO exercises (id, name, category, equipment, primary_muscles, is_custom)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'custom-ex-1', 'My Custom Exercise', 'Chest', 'Barbell', JSON.stringify(['Chest'])
    );

    // Insert setting
    await rawDriver.runAsync(`INSERT INTO settings (key, value) VALUES (?, ?)`, 'weight_unit', 'lb');

    // Insert routine with metadata
    await rawDriver.runAsync(
      `INSERT INTO routines (id, name, folder_name, notes, created_at, last_performed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'routine-1', 'Heavy Chest', 'Chest Splits', 'Push hard', '2026-09-01T08:00:00.000Z', '2026-09-05T10:00:00.000Z'
    );
    await rawDriver.runAsync(
      `INSERT INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, rest_timer_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      're-1', 'routine-1', 'custom-ex-1', 0, 4, '6-8', 120
    );

    // Insert completed workout
    await rawDriver.runAsync(
      `INSERT INTO workouts (id, routine_id, name, start_time, end_time, duration_seconds, total_volume_kg, notes, in_progress)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'workout-completed-1', 'routine-1', 'Heavy Chest Session', '2026-09-05T09:00:00.000Z', '2026-09-05T10:00:00.000Z', 3600, 1000, 'Felt great', 0
    );
    await rawDriver.runAsync(
      `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, notes)
       VALUES (?, ?, ?, ?, ?)`,
      'we-comp-1', 'workout-completed-1', 'custom-ex-1', 0, 'Used belt'
    );
    await rawDriver.runAsync(
      `INSERT INTO exercise_sets (id, workout_exercise_id, set_number, set_type, weight_kg, reps, rpe, is_completed, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      'set-comp-1', 'we-comp-1', 1, 'normal', 100, 10, 8.5, '2026-09-05T09:15:00.000Z'
    );

    // Insert two in-progress drafts
    await rawDriver.runAsync(
      `INSERT INTO workouts (id, routine_id, name, start_time, duration_seconds, total_volume_kg, in_progress)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      'draft-old-1', 'routine-1', 'In Progress Chest', '2026-09-07T08:00:00.000Z', 600, 200
    );
    await rawDriver.runAsync(
      `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index)
       VALUES (?, ?, ?, ?)`,
      'we-draft-1', 'draft-old-1', 'custom-ex-1', 0
    );
    await rawDriver.runAsync(
      `INSERT INTO exercise_sets (id, workout_exercise_id, set_number, set_type, weight_kg, reps, is_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'set-draft-1', 'we-draft-1', 1, 'normal', 100, 2, 1
    );

    await rawDriver.runAsync(
      `INSERT INTO workouts (id, name, start_time, duration_seconds, in_progress)
       VALUES (?, ?, ?, ?, 1)`,
      'draft-old-2', 'Empty Workout Draft', '2026-09-07T09:00:00.000Z', 300
    );

    rawDriver.close();

    // 2. Open with NativeStore (which applies migrations automatically)
    const storeDriver1 = new NodeSqliteDriver(tempFile);
    const store1 = createNativeStore(storeDriver1);
    await store1.init();

    // Verify custom exercise survived
    const customEx = await store1.getExerciseById('custom-ex-1');
    assert.ok(customEx, 'Custom exercise must survive migration');
    assert.equal(customEx.name, 'My Custom Exercise');

    // Verify setting survived
    const unit = await store1.getSetting('weight_unit');
    assert.equal(unit, 'lb');

    // Verify routine survived with metadata intact
    const routine = await store1.getRoutineById('routine-1');
    assert.ok(routine, 'Routine must survive migration');
    assert.equal(routine.createdAt, '2026-09-01T08:00:00.000Z');
    assert.equal(routine.lastPerformedAt, '2026-09-05T10:00:00.000Z');
    assert.equal(routine.exercises.length, 1);

    // Verify completed workout survived intact
    const history = await store1.getWorkoutHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].id, 'workout-completed-1');
    assert.equal(history[0].totalVolumeKg, 1000);

    const workoutDetail = await store1.getWorkoutDetail('workout-completed-1');
    assert.ok(workoutDetail);
    assert.equal(workoutDetail.exercises[0].sets[0].weightKg, 100);
    assert.equal(workoutDetail.exercises[0].sets[0].rpe, 8.5);

    // Verify drafts migrated to dedicated drafts store
    const drafts = await store1.getWorkoutDrafts();
    assert.equal(drafts.length, 2, 'Both old in-progress workouts must be migrated to workout_drafts');

    const draft1 = drafts.find(d => d.workout.id === 'draft-old-1');
    assert.ok(draft1);
    assert.equal(draft1.workout.startTime, '2026-09-07T08:00:00.000Z');
    assert.equal(draft1.workout.exercises.length, 1);
    assert.equal(draft1.workout.exercises[0].sets.length, 1);

    const draft2 = drafts.find(d => d.workout.id === 'draft-old-2');
    assert.ok(draft2);
    assert.equal(draft2.workout.name, 'Empty Workout Draft');

    // Verify old in_progress workouts were removed from workouts table
    const rawOldRows = await storeDriver1.getAllAsync<any>(
      'SELECT * FROM workouts WHERE in_progress = 1'
    );
    assert.equal(rawOldRows.length, 0, 'No in_progress workouts should remain in workouts table');

    storeDriver1.close();

    // 3. Reopen / migrate second time — assert idempotence (no changes)
    const storeDriver2 = new NodeSqliteDriver(tempFile);
    const store2 = createNativeStore(storeDriver2);
    await store2.init();

    const snapshot2 = await store2.readSnapshot();
    assert.equal(snapshot2.workouts.length, 1);
    assert.equal(snapshot2.drafts.length, 2);
    assert.equal(snapshot2.routines.length >= 1, true);
    assert.equal(snapshot2.settings['weight_unit'], 'lb');

    storeDriver2.close();
    fs.unlinkSync(tempFile);
  });

  it('rolls back completely if a migration failure is injected', async () => {
    const tempFile = path.join(os.tmpdir(), `test-fail-migration-${Date.now()}.db`);
    const rawDriver = new NodeSqliteDriver(tempFile);

    // Apply base schema (version 1)
    await applyMigrations(rawDriver, { maxVersion: 1 });

    // Insert test data
    await rawDriver.runAsync(
      `INSERT INTO workouts (id, name, start_time, in_progress) VALUES (?, ?, ?, 1)`,
      'draft-to-keep', 'Important Draft', '2026-09-07T10:00:00.000Z'
    );

    // Try applying migration 2 with an injected failure
    await assert.rejects(async () => {
      await applyMigrations(rawDriver, { failAtVersion: 2 });
    }, /Injected migration failure at version 2/);

    // Verify old record remains intact and workout_drafts was not committed
    const row = await rawDriver.getFirstAsync<any>('SELECT * FROM workouts WHERE id = ?', 'draft-to-keep');
    assert.ok(row, 'Row in workouts must still exist after rollback');
    assert.equal(row.name, 'Important Draft');

    const draftsTable = await rawDriver.getFirstAsync<any>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='workout_drafts'"
    );
    assert.equal(draftsTable, null, 'workout_drafts table should not exist after rollback');

    rawDriver.close();
    fs.unlinkSync(tempFile);
  });

  it('adds the in_progress column when upgrading a legacy database that predates it', async () => {
    const tempFile = path.join(os.tmpdir(), `test-legacy-no-progress-${Date.now()}.db`);
    const rawDriver = new NodeSqliteDriver(tempFile);

    await rawDriver.execAsync(`
      CREATE TABLE workouts (
        id TEXT PRIMARY KEY, routine_id TEXT, name TEXT NOT NULL,
        start_time TEXT NOT NULL, end_time TEXT, duration_seconds INTEGER DEFAULT 0,
        total_volume_kg REAL DEFAULT 0, notes TEXT
      );
    `);
    await rawDriver.runAsync(
      `INSERT INTO workouts (id, name, start_time, end_time, duration_seconds, total_volume_kg)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'legacy-completed-1',
      'Legacy Workout',
      '2026-09-05T09:00:00.000Z',
      '2026-09-05T10:00:00.000Z',
      3600,
      500
    );
    rawDriver.close();

    const driver = new NodeSqliteDriver(tempFile);
    try {
      const store = createNativeStore(driver);
      await store.init();

      const history = await store.getWorkoutHistory();
      assert.equal(history.length, 1);
      assert.equal(history[0].id, 'legacy-completed-1');

      const columns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workouts);');
      assert.ok(columns.some(column => column.name === 'in_progress'));
    } finally {
      driver.close();
      fs.unlinkSync(tempFile);
    }
  });

  it('repairs databases that already recorded the old migration without in_progress', async () => {
    const tempFile = path.join(os.tmpdir(), `test-legacy-recorded-migration-${Date.now()}.db`);
    const rawDriver = new NodeSqliteDriver(tempFile);

    await rawDriver.execAsync(`
      CREATE TABLE workouts (
        id TEXT PRIMARY KEY, routine_id TEXT, name TEXT NOT NULL,
        start_time TEXT NOT NULL, end_time TEXT, duration_seconds INTEGER DEFAULT 0,
        total_volume_kg REAL DEFAULT 0, notes TEXT
      );
    `);
    await applyMigrations(rawDriver, { maxVersion: 1 });
    await rawDriver.execAsync(`
      CREATE TABLE workout_drafts (
        id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL DEFAULT 1,
        saved_at TEXT NOT NULL,
        rest_timer_ends_at INTEGER,
        rest_timer_total_seconds INTEGER,
        data TEXT NOT NULL
      );
      ALTER TABLE workout_exercises ADD COLUMN target_reps TEXT;
    `);
    await rawDriver.runAsync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      2,
      new Date().toISOString()
    );
    await rawDriver.runAsync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      3,
      new Date().toISOString()
    );
    await rawDriver.runAsync(
      `INSERT INTO workouts (id, name, start_time, end_time, duration_seconds, total_volume_kg)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'legacy-recorded-completed-1',
      'Legacy Recorded Workout',
      '2026-09-06T09:00:00.000Z',
      '2026-09-06T10:00:00.000Z',
      3600,
      600
    );
    rawDriver.close();

    const driver = new NodeSqliteDriver(tempFile);
    try {
      const store = createNativeStore(driver);
      await store.init();

      const history = await store.getWorkoutHistory();
      assert.equal(history.length, 1);
      assert.equal(history[0].id, 'legacy-recorded-completed-1');

      const columns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workouts);');
      assert.ok(columns.some(column => column.name === 'in_progress'));
      const migration = await driver.getFirstAsync<{ version: number }>(
        'SELECT version FROM schema_migrations WHERE version = 4'
      );
      assert.ok(migration);
    } finally {
      driver.close();
      fs.unlinkSync(tempFile);
    }
  });

  it('preserves exercise-level target reps in native workout details', async () => {
    const tempFile = path.join(os.tmpdir(), `test-native-target-reps-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    const store = createNativeStore(driver);
    await store.init();

    const exercise = await store.getExerciseById('Barbell_Bench_Press_-_Medium_Grip');
    if (!exercise) throw new Error('Seed exercise missing from native store');

    const workout: Workout = {
      id: 'native-target-reps-workout',
      name: 'Target Reps Test',
      gymId: 'gym-default',
      startTime: '2026-09-08T09:00:00.000Z',
      endTime: '2026-09-08T10:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 800,
      exercises: [{
        id: 'native-target-reps-exercise',
        exerciseId: exercise.id,
        exercise,
        targetReps: '8-12',
        restTimerSeconds: 0,
        sets: [{
          id: 'native-target-reps-set',
          setNumber: 1,
          type: 'normal',
          weightKg: 80,
          reps: 10,
          isCompleted: true,
        }],
      }],
    };

    await store.saveCompletedWorkout(workout);
    const detail = await store.getWorkoutDetail(workout.id);
    assert.ok(detail);
    assert.equal(detail.exercises[0].targetReps, '8-12');

    driver.close();
    fs.unlinkSync(tempFile);
  });

  it('preserves commas in native history exercise names', async () => {
    const tempFile = path.join(os.tmpdir(), `test-native-history-commas-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);

    try {
      const store = createNativeStore(driver);
      await store.init();

      const commaExercises = (await store.getAllExercises())
        .filter(exercise => exercise.name.includes(','))
        .slice(0, 2);
      assert.equal(commaExercises.length, 2, 'Seed data must include comma-containing exercise names');

      const workout: Workout = {
        id: 'native-history-commas-workout',
        name: 'Comma Names Test',
        gymId: 'gym-default',
        startTime: '2026-09-08T11:00:00.000Z',
        endTime: '2026-09-08T12:00:00.000Z',
        durationSeconds: 3600,
        totalVolumeKg: 200,
        exercises: commaExercises.map((exercise, index) => ({
          id: `native-history-commas-exercise-${index}`,
          exerciseId: exercise.id,
          exercise,
          restTimerSeconds: 0,
          sets: [{
            id: `native-history-commas-set-${index}`,
            setNumber: 1,
            type: 'normal',
            weightKg: 10,
            reps: 10,
            isCompleted: true,
          }],
        })),
      };

      await store.saveCompletedWorkout(workout);
      const history = await store.getWorkoutHistory();

      assert.deepEqual(history[0].exerciseNames, commaExercises.map(exercise => exercise.name));
    } finally {
      driver.close();
      fs.unlinkSync(tempFile);
    }
  });

  it('updates an existing native history workout when saving edits under the same ID', async () => {
    const tempFile = path.join(os.tmpdir(), `test-native-history-edit-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);

    try {
      const store = createNativeStore(driver);
      await store.init();
      const exercise = await store.getExerciseById('Barbell_Bench_Press_-_Medium_Grip');
      if (!exercise) throw new Error('Seed exercise missing from native store');

      const workout: Workout = {
        id: 'native-history-edit-workout',
        name: 'Editable Workout',
        gymId: 'gym-default',
        startTime: '2026-09-08T13:00:00.000Z',
        endTime: '2026-09-08T14:00:00.000Z',
        durationSeconds: 3600,
        totalVolumeKg: 100,
        exercises: [{
          id: 'native-history-edit-exercise',
          exerciseId: exercise.id,
          exercise,
          restTimerSeconds: 0,
          sets: [{
            id: 'native-history-edit-set',
            setNumber: 1,
            type: 'normal',
            weightKg: 10,
            reps: 10,
            isCompleted: true,
          }],
        }],
      };

      await store.saveCompletedWorkout(workout);
      await store.saveCompletedWorkout({
        ...workout,
        name: 'Corrected Workout',
        totalVolumeKg: 200,
        exercises: [{
          ...workout.exercises[0],
          sets: [{ ...workout.exercises[0].sets[0], weightKg: 20 }],
        }],
      });

      const history = await store.getWorkoutHistory();
      assert.equal(history.length, 1);
      assert.equal(history[0].id, workout.id);
      assert.equal(history[0].name, 'Corrected Workout');
      assert.equal(history[0].totalVolumeKg, 200);

      const detail = await store.getWorkoutDetail(workout.id);
      assert.ok(detail);
      assert.equal(detail.exercises[0].sets[0].weightKg, 20);
    } finally {
      driver.close();
      fs.unlinkSync(tempFile);
    }
  });

  it('creates distinct custom exercise IDs even when the clock does not advance', async () => {
    const tempFile = path.join(os.tmpdir(), `test-custom-id-collision-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    const store = createNativeStore(driver);
    await store.init();

    const originalNow = Date.now;
    Date.now = () => 1700000000000;
    try {
      const first = await store.createCustomExercise({
        name: 'Custom One',
        category: 'Test',
        equipment: 'None',
        primaryMuscles: ['Test'],
      });
      const second = await store.createCustomExercise({
        name: 'Custom Two',
        category: 'Test',
        equipment: 'None',
        primaryMuscles: ['Test'],
      });

      assert.notEqual(first.id, second.id);
      assert.ok(await store.getExerciseById(first.id));
      assert.ok(await store.getExerciseById(second.id));
    } finally {
      Date.now = originalNow;
      driver.close();
      fs.unlinkSync(tempFile);
    }
  });

  it('recovers write queue after a failed write and executes subsequent writes', async () => {
    const tempFile = path.join(os.tmpdir(), `test-queue-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    const store = createNativeStore(driver);
    await store.init();

    // Cause a write failure (violating foreign key constraint)
    await assert.rejects(async () => {
      await store.saveRoutine('Broken Routine', 'Folder', [
        { exerciseId: 'non-existent-exercise-id', targetSets: 3, targetReps: '10', restTimerSeconds: 60 },
      ]);
    });

    // Verify write queue is NOT stalled and subsequent write succeeds
    const routineId = await store.saveRoutine('Valid Routine', 'Folder', []);
    assert.ok(routineId);

    const routine = await store.getRoutineById(routineId);
    assert.ok(routine);
    assert.equal(routine.name, 'Valid Routine');

    driver.close();
    fs.unlinkSync(tempFile);
  });

  it('preserves routine createdAt and lastPerformedAt when editing routines', async () => {
    const tempFile = path.join(os.tmpdir(), `test-routine-meta-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    const store = createNativeStore(driver);
    await store.init();

    const routineId = await store.saveRoutine('Original Name', 'Old Folder', [], 'Note 1');
    const original = await store.getRoutineById(routineId);
    assert.ok(original);
    const originalCreatedAt = original.createdAt;

    // Simulate routine being performed
    await driver.runAsync('UPDATE routines SET last_performed_at = ? WHERE id = ?', '2026-09-07T12:00:00.000Z', routineId);

    // Edit routine
    await store.saveRoutine('Updated Name', 'New Folder', [], 'Note 2', routineId);

    const updated = await store.getRoutineById(routineId);
    assert.ok(updated);
    assert.equal(updated.name, 'Updated Name');
    assert.equal(updated.folderName, 'New Folder');
    assert.equal(updated.notes, 'Note 2');
    assert.equal(updated.createdAt, originalCreatedAt, 'createdAt must not be overwritten when editing');
    assert.equal(updated.lastPerformedAt, '2026-09-07T12:00:00.000Z', 'lastPerformedAt must not be wiped when editing');

    driver.close();
    fs.unlinkSync(tempFile);
  });

  it('rejects saving a routine with malformed targetReps', async () => {
    const tempFile = path.join(os.tmpdir(), `test-routine-bad-reps-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    const store = createNativeStore(driver);
    await store.init();

    await assert.rejects(async () => {
      await store.saveRoutine('Bad Reps Routine', 'Folder', [
        { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', targetSets: 3, targetReps: '7&x-9', restTimerSeconds: 60 },
      ]);
    }, /Invalid target reps/);

    driver.close();
    fs.unlinkSync(tempFile);
  });

  it('updates custom exercises and preserves draft consistency', async () => {
    const tempFile = path.join(os.tmpdir(), `test-custom-edit-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    const store = createNativeStore(driver);
    await store.init();

    // 1. Create custom exercise
    const created = await store.createCustomExercise({
      name: 'Old Custom Press',
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
    });

    assert.equal(created.name, 'Old Custom Press');
    assert.equal(created.isCustom, true);

    // 2. Save a draft that uses this exercise
    const defaultGym = await store.getDefaultGym();
    await store.saveDraft({
      version: 1,
      savedAt: new Date().toISOString(),
      revision: 1,
      restTimer: null,
      workout: {
        id: 'draft-test-edit',
        name: 'In-progress workout',
        gymId: defaultGym.id,
        startTime: new Date().toISOString(),
        durationSeconds: 60,
        totalVolumeKg: 100,
        exercises: [
          {
            id: 'we-draft-edit-1',
            exerciseId: created.id,
            exercise: created,
            sets: [],
            restTimerSeconds: 60,
          },
        ],
      },
    });

    // 3. Edit custom exercise
    const updated = await store.updateCustomExercise(created.id, {
      name: 'Updated Machine Press',
      equipment: 'machine',
      primaryMuscles: ['chest', 'triceps'],
    });

    assert.equal(updated.id, created.id);
    assert.equal(updated.name, 'Updated Machine Press');
    assert.equal(updated.equipment, 'machine');
    assert.deepEqual(updated.primaryMuscles, ['chest', 'triceps']);

    // Verify persistence via getExerciseById
    const fetched = await store.getExerciseById(created.id);
    assert.ok(fetched);
    assert.equal(fetched.name, 'Updated Machine Press');
    assert.equal(fetched.equipment, 'machine');

    // Verify search finds new name
    const searchResults = await store.searchExercises('Updated Machine');
    assert.ok(searchResults.some(e => e.id === created.id && e.name === 'Updated Machine Press'));

    // Verify draft embedded exercise was updated
    const drafts = await store.getWorkoutDrafts();
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].workout.exercises[0].exercise.name, 'Updated Machine Press');

    // 4. Reject editing built-in exercise
    await assert.rejects(async () => {
      await store.updateCustomExercise('Barbell_Bench_Press_-_Medium_Grip', {
        name: 'Hacked Bench Press',
      });
    }, /Cannot edit built-in exercise/);

    // 5. Reject empty exercise name
    await assert.rejects(async () => {
      await store.updateCustomExercise(created.id, {
        name: '   ',
      });
    }, /Exercise name cannot be empty/);

    driver.close();
    fs.unlinkSync(tempFile);
  });

  it('persists supersetId across routine creation, retrieval, and duplication', async () => {
    const tempFile = path.join(os.tmpdir(), `test-routine-supersets-${Date.now()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    const store = createNativeStore(driver);
    await store.init();

    const supersetGroupId = 'ss-bench-curl-group';
    const routineId = await store.saveRoutine(
      'Superset Arms & Chest',
      'Hypertrophy',
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
      'Test superset routine'
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

    driver.close();
    fs.unlinkSync(tempFile);
  });
});
