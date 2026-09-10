import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NodeSqliteDriver } from '../helpers/storeFixture';
import { createNativeStore } from '../../src/database/nativeStore';
import { applyMigrations } from '../../src/database/migrations';
import { Workout } from '../../src/types';
import { createStoreFixture } from '../helpers/storeFixture';

describe('nativeStore and migration safety', () => {
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
      await store.saveDraft({ version: 1, workout: { ...workout, id: 'gym-reassignment-draft' }, savedAt: workout.startTime, revision: 1, restTimer: null });
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

  it('rejects deletion when the default gym is the only gym', async () => {
    const fixture = await createStoreFixture('native');
    try {
      await assert.rejects(() => fixture.store.deleteGym('gym-default', 'replacement'), /at least two/);
    } finally {
      await fixture.dispose();
    }
  });

  it('rejects deleting the gym supplied as the active workout gym at the store boundary', async () => {
    const fixture = await createStoreFixture('native');
    try {
      const replacement = await fixture.store.createGym('Replacement');
      await assert.rejects(
        () => fixture.store.deleteGym('gym-default', replacement.id, 'gym-default'),
        /active workout/i,
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
});
