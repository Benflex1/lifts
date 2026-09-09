# Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the confirmed release-blocking regressions in native migrations, workout-session defaults, repeat-workout reconstruction, backup validation, and Expo configuration while preserving the existing local-first behavior.

**Architecture:** Keep fixes at the existing boundaries: SQLite compatibility belongs in `migrations.ts`, shared workout-default semantics belong in the pure `workout/sets.ts` helpers, and repeat-workout fallback logic belongs in a pure helper consumed by `HistoryScreen`. Use regression tests against the real Node SQLite fixture and pure helpers, then make dependency/config/documentation corrections separately.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Node `node:test`, `tsx`, SQLite via the repository test driver, IndexedDB fixture tests.

**Spec:** `docs/superpowers/specs/2026-09-07-audit-remediation-design.md` plus the confirmed follow-up findings in the project audit.

## Global Constraints

- Preserve existing backup compatibility, including legacy free-form `targetReps` text such as `8 each side`.
- Preserve `0` as the explicit “rest timer off” value; do not replace it with a default duration.
- Native migrations must be transactional and idempotent.
- No production behavior change is introduced without a failing regression test first; configuration and documentation edits are exempt.
- Validate with TypeScript, unit tests, integration tests, web export, and Expo Doctor.

---

### Task 1: Repair legacy SQLite `in_progress` migration

**Files:**
- Modify: `tests/integration/native-store.test.ts`
- Modify: `src/database/migrations.ts`

**Interfaces:**
- Consumes: `NodeSqliteDriver`, `createNativeStore`, and the existing migration transaction flow.
- Produces: Migration 2 adds `workouts.in_progress` for fresh upgrades, and Migration 4 repairs databases that already recorded the faulty old Migration 2 without the column.

- [x] **Step 1: Write the failing test**

Add a native migration test whose manually-created legacy `workouts` table omits `in_progress`, inserts a completed workout, runs `createNativeStore(driver).init()`, and asserts `getWorkoutHistory()` returns the completed workout without a missing-column error.

- [x] **Step 2: Run the focused test and verify the expected failure**

Run `npx tsx --test tests/integration/native-store.test.ts`; before the migration fix it must fail with SQLite’s missing `in_progress` column error.

- [x] **Step 3: Implement the minimal migration compatibility check**

Inside Migration 2’s transaction, query `PRAGMA table_info(workouts);`, run `ALTER TABLE workouts ADD COLUMN in_progress INTEGER NOT NULL DEFAULT 0;` when absent, and only then select in-progress workouts. Add Migration 4 with the same idempotent column check for users whose old Migration 2 was already marked applied. Keep both changes inside their transactions so rollback removes an uncommitted column change.

- [x] **Step 4: Run the native integration suite**

Run `npx tsx --test tests/integration/native-store.test.ts`; all native migration, rollback, and store tests must pass.

### Task 2: Preserve rest-timer-off and repeat-workout target reps

**Files:**
- Modify: `tests/unit/workout-sets.test.ts`
- Modify: `src/workout/sets.ts`
- Modify: `src/context/WorkoutContext.tsx`
- Modify: `src/screens/HistoryScreen.tsx`
- Modify: `tests/integration/native-store.test.ts`

**Interfaces:**
- Consumes: `ActiveExercise`, `WorkoutSet`, native workout detail results, and existing target helpers.
- Produces: `resolveRestTimerSeconds(seconds)` preserving `0`, and `resolveHistoricalTargetReps(exerciseTarget, setTarget)` preferring the exercise-level target.

- [x] **Step 1: Write failing pure-helper tests**

Add tests asserting `resolveRestTimerSeconds(0) === 0`, `resolveRestTimerSeconds(undefined) === 0`, and `resolveRestTimerSeconds(90) === 90`; add tests asserting `resolveHistoricalTargetReps('8-12', undefined) === '8-12'`, set-level fallback works, and the final fallback is `'10'`.

- [x] **Step 2: Run the focused unit test and verify it fails**

Run `npx tsx --test tests/unit/workout-sets.test.ts`; the new imports/functions must fail before implementation.

- [x] **Step 3: Implement and wire the helpers**

Implement the two pure helpers in `src/workout/sets.ts`. Replace `|| 90` with `resolveRestTimerSeconds(...)` in routine start and set-completion paths, use `0` for directly-added exercises, and use `resolveHistoricalTargetReps(ex.targetReps, s.targetReps)` in `HistoryScreen` for both the active exercise and each reconstructed set.

- [x] **Step 4: Add the native detail regression assertion**

Extend the native store test fixture with a completed workout exercise carrying `target_reps = '8-12'` and assert `getWorkoutDetail()` returns that exercise-level target. This protects the data source used by repeat-workout reconstruction.

- [x] **Step 5: Run focused unit and native integration tests**

Run `npx tsx --test tests/unit/workout-sets.test.ts tests/integration/native-store.test.ts`; all tests must pass.

### Task 3: Reject structurally malformed backup routines

**Files:**
- Modify: `tests/unit/backup-validation.test.ts`
- Modify: `src/utils/backup.ts`

**Interfaces:**
- Consumes: `parseBackup` and existing v2 compatibility normalization.
- Produces: Every routine must contain an exercises array, and each routine exercise must be an object with a string `exerciseId` before reference validation.

- [x] **Step 1: Write the failing validation test**

Add a test that passes a v2 backup with `routines: [{ id: 'r1', name: 'Broken' }]` and asserts `parseBackup` throws `Invalid exercises in routine r1`.

- [x] **Step 2: Run the focused validation test and verify it fails**

Run `npx tsx --test tests/unit/backup-validation.test.ts`; the malformed routine must currently be accepted.

- [x] **Step 3: Implement narrow structural validation**

Require `Array.isArray(r.exercises)` and reject non-object routine exercise entries or missing/non-string `exerciseId` before looking up the exercise definition. Do not call `validateTargetReps` here, because restore must preserve legacy free-form target strings.

- [x] **Step 4: Run the complete backup validation suite**

Run `npx tsx --test tests/unit/backup-validation.test.ts`; all existing compatibility, duplicate-ID, numeric, and legacy-target tests must remain green.

### Task 4: Remove timestamp-only ID collision paths and align RPE behavior

**Files:**
- Create: `src/utils/ids.ts`
- Modify: `src/database/nativeStore.ts`
- Modify: `src/database/webStore.ts`
- Modify: `src/screens/ActiveWorkoutScreen.tsx`
- Modify: `tests/unit/workout-sets.test.ts`
- Modify: `tests/integration/native-store.test.ts`

**Interfaces:**
- Consumes: Web Crypto’s `randomUUID()` when available and Expo Crypto as the native fallback.
- Produces: `createScopedId(prefix)` for custom exercises and routines; RPE chips covering the documented 5–10 range.

- [x] **Step 1: Write failing ID and RPE tests**

Add a unit test asserting two calls to `createScopedId('routine')` produce distinct `routine-...` values. Add an integration test creating two custom exercises through the native store and assert both IDs and rows remain distinct.

- [x] **Step 2: Run the focused tests and verify they fail**

Run `npx tsx --test tests/unit/workout-sets.test.ts tests/integration/native-store.test.ts`; the new helper import/test must fail before implementation.

- [x] **Step 3: Implement collision-resistant IDs and update callers**

Implement `createScopedId(prefix)` with runtime Web Crypto and Expo Crypto fallback, and replace timestamp-only IDs in both stores for custom exercises, new routines, and duplicated routines. Add `5` to the RPE chip options while preserving the existing cycle behavior.

- [x] **Step 4: Run the focused tests again**

Run `npx tsx --test tests/unit/workout-sets.test.ts tests/integration/native-store.test.ts`; all focused tests must pass.

### Task 5: Correct Expo config, package health, and stale release documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`
- Modify: `README.md`
- Modify: `docs/audit-remediation-results.md`
- Modify: `docs/release-checklist.md`

**Interfaces:**
- Consumes: Expo’s package compatibility resolver and current repository test/build scripts.
- Produces: Direct `expo-font` peer dependency, Expo patch alignment, dark UI/iOS identity configuration, and documentation matching the current repository.

- [x] **Step 1: Align Expo dependencies**

Run `npx expo install expo@~57.0.21 expo-font` and retain the generated lockfile changes.

- [x] **Step 2: Update app metadata and documentation**

Set `userInterfaceStyle` to `dark`, add the iOS bundle identifier `com.benflex1.lifts`, update the TypeScript badge to 6.x, correct stale source/test paths and current test totals in the audit report, and change the release checklist’s default-routine count from 5 to 3.

- [x] **Step 3: Run the full verification matrix**

Run `npx tsc --noEmit`, `npm test`, `npm run test:integration`, `npx expo export --platform web --output-dir /tmp/lifts-web-export-final`, and `npx expo-doctor`. Record any remaining doctor/audit/legal/device issues rather than claiming release readiness without them.
