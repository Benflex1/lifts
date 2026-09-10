# Multi-Gym Tracking & Machine Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first gym profiles, machine/cable history isolation, labeled cross-gym suggestions, dual-tier exercise records, and backward-compatible backup support without changing routine portability or logged weights.

**Architecture:** Keep `Workout.gymId` as the canonical location assignment for completed workouts and paused drafts. Add shared pure scope, suggestion, and record algorithms so SQLite and IndexedDB differ only in loading and persisting data. Expose gym operations through the existing `Store` contract, then connect them to a small reusable picker, gym-management modal, active-workout context, history filters, and exercise scope controls.

**Tech Stack:** React Native + Expo SDK 57, TypeScript, Expo SQLite/SQLite migrations, IndexedDB/fake-indexeddb integration fixtures, Node’s built-in test runner, existing dialog and storage contexts.

**Spec:** `docs/superpowers/specs/2026-09-10-multi-gym-tracking-design.md`

## Global Constraints

- Native schema changes use migration **5** because migrations 1–4 already exist.
- IndexedDB opens at version **2** and preserves every version-1 object store and record.
- Native drafts remain serialized in `workout_drafts.data`; do not add a duplicate `workout_drafts.gym_id` column.
- New sessions always receive a valid gym ID; legacy missing IDs normalize to `gym-default`.
- The seeded default gym is `gym-default` / `Default Gym` / `#3B82F6`.
- Only normalized equipment values `machine` and `cable` are gym-specific by default; all other current dataset values are global by default.
- Gym tracking never converts logged weights for pulley ratios or machine leverage; it isolates and labels raw values.
- Routines stay gym-agnostic and are not assigned a gym.
- Settings, import, deletion, and conflict flows use the existing cross-platform dialog contract; do not add `Alert.alert`, `window.confirm`, or browser prompts.
- Existing v2 backups remain importable; new exports use Backup Schema v3.
- Drafts never contribute to exercise records, PRs, charts, or history counts.
- Preserve the current write queue on native and single-writer lease checks on web.

---

### Task 1: Add canonical gym types and scope policy

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/database/contract.ts`
- Create: `src/workout/gym-scope.ts`
- Create: `src/workout/gym-profile.ts`
- Create: `tests/unit/gym-scope.test.ts`
- Create: `tests/unit/gym-profile.test.ts`
- Modify: `src/context/WorkoutContext.tsx` (temporary `gym-default` compatibility on the new-workout literal; Task 7 makes it dynamic)
- Modify: `src/database/migrations.ts` (add `gym-default` to the legacy migration-created draft payload)
- Modify: `tests/unit/analytics.test.ts`
- Modify: `tests/unit/session.test.ts`
- Modify: `tests/unit/workout-edit.test.ts`
- Modify: `tests/integration/backup-roundtrip.test.ts`
- Modify: `tests/integration/completion-lifecycle.test.ts`
- Modify: `tests/integration/draft-lifecycle.test.ts`
- Modify: `tests/integration/history-stats.test.ts`
- Modify: `tests/integration/native-store.test.ts`
- Modify: `tests/integration/web-store.test.ts`

**Interfaces:**
- Consumes: existing `Exercise`, `Workout`, `WorkoutSet`, `DataSnapshot`, and `Store` types.
- Produces: `Gym`, `ExerciseScopeType`, `ExerciseGymScope`, `PreviousSetSuggestion`, `ExerciseStats`, `DualExerciseStats`, canonical `gymId` fields, profile validation, and the scope-policy functions consumed by later tasks.

- [ ] **Step 1: Write the failing policy tests.**

```ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Exercise } from '../../src/types';
import {
  defaultScopeForEquipment,
  resolveExerciseScope,
  getAllowedGymIds,
  validateExerciseGymScope,
} from '../../src/workout/gym-scope';

const exercise = (equipment: string): Exercise => ({
  id: `exercise-${equipment}`,
  name: equipment,
  category: 'strength',
  equipment,
  primaryMuscles: ['back'],
});

describe('multi-gym scope policy', () => {
  it('isolates machine and cable equipment by default', () => {
    assert.equal(defaultScopeForEquipment('machine'), 'gym_specific');
    assert.equal(defaultScopeForEquipment(' Cable '), 'gym_specific');
    assert.equal(defaultScopeForEquipment('barbell'), 'global');
    assert.equal(defaultScopeForEquipment('e-z curl bar'), 'global');
  });

  it('lets an explicit override replace the equipment default', () => {
    assert.equal(
      resolveExerciseScope(exercise('machine'), { exerciseId: 'exercise-machine', scopeType: 'global' }),
      'global'
    );
  });

  it('returns all gyms for global exercises and the current/linked gyms otherwise', () => {
    assert.equal(getAllowedGymIds(exercise('barbell'), undefined, 'gym-a'), null);
    assert.deepEqual(
      getAllowedGymIds(
        exercise('machine'),
        { exerciseId: 'exercise-machine', scopeType: 'linked_group', linkedGymIds: ['gym-a', 'gym-b'] },
        'gym-default'
      ),
      new Set(['gym-a', 'gym-b'])
    );
  });

  it('rejects linked scopes with missing, duplicate, or fewer-than-two gym IDs', () => {
    const known = new Set(['gym-a', 'gym-b']);
    assert.throws(() => validateExerciseGymScope(
      { exerciseId: 'exercise-machine', scopeType: 'linked_group', linkedGymIds: ['gym-a'] },
      known
    ), /at least two/);
    assert.throws(() => validateExerciseGymScope(
      { exerciseId: 'exercise-machine', scopeType: 'linked_group', linkedGymIds: ['gym-a', 'gym-a'] },
      known
    ), /duplicate/);
    assert.throws(() => validateExerciseGymScope(
      { exerciseId: 'exercise-machine', scopeType: 'linked_group', linkedGymIds: ['gym-a', 'gym-c'] },
      known
    ), /unknown gym/);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the red failure.**

Run: `npx tsx --test tests/unit/gym-scope.test.ts`

Expected: FAIL because the new types and `src/workout/gym-scope.ts` exports do not exist.

- [ ] **Step 3: Add the canonical types and contract signatures.**

In `src/types/index.ts`, add the following types and make `Workout.gymId` and `WorkoutHistorySummary.gymId` required canonical fields. Add `previousGymId` and `previousGymName` to `WorkoutSet` as optional suggestion metadata:

```ts
export interface Gym {
  id: string;
  name: string;
  isDefault: boolean;
  color: string;
  createdAt: string;
}

export type ExerciseScopeType = 'global' | 'gym_specific' | 'linked_group';

export interface ExerciseGymScope {
  exerciseId: string;
  scopeType: ExerciseScopeType;
  linkedGymIds?: string[];
}

export interface PreviousSetSuggestion {
  weightKg: number;
  reps: number;
  sourceGymId?: string;
  sourceGymName?: string;
}

export interface ExerciseStats {
  maxWeightKg: number;
  maxSetVolumeKg: number;
  maxReps: number;
  estimated1RM: number;
  sessionCount: number;
}

export interface DualExerciseStats {
  global: ExerciseStats;
  gym: ExerciseStats;
}
```

Extend `DataSnapshot` with required `gyms: Gym[]` and `exerciseGymScopes: ExerciseGymScope[]`. Add these exact methods to `Store`:

```ts
getGyms(): Promise<Gym[]>;
getDefaultGym(): Promise<Gym>;
createGym(name: string, color?: string): Promise<Gym>;
updateGym(id: string, updates: { name?: string; color?: string }): Promise<Gym>;
setDefaultGym(id: string): Promise<void>;
deleteGym(id: string, replacementGymId: string): Promise<void>;
getExerciseGymScopes(): Promise<ExerciseGymScope[]>;
getExerciseGymScope(exerciseId: string): Promise<ExerciseGymScope | null>;
saveExerciseGymScope(scope: ExerciseGymScope): Promise<void>;
deleteExerciseGymScope(exerciseId: string): Promise<void>;
getPreviousSetsForExercise(
  exerciseId: string,
  occurrenceIndex?: number,
  currentGymId?: string
): Promise<PreviousSetSuggestion[]>;
getExerciseStats(exerciseId: string, currentGymId: string): Promise<DualExerciseStats>;
```

In the listed test files, add `gymId: 'gym-default'` to every `Workout` and `WorkoutDraft.workout` fixture, and add `gyms: [{ id: 'gym-default', name: 'Default Gym', isDefault: true, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }]` plus `exerciseGymScopes: []` to every `DataSnapshot` literal. Extend the `tests/unit/session.test.ts` Store stub with no-op/default implementations of the new gym and scope methods, returning the same canonical default data.

- [ ] **Step 4: Implement `src/workout/gym-scope.ts`.**

Use a normalized, exact equipment set:

```ts
const GYM_SPECIFIC_EQUIPMENT = new Set(['machine', 'cable']);

export function defaultScopeForEquipment(equipment: string): ExerciseScopeType {
  return GYM_SPECIFIC_EQUIPMENT.has(equipment.trim().toLowerCase())
    ? 'gym_specific'
    : 'global';
}
```

Implement `resolveExerciseScope`, `getAllowedGymIds`, and `validateExerciseGymScope`. `getAllowedGymIds` returns `null` for global exercises, a one-item set containing `currentGymId` for gym-specific exercises, and a copy of `linkedGymIds` for linked groups. Validation must reject unknown IDs, duplicates, fewer than two linked IDs, linked IDs on non-linked scopes, and an empty exercise ID.

- [ ] **Step 5: Implement shared gym-profile validation.**

Create `src/workout/gym-profile.ts` with these exact exports:

```ts
export const GYM_COLOR_PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'] as const;
export const DEFAULT_GYM_COLOR = '#3B82F6';
export function validateGymName(name: string): string;
export function validateGymColor(color: string): string;
export function validateGymDeletion(
  gymId: string,
  replacementGymId: string,
  gyms: readonly Gym[]
): void;
```

`validateGymName` returns the trimmed name and rejects non-string, empty, or more-than-80-Unicode-character values. `validateGymColor` accepts only `GYM_COLOR_PALETTE`. `validateGymDeletion` rejects an unknown gym, a missing/different replacement, or deletion when fewer than two gyms exist. Native and web stores call these functions instead of duplicating policy.

- [ ] **Step 6: Run the focused policy suites.**

Run: `npx tsx --test tests/unit/gym-scope.test.ts tests/unit/gym-profile.test.ts`

Expected: all scope and profile policy tests pass. The full repository typecheck is intentionally deferred until the Store contract implementations land in Tasks 3–4.

- [ ] **Step 7: Commit the contract and policy boundary.**

```bash
git add src/types/index.ts src/database/contract.ts src/workout/gym-scope.ts src/workout/gym-profile.ts src/context/WorkoutContext.tsx src/database/migrations.ts tests/unit/gym-scope.test.ts tests/unit/gym-profile.test.ts tests/unit/analytics.test.ts tests/unit/session.test.ts tests/unit/workout-edit.test.ts tests/integration/backup-roundtrip.test.ts tests/integration/completion-lifecycle.test.ts tests/integration/draft-lifecycle.test.ts tests/integration/history-stats.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts
git commit -m "feat: add multi-gym domain contracts"
```

---

### Task 2: Implement shared history suggestion and record algorithms

**Files:**
- Create: `src/workout/gym-history.ts`
- Create: `src/workout/gym-records.ts`
- Create: `tests/unit/gym-history.test.ts`
- Create: `tests/unit/gym-records.test.ts`

**Interfaces:**
- Consumes: `Exercise`, `Gym`, `ExerciseGymScope`, `ExerciseStats`, `DualExerciseStats`, and `PreviousSetSuggestion` from Task 1.
- Produces: `CompletedExerciseOccurrence`, `resolvePreviousSetsForExercise`, and `calculateDualExerciseStats` for both storage engines.

- [ ] **Step 1: Write the failing tests for local, linked, global, fallback, and dual-record behavior.**

```ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Exercise, ExerciseGymScope, Workout } from '../../src/types';
import {
  CompletedExerciseOccurrence,
  resolvePreviousSetsForExercise,
} from '../../src/workout/gym-history';
import { calculateDualExerciseStats } from '../../src/workout/gym-records';

const machine: Exercise = {
  id: 'lat-machine', name: 'Lat Machine', category: 'strength', equipment: 'machine', primaryMuscles: ['lats'],
};
const barbell: Exercise = {
  id: 'barbell-row', name: 'Barbell Row', category: 'strength', equipment: 'barbell', primaryMuscles: ['back'],
};
const occurrence = (
  workoutId: string,
  startTime: string,
  gymId: string,
  gymName: string,
  weightKg: number,
  reps: number
): CompletedExerciseOccurrence => ({
  workoutId,
  startTime,
  gymId,
  gymName,
  occurrenceIndex: 0,
  sets: [{ weightKg, reps }],
});

const completedWorkouts: Workout[] = [
  {
    id: 'w-a',
    name: 'Gym A session',
    gymId: 'gym-a',
    startTime: '2026-09-09T10:00:00.000Z',
    durationSeconds: 0,
    totalVolumeKg: 360,
    exercises: [{
      id: 'occ-a',
      exerciseId: machine.id,
      exercise: machine,
      restTimerSeconds: 90,
      sets: [{
        id: 'set-a',
        setNumber: 1,
        type: 'normal',
        weightKg: 45,
        reps: 8,
        isCompleted: true,
      }],
    }],
  },
  {
    id: 'w-b',
    name: 'Gym B session',
    gymId: 'gym-b',
    startTime: '2026-09-10T10:00:00.000Z',
    durationSeconds: 0,
    totalVolumeKg: 300,
    exercises: [{
      id: 'occ-b',
      exerciseId: machine.id,
      exercise: machine,
      restTimerSeconds: 90,
      sets: [{
        id: 'set-b',
        setNumber: 1,
        type: 'normal',
        weightKg: 30,
        reps: 10,
        isCompleted: true,
      }],
    }],
  },
];

describe('gym-aware previous-set resolution', () => {
  const history = [
    occurrence('w-b', '2026-09-10T10:00:00.000Z', 'gym-b', 'McFit', 35, 10),
    occurrence('w-a', '2026-09-09T10:00:00.000Z', 'gym-a', 'FitX', 45, 8),
  ];

  it('uses matching gym history for a machine', () => {
    const [suggestion] = resolvePreviousSetsForExercise(machine, history, 'gym-a');
    assert.equal(suggestion.weightKg, 45);
    assert.equal(suggestion.sourceGymName, undefined);
  });

  it('labels the latest foreign fallback when the current gym has no history', () => {
    const [suggestion] = resolvePreviousSetsForExercise(machine, history, 'gym-c');
    assert.equal(suggestion.weightKg, 35);
    assert.equal(suggestion.sourceGymId, 'gym-b');
    assert.equal(suggestion.sourceGymName, 'McFit');
  });

  it('uses all gyms without a source label for global equipment', () => {
    const [suggestion] = resolvePreviousSetsForExercise(barbell, history, 'gym-c');
    assert.equal(suggestion.weightKg, 35);
    assert.equal(suggestion.sourceGymName, undefined);
  });

  it('restricts linked groups to their allowed gyms before falling back', () => {
    const scope: ExerciseGymScope = {
      exerciseId: machine.id,
      scopeType: 'linked_group',
      linkedGymIds: ['gym-a', 'gym-b'],
    };
    const [suggestion] = resolvePreviousSetsForExercise(machine, history, 'gym-c', scope);
    assert.equal(suggestion.sourceGymName, undefined);
  });
});

describe('dual exercise records', () => {
  it('keeps global and current-gym machine records separate and excludes drafts', () => {
    const stats = calculateDualExerciseStats(completedWorkouts, machine.id, 'gym-a');
    assert.equal(stats.global.maxWeightKg, 45);
    assert.equal(stats.gym.maxWeightKg, 45);
    assert.equal(stats.global.sessionCount, 2);
    assert.equal(stats.gym.sessionCount, 1);
  });
});
```

Keep any draft fixture outside `completedWorkouts`; `calculateDualExerciseStats` accepts completed `Workout[]` only, so the test input cannot include drafts.

- [ ] **Step 2: Run both new suites to verify they fail.**

Run: `npx tsx --test tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts`

Expected: FAIL because the shared resolver and record calculator do not exist.

- [ ] **Step 3: Define ordered occurrence input and implement suggestion resolution.**

Use this exact occurrence shape:

```ts
export interface CompletedExerciseOccurrence {
  workoutId: string;
  startTime: string;
  gymId: string;
  gymName: string;
  occurrenceIndex: number;
  sets: Array<{ weightKg: number; reps: number }>;
}
```

Implement `resolvePreviousSetsForExercise(exercise, occurrences, currentGymId, scope?)` by:

1. Resolving the effective scope with `resolveExerciseScope`.
2. Selecting the first occurrence with completed sets whose gym is allowed; global allows every gym.
3. Falling back to `occurrences[0]` when no allowed occurrence exists for a non-global scope.
4. Mapping the selected sets to `PreviousSetSuggestion[]`, adding `sourceGymId/sourceGymName` only for a foreign fallback.

Assume callers provide occurrences sorted newest-first and sets sorted by `setNumber`; do not sort inside the pure function.

The exported signature is:

```ts
export function resolvePreviousSetsForExercise(
  exercise: Exercise,
  occurrences: CompletedExerciseOccurrence[],
  currentGymId: string,
  scope?: ExerciseGymScope
): PreviousSetSuggestion[];
```

- [ ] **Step 4: Implement dual-tier record aggregation.**

Implement the following exported function with these exact rules:

```ts
export function calculateDualExerciseStats(
  workouts: Workout[],
  exerciseId: string,
  currentGymId: string,
  scope?: ExerciseGymScope
): DualExerciseStats;
```

- Include only `set.isCompleted === true`.
- `global` scans every workout containing the exercise.
- `gym` scans only the current gym for `gym_specific`, the linked IDs for `linked_group`, or every gym for `global` exercises.
- `maxSetVolumeKg` is `weightKg * reps` for one completed set.
- `estimated1RM` uses the existing `calculate1RM(weightKg, reps).average` helper.
- `sessionCount` counts each workout once, even when the exercise occurs more than once.

Return zero-filled records when no completed set matches.

- [ ] **Step 5: Run the green unit suites and existing unit suite.**

Run: `npx tsx --test tests/unit/gym-scope.test.ts tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts tests/unit/workout-sets.test.ts tests/unit/analytics.test.ts`

Expected: all focused tests pass with no regressions.

- [ ] **Step 6: Commit the shared algorithms.**

```bash
git add src/workout/gym-history.ts src/workout/gym-records.ts tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts
git commit -m "feat: add gym-aware history and record algorithms"
```

---

### Task 3: Add native SQLite migration 5 and gym persistence

**Files:**
- Modify: `src/database/migrations.ts`
- Modify: `src/database/nativeStore.ts`
- Modify: `src/database/db.native.ts`
- Modify: `tests/integration/native-store.test.ts`

**Interfaces:**
- Consumes: Task 1 `Gym`, `ExerciseGymScope`, and `Store` signatures.
- Produces: native schema version 5, default gym bootstrapping, atomic gym/scope CRUD, and canonical native snapshots for Tasks 5–6.

- [ ] **Step 1: Write migration and CRUD tests before implementation.**

Add a native integration test that applies migrations through version 4, inserts a completed workout and a serialized draft without gym IDs, then runs `store.init()` and asserts:

```ts
const gyms = await store.getGyms();
assert.deepEqual(gyms, [{
  id: 'gym-default',
  name: 'Default Gym',
  isDefault: true,
  color: '#3B82F6',
  createdAt: gyms[0].createdAt,
}]);

const columns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)');
assert.ok(columns.some(column => column.name === 'gym_id'));
assert.equal((await store.getWorkoutDetail('legacy-workout'))?.gymId, 'gym-default');
assert.equal((await store.getWorkoutDrafts())[0].workout.gymId, 'gym-default');
```

Add tests for:

- migration 5 idempotence on a second reopen;
- `failAtVersion: 5` rolling back the new table, column, backfill, and migration marker;
- creating two gyms, setting one default, renaming/color update, and deleting one with atomic reassignment;
- rejecting deletion of the last gym, deleting without a different replacement, and invalid names;
- saving/reading scope overrides and removing them;
- `readSnapshot()` returning gyms and scopes.

- [ ] **Step 2: Run the new native tests and verify the red failure.**

Run: `npx tsx --test tests/integration/native-store.test.ts`

Expected: FAIL with missing migration/table/store-method errors.

- [ ] **Step 3: Implement migration 5 transactionally.**

Append migration 5 after the existing migration 4 in `src/database/migrations.ts`. Within one `withTransactionAsync` callback:

```sql
CREATE TABLE IF NOT EXISTS gyms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS gyms_one_default
  ON gyms(is_default) WHERE is_default = 1;
CREATE TABLE IF NOT EXISTS exercise_gym_scopes (
  exercise_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('global', 'gym_specific', 'linked_group')),
  linked_gym_ids TEXT,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
```

Then insert `gym-default`, inspect `PRAGMA table_info(workouts)`, add `gym_id TEXT REFERENCES gyms(id)` only if absent, backfill `NULL` workout IDs, and parse/update valid `workout_drafts.data` payloads that lack `workout.gymId`. Insert the version-5 marker only after all work succeeds. Preserve the existing `failAtVersion` rollback hook pattern.

- [ ] **Step 4: Implement native row mappers and gym CRUD.**

Add private native helpers for `mapGymRow`, `mapScopeRow`, and `normalizeDraftPayload`. Implement each write through `writeQueue`; multi-record operations use one transaction:

- `getGyms()` orders default first, then name.
- `getDefaultGym()` returns the single default or throws `Default gym is missing`.
- `createGym()` uses `validateGymName`/`validateGymColor`, assigns `createScopedId('gym')`, uses the supplied palette color or `#3B82F6`, and starts non-default.
- `updateGym()` validates only supplied fields with the shared profile helpers and returns the updated row.
- `setDefaultGym()` verifies the target exists, clears all default flags, then sets the target inside one transaction.
- `deleteGym()` calls `validateGymDeletion`, updates `workouts.gym_id`, normalizes every affected draft JSON payload, updates/removes linked scopes, changes default flags when needed, then deletes the gym inside one transaction.
- Scope writes verify that the exercise exists, call `validateExerciseGymScope` against current gym IDs, and serialize linked IDs as JSON.

Update `finishWorkout`, `getWorkoutHistory`, `getWorkoutDetail`, `saveDraft`, and native `mergeSnapshot` to write/read `workouts.gym_id` and canonical draft `workout.gymId`.

- [ ] **Step 5: Add native database wrappers.**

Add `getGyms`, `getDefaultGym`, `createGym`, `updateGym`, `setDefaultGym`, `deleteGym`, `getExerciseGymScopes`, `getExerciseGymScope`, `saveExerciseGymScope`, and `deleteExerciseGymScope` to `src/database/db.native.ts`, preserving the existing `getStore()` delegation pattern. Leave the previous-set/stat wrapper signature changes to Task 6. Keep the optional `currentGymId` default behavior by resolving the default gym in the store when callers omit it.

- [ ] **Step 6: Run native tests and typecheck.**

Run: `npx tsx --test tests/integration/native-store.test.ts && npx tsc --noEmit`

Expected: native migration, CRUD, rollback, and existing native-store tests pass.

- [ ] **Step 7: Commit the native persistence slice.**

```bash
git add src/database/migrations.ts src/database/nativeStore.ts src/database/db.native.ts tests/integration/native-store.test.ts
git commit -m "feat: persist multi-gym data in sqlite"
```

---

### Task 4: Add IndexedDB version 2 and web gym persistence

**Files:**
- Modify: `src/database/webStore.ts`
- Modify: `src/database/db.web.ts`
- Modify: `tests/integration/web-store.test.ts`

**Interfaces:**
- Consumes: Task 1 store contract and Task 3’s persistence semantics.
- Produces: IndexedDB v1→v2 upgrade, web gym/scope CRUD, and web snapshot parity.

- [ ] **Step 1: Write the legacy-upgrade and web CRUD tests.**

Create a fake IndexedDB version-1 database manually with the existing stores and records missing `gymId`. Then create a `WebStore` for the same name and call `init()`.

```ts
const legacy = await openLegacyVersionOneDatabase(dbName);
legacy.close();

const store = await createWebStore(dbName, { idbFactory: indexedDB });
await store.init();

assert.ok(store.getGyms);
assert.equal((await store.getWorkoutDetail('legacy-workout'))?.gymId, 'gym-default');
assert.equal((await store.getWorkoutDrafts())[0].workout.gymId, 'gym-default');
```

Add tests for gym CRUD, default invariants, deleting/reassigning workouts and drafts, scope CRUD, and `readSnapshot()`/`mergeSnapshot()` preserving the new arrays. Keep existing lease/read-only tests unchanged and assert new writes fail in read-only mode.

- [ ] **Step 2: Run the new web tests and verify the red failure.**

Run: `npx tsx --test tests/integration/web-store.test.ts`

Expected: FAIL because `openDb()` still requests version 1 and the new object stores/methods are absent.

- [ ] **Step 3: Upgrade IndexedDB to version 2.**

Change `idb.open(name, 1)` to `idb.open(name, 2)`. In `onupgradeneeded`, retain all existing object-store creation and add `gyms` keyed by `id` and `exercise_gym_scopes` keyed by `exerciseId`. Insert the canonical default gym during the upgrade so a read-only tab can see it immediately after a v1→v2 upgrade.

In writer initialization, run one read/write transaction over `gyms`, `workouts`, and `workout_drafts` to assign `gym-default` to records that lack `gymId`. Do not rewrite existing non-empty IDs. All workout and draft read mappers also treat a missing ID as `gym-default` in memory so a read-only tab can display legacy records safely.

- [ ] **Step 4: Implement web gym and scope operations with lease protection.**

Use `verifyAndRenewLease()` before every write. Scope writes verify that the exercise exists and call the shared scope validator. For `deleteGym`, use one transaction over `gyms`, `workouts`, `workout_drafts`, and `exercise_gym_scopes`; update object payloads before deleting the gym. Enforce the same name, replacement, default, and linked-scope rules as native. Update `finishWorkout`, history/detail mapping, drafts, snapshots, and merge transactions to include gym data.

- [ ] **Step 5: Add web database wrappers and run parity tests.**

Add the same ten gym/profile/scope wrappers to `src/database/db.web.ts`. Run:

```bash
npx tsx --test tests/integration/web-store.test.ts tests/integration/native-store.test.ts
npx tsc --noEmit
```

Expected: both storage engines pass their suites and the project typechecks.

- [ ] **Step 6: Commit the web persistence slice.**

```bash
git add src/database/webStore.ts src/database/db.web.ts tests/integration/web-store.test.ts
git commit -m "feat: upgrade web storage for multi-gym data"
```

---

### Task 5: Upgrade snapshots and backups to Schema v3

**Files:**
- Modify: `src/utils/backup.ts`
- Modify: `src/utils/export.ts`
- Modify: `src/utils/restore.ts`
- Create: `src/utils/gym-restore.ts`
- Modify: `src/database/nativeStore.ts`
- Modify: `src/database/webStore.ts`
- Modify: `src/screens/AnalyticsScreen.tsx`
- Modify: `tests/unit/backup-validation.test.ts`
- Modify: `tests/integration/backup-roundtrip.test.ts`
- Create: `tests/unit/gym-restore.test.ts`

**Interfaces:**
- Consumes: canonical `DataSnapshot`, gym CRUD, scope validation, and storage merge operations from Tasks 1, 3, and 4.
- Produces: `BackupV3`, normalized v2 parsing, non-destructive gym ID mapping, gym/scope restore preview counts, and complete native↔web round trips.

- [ ] **Step 1: Write failing v2/v3 validation and collision tests.**

Add tests that assert:

```ts
const normalized = parseBackup(JSON.stringify({
  version: 2,
  exportedAt: '2026-09-10T00:00:00.000Z',
  workouts: [legacyWorkoutWithoutGymId],
  routines: [], exercises: [], drafts: [], settings: {},
}));
assert.equal(normalized.version, 3);
assert.deepEqual(normalized.gyms.map(gym => gym.id), ['gym-default']);
assert.equal(normalized.workouts[0].gymId, 'gym-default');
```

Add tests for invalid gym IDs, duplicate gym IDs, invalid colors/names, malformed linked IDs, v3 scope conflicts, and a source gym whose ID collides with a different destination gym. The collision test must assert a remapped ID is used by every imported workout, draft, and linked scope.

- [ ] **Step 2: Run backup tests and verify the red failure.**

Run: `npx tsx --test tests/unit/backup-validation.test.ts tests/unit/gym-restore.test.ts tests/integration/backup-roundtrip.test.ts`

Expected: FAIL because the parser only accepts version 2 and snapshots lack gym arrays.

- [ ] **Step 3: Define `BackupV3` and normalize v2 input.**

In `src/utils/backup.ts`, add:

```ts
export interface BackupV3 extends DataSnapshot {
  version: 3;
  exportedAt: string;
}

export interface BackupV2 {
  version: 2;
  exportedAt: string;
  workouts: Workout[];
  routines: Routine[];
  exercises: Exercise[];
  drafts: WorkoutDraft[];
  settings: Record<string, string>;
}
```

Keep the legacy `BackupV2` interface separate from `DataSnapshot` because v2 has no gym arrays. Make `parseBackup(json)` return `BackupV3`. Accept versions 2 and 3; for v2, synthesize `gym-default`, assign it to every workout and draft before structural validation, and validate the normalized gym/scope references. For v3, require `gyms` and `exerciseGymScopes` arrays, validate all references, and preserve all existing exercise/routine/workout/set validation. Change `buildBackupJson()` to export version 3 with `gyms` and `exerciseGymScopes`.

Rename the internal alias in `src/utils/export.ts` from `buildV2BackupJson` to `buildV3BackupJson`; keep the existing public `buildBackupJson()` and `exportBackup()` entry points unchanged.

- [ ] **Step 4: Implement deterministic non-destructive gym mapping in restore.**

Create `src/utils/gym-restore.ts` with a focused helper that returns:

```ts
export interface GymRestoreMapping {
  gymsToInsert: Gym[];
  idMap: Map<string, string>;
}

export function buildGymRestoreMapping(
  sourceGyms: Gym[],
  destinationGyms: Gym[]
): GymRestoreMapping;

export function remapGymReferences(
  snapshot: DataSnapshot,
  idMap: Map<string, string>
): DataSnapshot;
```

Apply these rules in order: map the source default gym and reserved `gym-default` to the destination default; reuse identical non-default IDs; generate a non-default `gym-import-${createScopedId('restore')}` for differing collisions; never import a second default; remap workout/draft `gymId` and linked scope IDs; abort on conflicting exercise scopes. Include mapped gyms/scopes in `snapshotToMerge` and preview counts without changing the existing setting conflict rule.

- [ ] **Step 5: Update restore planning, preview, and native/web snapshot merges.**

Update `RestorePreview` in `src/utils/restore.ts` with `gymsCount` and `scopeOverridesCount`, compare `gymId` in identical-workout checks, and include mapped gym/scope counts in `snapshotToMerge`. Update the restore summary in `src/screens/AnalyticsScreen.tsx` to display those counts. Merge gyms first, then scope overrides, exercises, routines, workouts, drafts, and settings. Verify every imported workout/draft gym exists before insertion. Preserve the current atomic native transaction and web transaction/lease behavior. `readSnapshot()` must include all gyms and scopes in both engines.

- [ ] **Step 6: Run round-trip, conflict, and full backup tests.**

Run:

```bash
npx tsx --test tests/unit/backup-validation.test.ts tests/unit/gym-restore.test.ts tests/integration/backup-roundtrip.test.ts
```

Expected: v2 imports normalize, v3 native↔web round trips preserve gyms/scopes, collisions remap safely, and conflicting data changes nothing.

- [ ] **Step 7: Commit backup compatibility.**

```bash
git add src/utils/backup.ts src/utils/export.ts src/utils/restore.ts src/utils/gym-restore.ts src/database/nativeStore.ts src/database/webStore.ts src/screens/AnalyticsScreen.tsx tests/unit/backup-validation.test.ts tests/unit/gym-restore.test.ts tests/integration/backup-roundtrip.test.ts
git commit -m "feat: add multi-gym backup schema v3"
```

---

### Task 6: Make workout history and ghost suggestions gym-aware

**Files:**
- Modify: `src/database/nativeStore.ts`
- Modify: `src/database/webStore.ts`
- Modify: `src/database/db.native.ts`
- Modify: `src/database/db.web.ts`
- Modify: `tests/integration/history-stats.test.ts`
- Modify: `tests/integration/native-store.test.ts`
- Modify: `tests/integration/web-store.test.ts`

**Interfaces:**
- Consumes: `resolvePreviousSetsForExercise`, `calculateDualExerciseStats`, and the canonical storage fields.
- Produces: native/web-parity `getPreviousSetsForExercise(exerciseId, occurrenceIndex, currentGymId)` and `getExerciseStats(exerciseId, currentGymId)` behavior.

- [ ] **Step 1: Add failing native/web behavior tests.**

For each platform, save completed machine workouts at `gym-a` and `gym-b`, a global barbell workout at `gym-b`, and a draft. Assert:

```ts
const local = await store.getPreviousSetsForExercise('machine-id', 0, 'gym-a');
assert.equal(local[0].weightKg, 45);
assert.equal(local[0].sourceGymName, undefined);

const foreign = await store.getPreviousSetsForExercise('machine-id', 0, 'gym-c');
assert.equal(foreign[0].weightKg, 35);
assert.equal(foreign[0].sourceGymName, 'McFit');

const stats = await store.getExerciseStats('machine-id', 'gym-a');
assert.equal(stats.global.sessionCount, 2);
assert.equal(stats.gym.sessionCount, 1);
```

Also assert history summaries/details expose `gymId`, repeated occurrences still select the requested occurrence, linked groups accept either linked gym, and drafts do not count.

- [ ] **Step 2: Run the focused integration tests and verify the red failure.**

Run: `npx tsx --test tests/integration/history-stats.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts`

Expected: FAIL because current queries ignore gym IDs and return flat stats/sets.

- [ ] **Step 3: Load ordered occurrence fragments in native and web stores.**

Native should query completed workouts/exercise occurrences ordered by `w.start_time DESC`, join the gym name, filter completed sets, and pass the resulting `CompletedExerciseOccurrence[]` to the shared resolver. Web should read completed workout objects, normalize missing IDs to the default, filter/sort identically, and pass the same shape to the resolver. Preserve occurrence ordering and empty-occurrence fallback behavior.

- [ ] **Step 4: Delegate stats to the shared calculator.**

Native loads only completed workout fragments for the requested exercise; web filters completed workout objects. Both call `calculateDualExerciseStats` and return zero-filled global/gym records. Keep `getExerciseStats` draft-free and make `maxSetVolumeKg` available to later PR-badge work.

Update the public wrappers in `src/database/db.native.ts` and `src/database/db.web.ts` to accept `currentGymId` and return `PreviousSetSuggestion[]`/`DualExerciseStats`; retain the optional current-gym argument only on `getPreviousSetsForExercise` and require it for `getExerciseStats` at the Store boundary.

- [ ] **Step 5: Run platform parity and existing suites.**

Run:

```bash
npx tsx --test tests/integration/history-stats.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts
npm test
```

Expected: new gym-aware assertions and all existing tests pass.

- [ ] **Step 6: Commit history/query behavior.**

```bash
git add src/database/nativeStore.ts src/database/webStore.ts src/database/db.native.ts src/database/db.web.ts tests/integration/history-stats.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts
git commit -m "feat: isolate workout history by gym"
```

---

### Task 7: Add active-gym lifecycle state and untouched-set rehydration

**Files:**
- Modify: `src/context/WorkoutContext.tsx`
- Create: `src/workout/gym-session.ts`
- Create: `tests/unit/gym-session.test.ts`
- Modify: `tests/integration/completion-lifecycle.test.ts`
- Modify: `tests/integration/draft-lifecycle.test.ts`

**Interfaces:**
- Consumes: store gym APIs and suggestion APIs from Tasks 3–6.
- Produces: `WorkoutContext` values `gyms`, `activeGym`, `setActiveGym`, and a start option that supports explicit gym IDs while defaulting all starts to the saved default.

- [ ] **Step 1: Write failing pure session tests.**

Create a test for `rehydrateUntouchedSuggestions(workout, suggestionsByExercise)` that asserts completed sets, `isWeightEdited` sets, and user-entered reps remain unchanged while only untouched ghost fields are replaced. Add tests that `startWorkout` uses the default gym, resume uses the draft gym, and switching gym persists the new `Workout.gymId`.

- [ ] **Step 2: Run the focused tests and verify the red failure.**

Run: `npx tsx --test tests/unit/gym-session.test.ts tests/integration/completion-lifecycle.test.ts tests/integration/draft-lifecycle.test.ts`

Expected: FAIL because no gym session helper or context API exists.

- [ ] **Step 3: Implement the pure untouched-set update.**

Create:

```ts
export function rehydrateUntouchedSuggestions(
  workout: Workout,
  suggestionsByExercise: Record<string, PreviousSetSuggestion[]>
): Workout;
```

Map each exercise’s sets by index. Replace only `previousWeightKg`, `previousReps`, `previousGymId`, and `previousGymName` for sets where `isCompleted` is false and `isWeightEdited` is false. Never mutate the input workout or user-entered values.

- [ ] **Step 4: Extend `WorkoutContext` lifecycle behavior.**

Add:

```ts
interface StartWorkoutOptions { gymId?: string }
gyms: Gym[];
activeGym: Gym | null;
setActiveGym: (gymId: string) => Promise<void>;
```

Load gyms/default after controller initialization. Update `startWorkout(..., options?)` to resolve `options.gymId || defaultGym.id`, pass that ID to every previous-set query, and set it on the new workout. In routine-generated and history-repeat exercises, copy `sourceGymId/sourceGymName` into each set’s previous metadata along with weight/reps; for repeat exercises preserve the existing entered target values while replacing only their ghost metadata. Keep repeat workouts on the current default unless the caller explicitly supplies a gym. `resumeDraft()` uses the draft’s saved ID. `setActiveGym()` re-reads the current controller state after async suggestion lookups, updates `Workout.gymId`, applies `rehydrateUntouchedSuggestions`, and calls `ctrl.update()` with the current rest timer metadata so the session autosaves.

- [ ] **Step 5: Run lifecycle and TypeScript checks.**

Run: `npx tsx --test tests/unit/gym-session.test.ts tests/integration/completion-lifecycle.test.ts tests/integration/draft-lifecycle.test.ts && npx tsc --noEmit`

Expected: all lifecycle tests pass and no context/store type errors remain.

- [ ] **Step 6: Commit active-gym lifecycle behavior.**

```bash
git add src/context/WorkoutContext.tsx src/workout/gym-session.ts tests/unit/gym-session.test.ts tests/integration/completion-lifecycle.test.ts tests/integration/draft-lifecycle.test.ts
git commit -m "feat: assign active workouts to gyms"
```

---

### Task 8: Build reusable gym picker and gym-profile management UI

**Files:**
- Create: `src/components/GymPickerModal.tsx`
- Create: `src/components/GymProfilesModal.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/context/SettingsContext.tsx`

**Interfaces:**
- Consumes: `Gym` CRUD and `gym_tracking_enabled` setting from Tasks 3–4, existing `useDialog`, `useSettings`, and `useWorkout` patterns.
- Produces: reusable picker props `{ visible, gyms, selectedGymId, title, onSelect, onClose }` where `onSelect(gymId)` may be async, plus a management flow with validated add/edit/delete/default actions.

- [ ] **Step 1: Reuse the shared profile policy before building UI.**

Run `tests/unit/gym-profile.test.ts` and confirm the modal will call `validateGymName`, `validateGymColor`, and the Store’s replacement/deletion validation. Do not add component-local copies of the name, color, or deletion rules.

- [ ] **Step 2: Implement `GymPickerModal`.**

Use a `FlatList` of gyms, display each color swatch/name/default marker, highlight `selectedGymId`, and expose 44pt-or-larger touch targets and accessibility labels. Define `onSelect: (gymId: string) => void | Promise<void>`. Await it before closing so an active-workout save error leaves the picker open; tapping backdrop or platform back calls `onClose`.

- [ ] **Step 3: Implement `GymProfilesModal`.**

Use a form with a trimmed name field and the fixed palette `['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']`. Add rename/edit, set-default, and delete actions. Delete first confirms, then opens `GymPickerModal` restricted to replacement candidates. Show store errors through `notify`; do not close the modal until the operation succeeds.

- [ ] **Step 4: Extend `SettingsModal`.**

Expose `gymTrackingEnabled: boolean` and `setGymTrackingEnabled(enabled: boolean): Promise<void>` from `src/context/SettingsContext.tsx`. Load the setting with an enabled default, persist `gym_tracking_enabled` as `"true"`/`"false"`, and roll back state plus notify on write failure. Add a `Gym Tracking` toggle and `Manage Gyms` button to `SettingsModal`; when disabled, hide only gym UI elsewhere while retaining stored IDs and isolation. Refresh the profile list after every successful mutation.

- [ ] **Step 5: Run typecheck and web export.**

Run: `npx tsc --noEmit && npx expo export --platform web --output-dir /tmp/lifts-web-export-multi-gym-settings`

Expected: no type errors and a successful web bundle.

- [ ] **Step 6: Commit the profile-management UI.**

```bash
git add src/components/GymPickerModal.tsx src/components/GymProfilesModal.tsx src/components/SettingsModal.tsx src/context/SettingsContext.tsx
git commit -m "feat: add gym profile management"
```

---

### Task 9: Add active-workout location picker and foreign ghost labels

**Files:**
- Modify: `src/screens/ActiveWorkoutScreen.tsx`
- Create: `src/workout/gym-display.ts`
- Create: `tests/unit/gym-display.test.ts`

**Interfaces:**
- Consumes: `GymPickerModal`, `activeGym`, `gyms`, `setActiveGym`, and `gymTrackingEnabled` from Tasks 7–8.
- Produces: a live gym selector and source-aware previous-set display without changing completed/user-entered values.

- [ ] **Step 1: Write the UI behavior test or pure display assertion.**

Add a test for the display formatter used by the set row:

```ts
import { PreviousSetSuggestion } from '../../src/types';
import { formatPreviousMetric } from '../../src/workout/gym-display';

const localSuggestion: PreviousSetSuggestion = { weightKg: 45, reps: 10 };
const foreignSuggestion: PreviousSetSuggestion = { weightKg: 45, reps: 10, sourceGymName: 'FitX' };

assert.equal(formatPreviousMetric(localSuggestion, 'kg'), '45 kg × 10');
assert.equal(
  formatPreviousMetric(foreignSuggestion, 'kg'),
  '45 kg × 10 · from FitX'
);
```

Assert that global suggestions never include a source suffix.

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `npx tsx --test tests/unit/gym-display.test.ts`

Expected: FAIL because the formatter and UI props do not exist.

- [ ] **Step 3: Add the active-workout gym chip and picker.**

Place a compact `TouchableOpacity` below or within the existing top bar with the active gym color, name, and `▾`. Open `GymPickerModal` on press. On selection call `await setActiveGym(gymId)` and notify on failure. Hide the chip/picker when `gym_tracking_enabled` is false without altering the workout’s stored ID.

- [ ] **Step 4: Render source-aware previous values.**

Add `formatPreviousMetric(suggestion: PreviousSetSuggestion, unit: WeightUnit)` to `src/workout/gym-display.ts`. Use the existing `formatWeight` helper for the weight portion, then append `· from ${suggestion.sourceGymName}` only when `sourceGymName` is present. Keep the input placeholder weight unchanged and do not show a source label on global/local suggestions.

- [ ] **Step 5: Manually validate active switching.**

Run the app on a native build, start a workout with at least one machine exercise, switch gyms, and verify untouched ghost values update while an entered weight, completed set, rest timer, and workout duration remain unchanged. Minimize and restore the workout to confirm the selected gym persists.

- [ ] **Step 6: Commit active-workout UI.**

```bash
git add src/screens/ActiveWorkoutScreen.tsx src/workout/gym-display.ts tests/unit/gym-display.test.ts
git commit -m "feat: select gym during active workouts"
```

---

### Task 10: Add history filters, retroactive assignment, scope overrides, and dual stats

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`
- Modify: `src/components/WorkoutEditModal.tsx`
- Modify: `src/screens/ExercisesScreen.tsx`
- Create: `src/components/ExerciseScopeModal.tsx`
- Modify: `src/workout/workout-edit.ts`
- Modify: `tests/unit/workout-edit.test.ts`
- Modify: `tests/integration/history-stats.test.ts`

**Interfaces:**
- Consumes: gym lists/CRUD, `WorkoutHistorySummary.gymId`, `DualExerciseStats`, scope CRUD, and `gymTrackingEnabled`.
- Produces: filtered/tagged history, safe workout gym reassignment, and user-editable scope overrides.

- [ ] **Step 1: Write failing edit/scope tests.**

Extend `WorkoutEdits` and its unit tests so `applyWorkoutEdits(workout, { gymId: 'gym-b' })` returns a new workout with only `gymId` changed. Add tests that invalid/empty gym IDs are rejected by the screen/store boundary and that a linked scope requires two gyms. Add integration assertions that history filtering changes counts/volume without mutating stored records.

- [ ] **Step 2: Run focused tests and verify the red failure.**

Run: `npx tsx --test tests/unit/workout-edit.test.ts tests/integration/history-stats.test.ts`

Expected: FAIL because workout edits and UI queries do not carry gym IDs.

- [ ] **Step 3: Add history gym chips and tags.**

Load gyms alongside history. Keep the full list in state and derive `filteredHistory` from `selectedGymId: string | null`; `null` means All Gyms. Recompute the summary strip from the filtered list. Add one horizontal chip per gym and a color/name tag to each card when tracking is enabled. Clear a deleted gym’s selected filter back to All Gyms.

- [ ] **Step 4: Add gym reassignment to `WorkoutEditModal`.**

Pass `gyms` from `HistoryScreen`, add a required selected-gym field, and include `gymId` in `applyWorkoutEdits`. Before saving, verify the ID exists; call the existing `saveCompletedWorkout` path so native and web update the same workout ID atomically. Refresh both list and cached detail after success.

- [ ] **Step 5: Add exercise scope management.**

Create `ExerciseScopeModal` with Global, Gym-specific, and Linked gyms choices. Load the existing override, validate linked selection with `validateExerciseGymScope`, call `saveExerciseGymScope`, and allow “Use equipment default” via `deleteExerciseGymScope`. In `ExercisesScreen`, load the current/default gym and `getExerciseStats`, showing separate `Global` and the actual current-gym name as cards with max weight, max single-set volume, estimated 1RM, and sessions. Show the effective scope and open the scope modal from exercise details.

- [ ] **Step 6: Run tests, typecheck, and web export.**

Run:

```bash
npx tsx --test tests/unit/workout-edit.test.ts tests/unit/gym-scope.test.ts tests/integration/history-stats.test.ts
npx tsc --noEmit
npx expo export --platform web --output-dir /tmp/lifts-web-export-multi-gym-history
```

Expected: all focused tests pass, TypeScript passes, and the web bundle exports.

- [ ] **Step 7: Commit history and scope UI.**

```bash
git add src/screens/HistoryScreen.tsx src/components/WorkoutEditModal.tsx src/screens/ExercisesScreen.tsx src/components/ExerciseScopeModal.tsx src/workout/workout-edit.ts tests/unit/workout-edit.test.ts tests/integration/history-stats.test.ts
git commit -m "feat: expose gym-aware history and exercise scope"
```

---

### Task 11: Update documentation, release acceptance, and roadmap truthfulness

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md`
- Modify: `docs/release-checklist.md`

**Interfaces:**
- Consumes: the completed feature behavior and manual acceptance results from Tasks 1–10.
- Produces: truthful public documentation and a release gate for multi-gym migration/backup/UI behavior.

- [ ] **Step 1: Update roadmap status without claiming unfinished work.**

Mark Multi-Gym Tracking & Machine Isolation complete only after Tasks 1–10 and manual acceptance pass. Split the existing chart line into the already delivered weekly volume/muscle-frequency views and the remaining strength/1RM trend work; do not mark the entire chart requirement complete prematurely. Keep Supersets, Warmup Progression, PR Badges, and third-party import backlog items unchecked.

- [ ] **Step 2: Document user-visible behavior.**

Add README bullets for gym profiles, machine/cable isolation, global/current-gym records, v2 import/v3 export, and the fact that no pulley-ratio conversion occurs. Link the revised spec and keep the single-gym zero-friction behavior explicit.

- [ ] **Step 3: Add release checks.**

Append acceptance rows covering native migration 4→5, web IndexedDB 1→2, default-gym backfill, delete/reassignment, linked scopes, v2→v3 restore, cross-gym ghost labels, and feature-toggle persistence. Record manual device results rather than treating unit tests as device verification.

- [ ] **Step 4: Run the complete verification matrix.**

Run:

```bash
npm test
npm run test:integration
npx tsc --noEmit
npx expo export --platform web --output-dir /tmp/lifts-web-export-multi-gym
npx expo-doctor
git diff --check
```

Expected: all unit/integration tests pass, TypeScript passes, web export succeeds, Expo Doctor reports no issues, and `git diff --check` is clean.

- [ ] **Step 5: Commit documentation and release gates.**

```bash
git add ROADMAP.md README.md docs/release-checklist.md
git commit -m "docs: finalize multi-gym roadmap and release checks"
```

---

## Final Review Checklist

- [ ] Native migration 5 is atomic, idempotent, and rollback-tested.
- [ ] IndexedDB version 2 preserves version-1 data and lease behavior.
- [ ] Every canonical workout/draft has a valid gym ID.
- [ ] Routines remain gym-agnostic.
- [ ] Equipment defaults match the actual dataset values.
- [ ] Global, gym-specific, and linked-group suggestions match the shared algorithm.
- [ ] Foreign fallback suggestions are visibly labeled only when gym tracking is enabled.
- [ ] Deleting a gym cannot create dangling references or zero defaults.
- [ ] v2 backups import and v3 backups round-trip native↔web.
- [ ] Scope conflicts and gym ID collisions are non-destructive.
- [ ] Drafts never affect history or records.
- [ ] Existing backup, workout, history-edit, rest-timer, and lifecycle tests remain green.
- [ ] Android, iOS, and web manual acceptance is recorded before release.
