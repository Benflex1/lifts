# Workout UX Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make backup export user-controlled, make active-workout ordering gesture-driven, clarify paused-session recovery, and protect Finish/Discard draft cleanup with regression coverage.

**Architecture:** Keep the existing BackupV2 JSON schema and import flow unchanged. Add a platform-aware save adapter: Android uses Expo’s Storage Access Framework directory picker, iOS hands a temporary JSON file to the Files-capable share sheet, and web keeps the browser download. Add a small React Native PanResponder-based drag wrapper and pure drop-index/reorder helpers, while retaining the existing exercise replacement picker as a separate action.

**Tech Stack:** Expo SDK 57, React Native core `PanResponder`/`Animated`, `expo-file-system/legacy`, `expo-sharing`, TypeScript, and Node `node:test`.

**Spec:** Approved in-chat design from 2026-09-10: implement all four requested UX hardening changes without changing stored backup schema or deleting active workout drafts on app close.

## Global Constraints

- Preserve BackupV2 JSON shape and the existing restore validation/merge behavior.
- Native backup saving must never overwrite a user-selected file silently; cancellation must leave data unchanged.
- Do not add a drag-and-drop dependency; use existing React Native and Lucide dependencies.
- Closing/backgrounding an active session must continue to preserve a draft; only Finish or explicit Discard clears it.
- Every production behavior change must have a test written and observed failing before implementation.

---

### Task 1: User-selected backup saving

**Files:**
- Create: `src/utils/saveBackup.ts`
- Create: `src/utils/saveBackup.native.ts`
- Create: `src/utils/saveBackup.web.ts`
- Modify: `src/utils/export.ts`
- Modify: `src/screens/AnalyticsScreen.tsx`
- Create: `tests/unit/save-backup.test.ts`

**Interfaces:**
- Produces `SaveBackupResult = 'saved' | 'cancelled'` and `getBackupFilename(date?: Date): string`.
- Produces injected helpers `saveBackupToAndroid(json, filename, fileSystem)` and `saveBackupToIos(json, filename, fileSystem, sharing)` so platform behavior is testable without a device.

- [x] **Step 1: Write failing unit tests**

  Add tests that assert:
  - `getBackupFilename(new Date('2026-09-10T12:00:00.000Z'))` returns `lifts-backup-2026-09-10.json`.
  - Android permission cancellation returns `cancelled` and does not create or write a file.
  - Android success requests a directory, calls `createFileAsync(directoryUri, 'lifts-backup-2026-09-10', 'application/json')`, and writes the exact JSON through the selected SAF URI.
  - iOS writes the exact JSON into the cache URI and calls `shareAsync` with `mimeType: 'application/json'` and a Files-oriented dialog title.

- [x] **Step 2: Run the focused tests and verify the expected failure**

  Run `npx tsx --test tests/unit/save-backup.test.ts`.

  Expected result: the test file fails because the save adapter and injected helpers do not exist yet.

- [x] **Step 3: Implement the platform adapters**

  Implement `saveBackupToFiles()` by building the existing BackupV2 JSON once, deriving the date-stamped filename, and dispatching to `.native` or `.web`.

  On Android, call `FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()`. Return `cancelled` when permission is not granted; otherwise call `createFileAsync(permission.directoryUri, filenameWithoutExtension, 'application/json')` and `StorageAccessFramework.writeAsStringAsync()` with UTF-8 content.

  On iOS, write to `FileSystem.cacheDirectory + filename`, verify `Sharing.isAvailableAsync()`, and call `Sharing.shareAsync()` with `mimeType: 'application/json'` and `dialogTitle: 'Save Lifts backup'`. The share sheet supplies the Files destination on iOS.

  On web, retain the existing browser download behavior.

- [x] **Step 4: Update Analytics actions**

  Change the primary data action to `Save Backup to Files (v2)` and report cancellation without an error alert. Retain a secondary `Share Backup` action using the existing `exportBackup()` behavior so users can still send a backup to another app.

- [x] **Step 5: Run focused tests and typecheck**

  Run `npx tsx --test tests/unit/save-backup.test.ts tests/unit/export.test.ts` and `npx tsc --noEmit`.

  Expected result: all focused tests pass and TypeScript reports zero errors.

- [x] **Step 6: Commit the backup save slice**

  Run `git add src/utils/saveBackup.ts src/utils/saveBackup.native.ts src/utils/saveBackup.web.ts src/utils/export.ts src/screens/AnalyticsScreen.tsx tests/unit/save-backup.test.ts && git commit -m "feat: save backups to user files"`.

### Task 2: Drag-and-drop active exercise ordering

**Files:**
- Create: `src/components/DraggableExerciseCard.tsx`
- Modify: `src/workout/active-exercises.ts`
- Modify: `src/context/WorkoutContext.tsx`
- Modify: `src/screens/ActiveWorkoutScreen.tsx`
- Modify: `tests/unit/active-exercises.test.ts`

**Interfaces:**
- Produces `moveActiveExerciseToIndex(exercises, activeExerciseId, targetIndex): ActiveExercise[]`.
- Produces `getExerciseDropIndex(exerciseIds, layouts, activeExerciseId, deltaY): number` using measured card centers and the drag displacement.
- Adds `moveExerciseToIndex(activeExerciseId, targetIndex): void` to the workout context.

- [x] **Step 1: Write failing reorder/drop-index tests**

  Add tests that assert moving `active-a` to index `2` yields `b,c,a`, moving an unknown ID or out-of-range index is a no-op, and a dragged card’s center crossing the next/previous card center produces the corresponding target index while a short displacement keeps its current index.

- [x] **Step 2: Run the focused test and verify the expected failure**

  Run `npx tsx --test tests/unit/active-exercises.test.ts`.

  Expected result: the new tests fail because the target-index helper and direct-index move function do not exist.

- [x] **Step 3: Implement pure reorder helpers and context method**

  Implement direct-index movement by removing the selected item and inserting it at the clamped target index. Keep `moveActiveExercise()` as the existing one-step API backed by the new helper. Add `moveExerciseToIndex()` to `WorkoutContext`, preserving the active rest timer metadata and autosave behavior in one controller update.

- [x] **Step 4: Implement the drag wrapper**

  Create `DraggableExerciseCard` with a long-press threshold of 350ms on a visible grip handle, `PanResponder` move tracking, an `Animated.Value` vertical translation, and cleanup on release/termination. Notify the parent when dragging starts/ends and call `onDrop(itemId, gestureState.dy)` once on release.

- [x] **Step 5: Wire drag handles into the active workout list**

  Measure each card’s `y` and `height` in the shared `ScrollView` content coordinate space. Disable scrolling only while a card is actively being dragged. On release, compute the target index from the original card centers and call `moveExerciseToIndex()`. Add grip handles to both collapsed and expanded exercise headers. Keep the existing `Swap Exercise` picker as the separate identity-replacement action.

- [x] **Step 6: Run focused tests and typecheck**

  Run `npx tsx --test tests/unit/active-exercises.test.ts` and `npx tsc --noEmit`.

  Expected result: all active-exercise tests pass and TypeScript reports zero errors.

- [x] **Step 7: Commit the drag ordering slice**

  Run `git add src/components/DraggableExerciseCard.tsx src/workout/active-exercises.ts src/context/WorkoutContext.tsx src/screens/ActiveWorkoutScreen.tsx tests/unit/active-exercises.test.ts && git commit -m "feat: add drag reordering to active workouts"`.

### Task 3: Reframe draft recovery as a paused workout

**Files:**
- Modify: `src/components/DraftResumeBanner.tsx`
- Modify: `src/components/DraftRecoveryModal.tsx`
- Modify: `src/context/WorkoutContext.tsx`
- Modify: `App.tsx`
- Create: `src/workout/session-copy.ts`
- Test: `tests/unit/session-copy.test.ts`

- [x] **Step 1: Update user-visible session language**

  Replace visible “Unfinished,” “Recover,” and “Recovery” copy with “Paused Workout,” “Continue,” and “Saved session.” Explain that the session was saved and can be continued or discarded. Keep the underlying draft model and resume/discard actions unchanged.

- [ ] **Step 2: Verify the copy and lifecycle manually in the running app**

  Start a workout, leave the app, reopen it, and confirm the banner says Paused Workout and offers Continue/Discard. Confirm Android back still minimizes the session rather than discarding it.

- [x] **Step 3: Commit the paused-workout copy slice**

  Run `git add src/components/DraftResumeBanner.tsx src/components/DraftRecoveryModal.tsx src/context/WorkoutContext.tsx App.tsx && git commit -m "ux: clarify paused workout recovery"`.

### Task 4: Protect Finish and Discard draft cleanup

**Files:**
- Modify: `tests/integration/completion-lifecycle.test.ts`

- [x] **Step 1: Write the failing discard lifecycle test**

  Add native and web cases that start a workout, update it so a persisted draft exists, call `ctrl.discard()`, and assert the controller is idle, the workout is null, `getWorkoutDrafts()` returns an empty list, and workout history remains empty.

- [x] **Step 2: Run the focused test and verify the expected failure**

  Run `npx tsx --test tests/integration/completion-lifecycle.test.ts`.

  Expected result: the new test should fail only if the existing discard implementation does not clear the persisted draft; if it passes immediately, retain it as the regression test and document that it protects already-correct behavior.

- [x] **Step 3: Make the smallest lifecycle correction if required**

  If the focused test exposes a failure, update only the session/store lifecycle path that leaves the draft behind. Preserve the existing failure behavior that keeps a workout active when saving the completed workout fails.

- [x] **Step 4: Run the complete verification suite**

  Run `npm test`, `npm run test:integration`, `npx tsc --noEmit`, `npx expo export --platform web --output-dir /tmp/lifts-web-export-ux-hardening`, `npx expo-doctor`, and `git diff --check`.

  Expected result: 101+ unit tests plus the new unit coverage, all integration tests plus the new discard coverage, zero type errors, successful web export, 21/21 Expo Doctor checks, and no diff errors.

- [x] **Step 5: Commit the lifecycle regression test**

  Run `git add tests/integration/completion-lifecycle.test.ts && git commit -m "test: cover discarded workout draft cleanup"`.

---

## Final Review

- [ ] Confirm `git status --short` is clean and all four commits are on `ux-hardening`.
- [ ] Confirm the native save flow does not alter BackupV2 schema or restore behavior.
- [ ] Confirm drag reordering preserves exercise IDs, sets, targets, notes, rest timers, and active session persistence.
- [ ] Confirm paused-session copy explains why the banner appears after closing an active app.
- [ ] Confirm Finish and Discard leave no draft, while a failed Finish retains an editable active workout.
