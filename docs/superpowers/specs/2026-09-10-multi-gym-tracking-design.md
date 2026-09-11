# Multi-Gym Tracking & Machine Isolation — Revised Design Spec

- **Date:** 2026-09-10
- **Status:** Reviewed and corrected for implementation planning
- **Supersedes:** `docs/superpowers/specs/2026-09-09-multi-gym-tracking-design.md` from `origin/docs/roadmap-multi-gym`
- **Goal:** Preserve trustworthy workout history, previous-set suggestions, and exercise records when the same lifter trains at multiple locations with different machines or cable setups.

---

## 1. Review Corrections

The original proposal is directionally sound but did not match the current repository in five places:

1. Native migrations currently end at version 4, so the multi-gym migration is **native migration 5**, not migration 3.
2. Native `workout_drafts` stores the complete `WorkoutDraft` as JSON in `data`; it has no normalized draft columns. `gymId` is therefore stored in the canonical `Workout` inside the draft payload. A duplicate `workout_drafts.gym_id` column is intentionally not added.
3. Web persistence currently opens IndexedDB at version 1. The upgrade must open version 2 and create the new object stores while preserving existing version-1 records.
4. The bundled exercise data uses the equipment values `machine` and `cable`; those are the only default gym-specific categories. All other current equipment values are global by default, with explicit per-exercise overrides.
5. “Calibration” means isolating and labeling machine history in v1. Lifts will not convert weights using guessed pulley ratios or machine leverage formulas. Raw logged kg values remain unchanged.

The existing `origin/docs/roadmap-multi-gym` document remains useful as the source proposal, but this revision is the implementation authority.

---

## 2. Scope and Non-Goals

### Included in Multi-Gym v1

- Gym profiles with a guaranteed `Default Gym` and a user-selectable default.
- Active-workout gym assignment with a compact picker.
- Gym assignment on completed workouts and paused drafts.
- Default equipment scoping plus per-exercise global, gym-specific, or linked-gym overrides.
- Gym-aware previous-set suggestions with an explicit foreign-gym source label.
- History gym tags, filtering, and retroactive reassignment.
- Global and current-gym exercise statistics and records.
- Backup Schema v3 export with backward-compatible v2 import.
- Native SQLite migration 5 and IndexedDB version-2 upgrade.

### Explicitly out of scope

- GPS or automatic gym detection.
- Cloud sync, accounts, or cross-device collaboration.
- Routines locked to a gym; routines remain reusable templates.
- Automatic pulley-ratio, machine-leverage, or plate-increment conversion.
- In-workout PR animation/toast polish; the data service will expose dual-tier records for the later Phase 3 PR-badges item.
- Health Connect, Apple Health, exercise videos, or third-party CSV import.

### Feature toggle semantics

The setting `gym_tracking_enabled` defaults to the string value `"true"`. Disabling it hides gym pickers, filters, scope controls, and source labels, but does not remove stored gym IDs or turn off isolation in persistence. Existing data therefore remains safe if the user later re-enables the feature. New sessions still receive the current default gym ID.

---

## 3. Domain Rules

### Gym invariants

- The seeded gym has ID `gym-default`, name `Default Gym`, color `#3B82F6`, and `isDefault = true`.
- There is always at least one gym and exactly one default gym.
- Gym names are trimmed, non-empty, and limited to 80 Unicode characters.
- Gym colors come from the existing UI-safe palette; arbitrary user CSS/color strings are not accepted.
- Deleting a gym requires a different replacement gym. All completed workouts and drafts assigned to the deleted gym are reassigned atomically. If the deleted gym was default, the replacement becomes default in the same transaction.
- Linked-gym scopes remove a deleted ID. A linked scope with fewer than two remaining gyms becomes a normal `gym_specific` scope; an empty override is removed.

### Exercise scope defaults

The default scope is derived from the normalized `Exercise.equipment` value:

| Equipment value | Default scope |
|---|---|
| `machine` | `gym_specific` |
| `cable` | `gym_specific` |
| every other current value (`barbell`, `dumbbell`, `kettlebells`, `e-z curl bar`, `body only`, `bands`, `medicine ball`, `exercise ball`, `foam roll`, `other`) | `global` |

An `ExerciseGymScope` override takes precedence over this default. A `linked_group` override must contain at least two existing gym IDs with no duplicates. A `global` or `gym_specific` override must not contain linked IDs.

### History and suggestion rules

- Only completed sets in completed workouts participate in suggestions or records.
- A missing gym ID from a legacy record is treated as `gym-default` during normalization.
- Global exercises use the latest completed occurrence across all gyms, without a foreign-gym label.
- Gym-specific exercises first use the latest occurrence at the current gym.
- Linked-group exercises first use the latest occurrence at any gym in the linked group.
- If no allowed-gym occurrence exists, gym-specific and linked-group exercises fall back to the latest occurrence anywhere and attach `sourceGymId` and `sourceGymName` to the suggestion.
- Repeated occurrences of an exercise in one workout preserve the existing `occurrenceIndex` behavior: use the requested occurrence when it has completed sets, otherwise use the first completed occurrence in that workout.
- A current-gym suggestion has no foreign source label even if its source gym is the default gym.

### Records

For each exercise and selected current gym, the store exposes:

- `global`: all-time completed-set records across every gym.
- `gym`: records limited to the current gym or linked group, according to the exercise scope.

Each record contains maximum weight, maximum single-set volume, estimated 1RM, and distinct completed-workout count. No weight is transformed during these calculations.

---

## 4. Canonical Types and Store Contract

Add these models to `src/types/index.ts`:

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

Extend `Workout` and `WorkoutHistorySummary` with required canonical `gymId: string`. Extend `WorkoutSet` with optional transient suggestion metadata:

```ts
previousGymId?: string;
previousGymName?: string;
```

Extend `DataSnapshot` with required `gyms: Gym[]` and `exerciseGymScopes: ExerciseGymScope[]`. A store returned from `init()` always returns those arrays, even when they are empty except for the default gym.

Extend `Store` with these exact operations:

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

The optional `currentGymId` keeps old direct callers safe during the transition; when it is omitted, the implementation uses the default gym. Public database wrappers in `db.native.ts` and `db.web.ts` mirror the store signatures.

---

## 5. Persistence Design

### Native SQLite: migration 5

Migration 5 runs after the current migrations 1–4 in one transaction:

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

Insert `gym-default` with `INSERT OR IGNORE`. Add `workouts.gym_id` only when absent, then backfill every existing workout to `gym-default`. Normalize every valid JSON draft so `draft.workout.gymId` is also `gym-default`; do not add a normalized draft column. Migration 5 must be idempotent and must roll back its tables, column, backfill, and migration marker on failure.

Native CRUD operations use the existing serialized write queue. Gym deletion, default changes, workout reassignment, and scope cleanup occur in one SQLite transaction.

### Web IndexedDB: version 2

Change `openDb()` from version 1 to version 2. In `onupgradeneeded`, retain all existing stores and add:

- `gyms`, key path `id`
- `exercise_gym_scopes`, key path `exerciseId`

Seed the default gym during the upgrade. On writer initialization, normalize old workout and draft objects that lack `gymId` and persist them in one write transaction. Existing version-1 records must remain readable after the upgrade. Store writes continue to verify the single-writer lease.

### Canonical snapshot

`readSnapshot()` returns all completed workouts, drafts, routines, exercises, settings, gyms, and scope overrides. `mergeSnapshot()` merges gyms/scopes before workouts/drafts and preserves the existing settings conflict rule. It must never leave a workout or draft pointing at a missing gym.

---

## 6. Backup Schema v3 and Restore

Define a canonical `BackupV3` export type containing `gyms` and `exerciseGymScopes` in addition to the existing fields. Retain an exported `BackupV2` input type only for legacy fixtures and compatibility; `buildBackupJson()` exports version 3.

`parseBackup()` accepts version 2 and version 3, returning normalized v3 data:

- A v2 payload receives one synthetic `gym-default` record.
- Every v2 workout and draft receives `gymId: 'gym-default'`.
- Missing v3 arrays normalize to empty arrays only where the version contract allows it; malformed records still fail validation.
- Scope IDs, linked IDs, and workout/draft gym IDs are validated against the normalized gym set.

Restore gym ID mapping is deterministic and non-destructive:

1. Map the source default gym—and the reserved `gym-default` ID—to the destination default gym.
2. Reuse an existing non-default gym when ID, name, color, and non-default semantics are identical.
3. For an ID collision with different data, allocate a new non-default `gym-import-<uuid>` ID and remap every imported workout, draft, and linked scope reference.
4. Never replace an existing destination gym or create a second default because of an import.
5. Scope conflicts for the same exercise ID abort the whole restore, matching existing conflict behavior.

Add v2-to-v3 validation tests, v3 round-trip tests on native and web stores, collision remapping tests, and transaction rollback tests.

---

## 7. User Experience

### Settings and gym profiles

Extend `SettingsModal` with the `Gym Tracking` toggle and a `Manage Gyms` action. A dedicated `GymProfilesModal` handles listing, adding, renaming, color selection, default selection, and deletion. Deletion uses the app’s existing confirmation dialog and a second replacement-gym picker; no platform `Alert` or browser prompt is introduced.

### Active workout

Add a reusable `GymPickerModal` and a compact gym chip to `ActiveWorkoutScreen`. New routine, empty, and repeat sessions start at the default gym. Resuming a draft uses its saved gym. Switching gyms updates only `Workout.gymId` and untouched ghost metadata; completed sets and user-entered values never change. The update is autosaved through the existing session controller.

When gym tracking is enabled, foreign ghost suggestions render their source as `from <Gym Name>` beside the previous-set metric. Global suggestions remain unlabeled.

### History

Add an All Gyms chip and one chip per gym. Each history card shows its gym color/name when tracking is enabled. The existing `WorkoutEditModal` receives the gym list and allows retroactive reassignment; saving validates the selected gym and preserves all other edit behavior.

### Exercise details and scope overrides

Exercise details show Global and Current Gym stats. A scope control allows `Global`, `Gym-specific`, or `Linked gyms`; linked mode requires selecting at least two gyms. Saving an override is available for bundled and custom exercises and does not mutate the exercise definition itself.

---

## 8. Shared Algorithms

Create focused pure modules rather than duplicating native and web policy:

- `src/workout/gym-scope.ts`: equipment normalization, default scope, scope validation, and allowed-gym resolution.
- `src/workout/gym-history.ts`: completed occurrence collection and previous-set selection with source metadata.
- `src/workout/gym-records.ts`: global/current-gym record aggregation.

Native SQLite and web IndexedDB implementations are responsible only for loading ordered occurrences/records and delegating selection/aggregation to these shared functions. This is required for native/web parity.

---

## 9. Acceptance and Testing

The feature is accepted only when:

1. Fresh native and web stores contain exactly one default gym and existing Phase 1/2 behavior is unchanged with one gym.
2. A legacy native database at version 4 migrates to version 5 without losing workouts, drafts, routines, settings, or custom exercises.
3. A legacy IndexedDB version-1 store upgrades to version 2 without losing records.
4. Deleting a gym reassigns all references atomically and cannot leave zero defaults or dangling IDs.
5. Global, gym-specific, and linked-group suggestions choose the correct occurrence and label foreign fallback values.
6. Global and current-gym stats remain distinct and exclude drafts.
7. v2 backups import into v3 stores, v3 backups round-trip native↔web, and conflicting IDs roll back without partial writes.
8. Finish, discard, repeat, workout editing, routine creation, and unit switching continue to pass existing tests.
9. Manual device validation covers Android/iOS picker behavior, gym switching during a live workout, deletion reassignment, foreign ghost labels, and web version upgrade.

Required automated commands:

```bash
npm test
npm run test:integration
npx tsc --noEmit
npx expo export --platform web --output-dir /tmp/lifts-web-export-multi-gym
npx expo-doctor
git diff --check
```
