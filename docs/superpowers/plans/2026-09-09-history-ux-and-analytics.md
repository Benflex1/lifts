# History, Active Workout, and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining native history correctness issue and add the active-workout, history-editing, analytics, and scalability capabilities identified in the release review.

**Architecture:** Keep data transformations in pure `src/workout` helpers so they are testable without React Native. Keep persistence on the existing `Store.saveCompletedWorkout` transaction path, using the same workout ID for edits. Use existing Expo/React Native primitives for the charts and picker rather than adding a chart dependency.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Node `node:test`, SQLite/IndexedDB stores, existing `ExercisePickerModal` and dialog system.

**Spec:** The six remaining issues reviewed in the current project audit and `ROADMAP.md` Phase 3 chart requirements.

## Global Constraints

- Preserve all completed sets, target reps, notes, RPE, and workout identity during edits and exercise swaps.
- Native history names must remain correct for arbitrary exercise names, including commas.
- Do not add a chart library; render small responsive charts with existing React Native views.
- Do not change stored IDs when editing a historical workout.
- Add failing tests before production behavior changes.

---

### Task 1: Fix comma-containing native history names

**Files:**
- Modify: `tests/integration/native-store.test.ts`
- Modify: `src/database/nativeStore.ts`

**Interfaces:**
- Consumes: native workout history queries and seeded exercises.
- Produces: `WorkoutHistorySummary.exerciseNames` as distinct names in workout order without delimiter parsing.

- [x] **Step 1: Write the failing native regression test**

Create a completed workout using two seeded exercises whose names contain commas, then assert the returned `exerciseNames` array contains each full name exactly once.

- [x] **Step 2: Run the focused test and verify the expected failure**

Run `npx tsx --test tests/integration/native-store.test.ts`; the current comma-delimited query must return fragmented names.

- [x] **Step 3: Replace delimiter aggregation**

Fetch history/count rows without `GROUP_CONCAT`, fetch distinct exercise names with their first order index in a second query, group them by workout ID in TypeScript, and map the full names into each summary.

- [x] **Step 4: Run the native integration suite**

Run `npx tsx --test tests/integration/native-store.test.ts` and confirm all native tests pass.

### Task 2: Add active-workout exercise move and swap operations

**Files:**
- Create: `src/workout/active-exercises.ts`
- Modify: `tests/unit/active-exercises.test.ts`
- Modify: `src/context/WorkoutContext.tsx`
- Modify: `src/screens/ActiveWorkoutScreen.tsx`

**Interfaces:**
- Consumes: `ActiveExercise`, `Exercise`, and the existing session controller.
- Produces: pure `moveActiveExercise` and `replaceActiveExercise` helpers plus context actions wired to the exercise menu and picker.

- [x] **Step 1: Write failing helper tests**

Test moving an exercise up/down, no-op behavior at list boundaries, replacing only the exercise identity/metadata, and preservation of sets, targets, notes, and rest timer.

- [x] **Step 2: Run the focused helper test and verify failure**

Run `npx tsx --test tests/unit/active-exercises.test.ts`; the new helper module must be absent before implementation.

- [x] **Step 3: Implement pure helpers and context actions**

Add `moveExercise(activeExerciseId, direction)` and `swapExercise(activeExerciseId, exercise)` to `WorkoutContext`, updating the active session through the existing controller while preserving any active rest timer metadata.

- [x] **Step 4: Add menu and picker controls**

Add Move Up, Move Down, and Swap Exercise actions to `ActiveWorkoutScreen`; reuse `ExercisePickerModal` in single-select mode for swapping.

- [x] **Step 5: Run unit tests and typecheck**

Run `npx tsx --test tests/unit/active-exercises.test.ts` and `npx tsc --noEmit`.

### Task 3: Add same-ID historical workout editing

**Files:**
- Create: `src/workout/workout-edit.ts`
- Create: `src/components/WorkoutEditModal.tsx`
- Modify: `tests/unit/workout-edit.test.ts`
- Modify: `tests/integration/native-store.test.ts`
- Modify: `src/screens/HistoryScreen.tsx`

**Interfaces:**
- Consumes: `Workout`, completed `WorkoutSet` values, `saveCompletedWorkout`, and the existing dialog flow.
- Produces: an edit normalizer that updates name/notes/set values and recalculates total volume without changing the workout ID.

- [x] **Step 1: Write failing edit-helper tests**

Test applying weight/reps edits to completed sets, retaining untouched fields, recalculating volume, and rejecting negative/non-finite weights or non-positive reps.

- [x] **Step 2: Run the focused edit-helper test and verify failure**

Run `npx tsx --test tests/unit/workout-edit.test.ts`; the helper must be absent before implementation.

- [x] **Step 3: Implement edit normalization**

Add a pure `applyWorkoutEdits` function that returns a copied workout with validated completed sets, updated name/notes, and recalculated volume.

- [x] **Step 4: Implement the edit modal**

Create a compact modal with workout name/notes fields and weight/reps inputs for each completed set, plus Cancel and Save actions.

- [x] **Step 5: Wire History Edit and persistence**

Add an Edit action to expanded history details, call `saveCompletedWorkout` with the same workout ID, refresh the summary/detail, and show an error notification without losing the original data on failure.

- [x] **Step 6: Verify native persistence**

Add a native integration assertion that saving an edited workout under the same ID updates its history volume/set values rather than creating a second history row.

### Task 4: Add analytics charts

**Files:**
- Create: `src/workout/analytics.ts`
- Modify: `tests/unit/analytics.test.ts`
- Modify: `src/screens/AnalyticsScreen.tsx`

**Interfaces:**
- Consumes: completed workouts from `Store.readSnapshot()`.
- Produces: last-eight-week volume points and sorted primary-muscle frequency points.

- [x] **Step 1: Write failing aggregation tests**

Test weekly volume grouping, zero-filled missing weeks, and muscle frequency aggregation across repeated exercises.

- [x] **Step 2: Run the focused analytics test and verify failure**

Run `npx tsx --test tests/unit/analytics.test.ts`; the new analytics module must be absent before implementation.

- [x] **Step 3: Implement pure aggregators**

Add deterministic functions that accept workouts and an optional current date, return bounded chart data, and ignore drafts because drafts are not part of `snapshot.workouts`.

- [x] **Step 4: Render charts in AnalyticsScreen**

Load a snapshot on mount, render a weekly volume bar chart and muscle-frequency bar list above the existing calculators, and show loading/empty states without blocking existing tools.

- [x] **Step 5: Run analytics tests and web export**

Run `npx tsx --test tests/unit/analytics.test.ts` and `npx expo export --platform web --output-dir /tmp/lifts-web-export-final`.

### Task 5: Virtualize History

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`

**Interfaces:**
- Consumes: existing history card rendering and expansion state.
- Produces: a `FlatList`-backed history screen with stable keys, empty state, and existing interaction behavior.

- [x] **Step 1: Replace the list container**

Move the existing history-card body into a `renderItem` callback and replace the outer `ScrollView`/`.map` with `FlatList` using `history` and `item.id` as the key.

- [x] **Step 2: Verify the full matrix**

Run `npx tsc --noEmit`, `npm test`, `npm run test:integration`, `npx expo export --platform web --output-dir /tmp/lifts-web-export-final`, and `npx expo-doctor`.
