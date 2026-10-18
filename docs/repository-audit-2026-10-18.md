# Repository Audit — Lifts

| Field | Detail |
| :--- | :--- |
| Audit date | 2026-10-18 |
| Baseline commit | `377e12a` (`main`) |
| Scope | Application source, database layer, tests, CI, documentation, release tooling, and product completeness |
| Method | Full static review of `src/`, `App.tsx`, `tests/`, `.github/workflows/`, `docs/`, `scripts/`, plus local verification runs |
| Document status | Working document. All findings are `Open` unless a status is explicitly changed below. |

This document is the working backlog for the audit. It records what was found, why it matters, the evidence, the required change, and the acceptance criteria. Update finding statuses as work lands so the document remains a live source of truth.

---

## How to use this document

1. Pick a finding by ID (for example `PERF-04`).
2. Change its `Status` from `Open` to `In progress` in the same pull request that starts the work.
3. Create a focused branch named `fix/<id>-<slug>`, `perf/<id>-<slug>`, or `refactor/<id>-<slug>`.
4. Add or update automated tests before or alongside the implementation.
5. Run the verification protocol in section 12.
6. In the pull request, link the finding ID and record the verification evidence.
7. Change the status to `Done` only when every acceptance criterion is met.

### Severity definitions

| Severity | Meaning |
| :--- | :--- |
| Critical | Directly degrades the core gym-floor interaction or risks losing user data at scale. Fix before new feature work. |
| High | Significant reliability, performance, quality, or accessibility risk. Schedule in the current cycle. |
| Medium | Meaningful maintainability or user-experience cost. Schedule after high-priority work. |
| Low | Hygiene, polish, or opportunistic improvement. Batch with related work. |

### Status definitions

| Status | Meaning |
| :--- | :--- |
| `Open` | Confirmed and not yet started. |
| `In progress` | Actively being implemented. |
| `Blocked` | Waiting on a decision, dependency, or external service. |
| `Done` | Acceptance criteria met and verification evidence recorded. |
| `Deferred` | Intentionally postponed; state the reason and revisit trigger. |

---

## 1. Executive summary

Lifts is a React Native / Expo SDK 57 workout tracker with approximately 39,800 lines of application TypeScript across 142 files, 5 screens, and 40 components. The data layer and release engineering are notably mature. The main risks are concentrated in the UI shell, runtime rendering behavior, missing quality gates, and failure modes that are currently invisible to the user.

### Baseline verification

| Check | Command | Result |
| :--- | :--- | :--- |
| TypeScript | `npx tsc --noEmit` | Pass, 0 errors |
| Unit tests | `npm test` | 478 passed, 0 failed |
| Integration tests | `npm run test:integration` | 142 passed, 0 failed |
| Dependency audit | `npm audit --omit=dev` | 29 vulnerabilities: 1 critical, 19 high, 9 moderate (mostly build tooling) |
| Expo compatibility | `npx expo install --check` | 8 packages behind expected SDK 57 patch versions |
| Web export | `dist/` from 2026-09-07 | 3.4 MB, main JS chunk 3.3 MB (stale local artifact) |

### Scorecard

| Area | Rating | Summary |
| :--- | :--- | :--- |
| Persistence and session core | Strong | Serialized writes, transactional migrations, real session state machine, strong boundary validation |
| Logic-layer tests | Strong | 68 test files and 620+ passing cases across stores, session, backup, CSV import, analytics, and PR logic |
| CI and release engineering | Strong | Typecheck and both test suites in CI; reproducible F-Droid builds; signing and smoke-test checks |
| UI architecture | Needs work | Multiple 1,400-2,900 line files and duplicated platform implementations |
| Runtime performance | Needs work | One critical re-render path, missing indexes, N+1 queries, eager catalog loading |
| Accessibility | Needs work | Incomplete labels/roles on core logging controls; no live regions or value semantics |
| Tooling and quality gates | Weak | No linter, formatter, UI tests, coverage measurement, or dependency automation |
| Product completeness | On track | Core product is feature-rich; publishing, automatic backups, media, and watch apps remain |

### Top five risks

1. **Silent autosave failures** (`REL-02`). The app can look healthy while drafts are not being persisted.
2. **Active logger re-render storm** (`PERF-01`). Every set toggle or keystroke rebuilds the 2,904-line workout screen and all of its rows.
3. **Missing indexes and N+1 history reads** (`PERF-04`, `PERF-05`). Cost grows linearly with history size on every tab activation.
4. **No crash isolation** (`REL-01`). One render exception can blank the entire app with no diagnostics.
5. **Forked native/web stores** (`ARCH-04`, `COR-01`, `COR-02`). Domain rules already diverge between platforms.

### Highest-return actions

1. **Reliability bundle:** root error boundary, visible persistence errors, and a `reportError` helper.
2. **Database bundle:** add indexes and batch the history queries.
3. **Logger bundle:** split active-workout state, memoize rows, debounce notes.
4. **Quality bundle:** ESLint/Prettier, test typechecking, UI tests, coverage, dependency automation.

---

## 2. Strengths to preserve

- **Session state machine.** Explicit phases (`idle`, `starting`, `active`, `finishing`, `discarding`), immutable transitions, serialized writes, and revision guards in `src/workout/session.ts`.
- **Durable write path.** `finishWorkout` writes the workout and deletes the draft in one transaction; writes are serialized by `src/database/writeQueue.ts`.
- **Transactional migrations.** Numbered, idempotent, rollback-safe migrations in `src/database/migrations.ts`, with injected-failure test hooks.
- **Defensive backup import.** Size limits, version handling, deep validation, and atomic collision-safe restore in `src/utils/backup.ts`, `src/utils/restore.ts`, and `src/database/snapshot-validation.ts`.
- **Unusually strong logic tests.** Real SQLite and IndexedDB harnesses in `tests/helpers/storeFixture.ts`; cross-platform backup round trips; full session lifecycle tests.
- **Release engineering.** Version consistency checks, reproducible per-ABI F-Droid builds, signature-copy verification, non-free dependency rejection, and an APK launch smoke test.
- **Existing performance patterns.** Tuned `FlatList` rows, memoized exercise rows, debounced weight/reps inputs, isolated clock context, signature guards, and a cached exercise-visual descriptor.
- **Strict TypeScript.** `strict: true`, zero `@ts-ignore`/`@ts-expect-error`, and zero TODO/FIXME/HACK markers in application code.

---

## 3. Findings summary

| Workstream | Critical | High | Medium | Low | Total |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Reliability (`REL`) | 0 | 2 | 2 | 1 | 5 |
| Performance (`PERF`) | 1 | 5 | 6 | 2 | 14 |
| Architecture (`ARCH`) | 0 | 4 | 6 | 1 | 11 |
| Correctness and parity (`COR`) | 0 | 1 | 2 | 0 | 3 |
| Accessibility (`A11Y`) | 0 | 2 | 3 | 0 | 5 |
| Developer experience (`DX`) | 0 | 2 | 5 | 3 | 10 |
| Product (`PROD`) | 0 | 0 | 4 | 2 | 6 |
| **Total** | **1** | **16** | **28** | **9** | **54** |

---

## 4. Reliability findings

### REL-01 — No root error boundary or crash capture

- **Severity:** High
- **Status:** `Done`
- **Evidence:** The only error boundary is `src/components/ExerciseVisualErrorBoundary.tsx:15-38`, used solely around exercise artwork at `src/components/ExerciseVisual.tsx:303-312`. There is no other `componentDidCatch`, no root boundary, and no crash-reporting dependency.
- **Impact:** A render exception in `ActiveWorkoutScreen`, `AnalyticsScreen`, or any modal blanks the entire application. There is no in-field signal that a crash happened.
- **Required change:** Add a root boundary with a recovery screen (reload, and export data when storage is available), per-tab boundaries, and a persisted last-error record. Add an opt-in crash reporter only if it is consistent with the privacy positioning.
- **Implementation (2026-10-18):** `src/components/AppErrorBoundary.tsx` provides the recovery surface (Try Again, plus Reload App on web) and reports through `reportError` with scope and component-stack context. `App.tsx` wraps the root, each tab pane, and the active logger in boundaries, and installs an error sink that persists the latest record to the `last_app_error` setting (best-effort, deduplicated). Coverage: `tests/unit/app-error-boundary.test.ts` (5 tests), including a real renderer test that throws inside a child and asserts the fallback, and a sink test that captures scope and component stack. A full multi-tab interaction test arrives with the React Native Testing Library harness in Phase 3 (`DX-02`).
- **Done when:**
  - [x] A forced render error in any tab leaves the rest of the shell usable.
  - [x] The error is recorded locally with component and context information.
  - [x] A regression test renders a throwing child and asserts the fallback.

### REL-02 — Persistence failures are invisible to the user

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `SessionState` models `persistenceError` at `src/workout/session.ts:10`, sets it on failed autosave at `src/workout/session.ts:202-215`, and initializes it at `src/context/WorkoutContext.tsx:161`. No UI consumes it. Background flush failures are only logged at `src/context/WorkoutContext.tsx:314` and `:1257`.
- **Impact:** Storage-full, read-only, or permission failures allow the user to keep logging while nothing is saved. An app kill then loses the workout. This is the most dangerous failure mode in the product.
- **Required change:** Surface a persistent, non-dismissible warning banner when `persistenceError` is non-null, with retry and an in-memory export/copy fallback. Do not silently continue destructive navigation.
- **Implementation (2026-10-18):** `retryPersistence` in `WorkoutContext.tsx` re-flushes the draft, and a dedicated `PersistenceErrorContext`/`usePersistenceError` avoids re-rendering the whole provider tree. `src/components/PersistenceErrorBanner.tsx` stays visible above both tabs and the logger, offers Retry plus a copy/share fallback, and is non-dismissible until the flush succeeds. Coverage: `tests/unit/session.test.ts` injects `failDraftSaves`, asserts the error state, and proves a successful retry clears it.
- **Done when:**
  - [x] An injected write failure shows a persistent warning with a retry action.
  - [x] A successful retry clears the warning.
  - [x] The failure path is covered by a test.

### REL-03 — Silent catch blocks and inconsistent error reporting

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** 33 catch blocks match an empty or log-only pattern. Examples include `src/screens/ActiveWorkoutScreen.tsx:202,318,367`, `src/context/WorkoutContext.tsx:355,367,374,381,1245`, and `src/database/webStore.ts:158,1468`.
- **Impact:** Persistence and UI failures disappear into `console.error` or are swallowed entirely. Intentional best-effort cleanup is indistinguishable from real failures.
- **Required change:** Introduce `reportError(error, context)` that logs in development and records a breadcrumb in production. Annotate intentional ignores with a reason.
- **Implementation (2026-10-18):** `src/utils/errorReporting.ts` centralizes `reportError` (development logging, bounded 20-entry breadcrumbs, optional sink, never throws to callers). Session, storage, backup, screen, dialog, and web-store layers now report through it; `bestEffortHaptic` in `src/utils/haptics.ts` names the intentional haptic no-op. Coverage: `tests/unit/error-reporting.test.ts`; a repository grep confirms no unannotated `catch {}`/`.catch(() => {})` remain in `src/`.
- **Done when:**
  - [x] No unannotated empty catch remains in application code.
  - [x] Error reporting is centralized and used by the session, storage, and backup layers.

### REL-04 — Dialog actions swallow failures and show misleading text

- **Severity:** Low
- **Status:** `Done`
- **Evidence:** `src/context/DialogContext.tsx:97-103` logs `"Unable to open health permission settings"` for every action failure and closes the dialog in `finally`, so any thrown error is treated as success.
- **Impact:** Failed actions dismiss the dialog with no user-visible explanation, and the error text is wrong outside the health flow.
- **Required change:** Pass an action label/error message into the dialog options, report failures through the shared helper, and close only on success.
- **Implementation (2026-10-18):** Dialog actions capture failures into `actionError`, keep the dialog open for a retry, and report through `reportError`; `getDialogActionErrorMessage` in `src/utils/dialogAction.ts` produces accurate, action-specific text. Coverage: `tests/unit/dialog-action-error.test.ts`.
- **Done when:** A failing dialog action keeps the dialog open and displays an accurate message.

### REL-05 — Completion update bypasses the session/use-case layer

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `App.tsx:97-100` calls `saveCompletedWorkout(updated)` directly from the shell and awaits it without local error handling. The same screen also updates `completedWorkout` state before the persistence failure can be surfaced.
- **Impact:** A failed post-workout edit leaves the summary modal showing state that was not saved. Cache invalidation and error policy live outside the normal write path.
- **Required change:** Route the update through a completion use case that owns persistence, error display, and cache invalidation.
- **Implementation (2026-10-18):** `saveCompletedWorkoutEdit(workout, save)` in `src/workout/completion.ts` owns the write and error reporting; `App.tsx` updates summary and history state only after it resolves, and the summary modal keeps its own error message on failure. Coverage: `tests/unit/completion.test.ts`.
- **Done when:** A failed update shows an error and does not present unsaved state as saved.

---

## 5. Performance findings

### PERF-01 — Active logger re-renders on every state change

- **Severity:** Critical
- **Status:** `Done`
- **Evidence:** `ActiveWorkoutScreen.tsx:91-123` destructures 32 fields from `useWorkout()`. `WorkoutContext.tsx:1328-1353` includes `sessionState.workout` in the default context value. Every mutation calls `controller.update()`, which calls `notify()` synchronously at `src/workout/session.ts:145`, creating a new workout object and context value. The screen renders all exercise cards and set rows with `.map()` at `ActiveWorkoutScreen.tsx:751` and `:971`.
- **Impact:** Every set toggle, RPE change, weight commit, and note keystroke rebuilds the 2,904-line screen and all nested rows. This is the core gym-floor interaction and the highest-impact performance issue in the app.
- **Required change:** Move `activeWorkout` into its own context or expose a selector-style subscription. Extract and memoize `ExerciseCard` and `SetRow`, pass primitive props and stable callbacks, and split state from actions.
- **Implementation (2026-10-18):** The card and row were extracted into memoized components (`src/components/ActiveExerciseCard.tsx`, `src/components/ActiveSetRow.tsx`; the shared style block moved to `src/screens/activeWorkoutStyles.ts`). Their comparators compare PR badges structurally through `isSameSetPRResult` (`src/workout/pr.ts`) because PR evaluation rebuilds result objects on every pass. All callbacks handed to cards are stable: `WorkoutContext` exposes permanent action-proxy identities (`stableActions`) and the screen wraps `handleToggleSetWithHaptics`, `handleApplyPreviousStats`, `openSetOptions`, and `handleInputFocus`/`ensureInputVisible` in `useCallback` with refs to the latest workout data. `activeWorkout` was deliberately not moved into a separate context: the screen still re-renders when the workout changes (it owns the header and list state), but every card and row now skips unless its own data changed. Coverage: `tests/unit/active-workout-memoization.test.ts` — six render-counter tests driving the production `React.memo` comparators; toggling a set re-renders only its card and only that row, identical parent renders skip everything, and rebuilt PR summaries skip cards whose badges are unchanged.
- **Done when:**
  - [x] Toggling one set re-renders only the affected row and its card, verified with React DevTools Profiler or a render counter. (`tests/unit/active-workout-memoization.test.ts` uses a render counter.)
  - [x] Typing in a note does not re-render every exercise card.
  - [x] A regression test or documented profiling scenario exists for set toggling.

### PERF-02 — Exercise notes commit on every keystroke

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `ActiveWorkoutScreen.tsx:944-949` calls `updateExerciseNotes(activeEx.id, txt)` from `onChangeText`. That reaches `WorkoutContext.tsx:1138-1149`, then `session.ts:128-167`, marking the draft dirty and triggering a full autosave serialization.
- **Impact:** Typing is coupled to a full context update and a `JSON.stringify` of the entire workout on the autosave path (`nativeStore.ts:1248-1257`). On lower-end devices this is the classic typing-lag pattern.
- **Required change:** Keep note text in local component state, debounce the session commit by roughly 250 ms, and flush on blur or unmount. Reuse the pattern already implemented in `WeightInput`/`RepsInput`.
- **Implementation (2026-10-18):** `src/components/ExerciseNoteInput.tsx` holds the text in local state and commits through `createDebouncer` (`NOTE_COMMIT_DEBOUNCE_MS = 250`), flushing on blur, exercise change, and unmount; the session is only reached from the flush path. Coverage: `tests/unit/exercise-note-input.test.ts` (keystrokes commit only after the debounce fires; blur and unmount flush the pending value; external updates are adopted without re-committing) and `tests/unit/debounce.test.ts` for the debouncer itself.
- **Done when:**
  - [x] Keystrokes do not increment the session revision until the debounce fires.
  - [x] Blur and unmount always flush the latest value.
  - [x] Note persistence is covered by a test.

### PERF-03 — Trophy Room search recomputes all history on every keystroke

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `RecordsView.tsx:199-209` feeds `setTrophySearch` directly at `AnalyticsScreen.tsx:542-543`. The `trophySummary` memo at `AnalyticsScreen.tsx:228-252` includes `trophySearch` in its dependencies and calls `buildTrophyRoomSummary`, which walks every workout, exercise, and set at `src/workout/trophy-room.ts:152-188`.
- **Impact:** Each typed character re-aggregates the entire training history and re-renders the records subtree.
- **Required change:** Debounce the search input (150-250 ms) and compute the aggregate once. Filter the precomputed record list by query instead of re-running aggregation.
- **Implementation (2026-10-18):** `RecordsView` keeps the input text in local state and commits through a 200 ms `createDebouncer` (`SEARCH_DEBOUNCE_MS`). `AnalyticsScreen.recordsOverview` no longer depends on the query — `buildTrophyRoomSummary` runs only when history, catalog, gyms, scopes, or the gym filter change — and `trophySummary` narrows the precomputed records with the order-preserving `filterTrophyRecords` (`src/workout/trophy-room.ts`). Coverage: `tests/unit/debounce.test.ts`, a filter-equivalence test in `tests/unit/trophy-room.test.ts`, and `tests/unit/records-row-memoization.test.ts`.
- **Renderer verification (2026-10-18, DX-02):** `tests/unit/perf-03-records-aggregate.test.ts` mounts `RecordsSection`, spies on `buildTrophyRoomSummary`, commits search text through the 200 ms debounce, and asserts the aggregate stays at one call while rows filter and reach the empty state.
- **Done when:**
  - [x] Typing only filters an existing record list.
  - [ ] `buildTrophyRoomSummary` is not called per keystroke, verified with a spy or render-count test. — deferred to `DX-02`; verified structurally today (`recordsOverview` deps exclude `trophySearch`).

### PERF-04 — Missing indexes on hot database columns

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `src/database/migrations.ts` creates only two indexes: `gyms_one_default` at line 287 and `health_sync_records_status_idx` at line 357. Queries that scan full tables include `nativeStore.ts:1338-1339` (`workouts` ordered by start time), `nativeStore.ts:1109-1120` (join by `exercise_id`), and `nativeStore.ts:927-943` (bulk detail reads).
- **Impact:** History, PR, and analytics queries degrade as workout history grows. The cost is paid on tab activation and on every exercise-add flow.
- **Required change:** Add one numbered migration with indexes for `workouts(in_progress, start_time DESC)`, `workout_exercises(workout_id)`, `workout_exercises(exercise_id)`, and `exercise_sets(workout_exercise_id)`. Add equivalent IndexedDB indexes on web where the access pattern warrants it.
- **Implementation (2026-10-18):** Migration 9 adds `idx_workouts_in_progress_start`, `idx_workout_exercises_workout`, `idx_workout_exercises_exercise`, and `idx_exercise_sets_workout_exercise`. Coverage: rollback-injection test in `tests/integration/native-store.test.ts` and `EXPLAIN QUERY PLAN` assertions in `tests/integration/native-query-performance.test.ts`. Web IndexedDB indexes are deferred to `PERF-14` (delivered there: `startTime` index plus cursor-based history reads): current web reads are `getAll`-based, and the `PERF-05` batching already removed the per-workout reads that IndexedDB indexes would accelerate.
- **Done when:**
  - [x] The migration applies cleanly and idempotently on both fresh and existing databases.
  - [x] `EXPLAIN QUERY PLAN` confirms the hot queries use the new indexes.
  - [x] A migration regression test covers upgrade from the previous version.

### PERF-05 — N+1 history queries and redundant snapshot reads

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `nativeStore.ts:1168-1175` loops `loadCompletedWorkoutsForExercise` for each exercise ID; each call runs the full join at `:1109-1122`. `webStore.ts:1345-1351` implements `readSnapshot` by calling `getWorkoutDetail` once per history row. Callers include `ActiveWorkoutScreen.tsx:234-264`, `HistoryScreen.tsx:107-110`, `WorkoutSummaryModal.tsx:79-82`, and `AnalyticsScreen.tsx:129`.
- **Impact:** Query count grows linearly with the number of exercises or workouts. On web this is an IndexedDB round trip per workout; on native it is a join per exercise.
- **Required change:** Implement a batched `WHERE exercise_id IN (...)` query chunked with the existing `selectInChunks` helper and group rows in JavaScript. On web, use IDB indexes and a cursor, or one transaction that loads the needed records.
- **Implementation (2026-10-18):** Native now loads previous sets in one batch per chunk (`selectInChunks`, 500-parameter cap) instead of one join per exercise. Web `readSnapshot`/`getWorkoutHistory` read the workouts store once via `getAllWorkoutsSorted()` instead of one detail read per workout. Coverage: a constant query-count test for the native loader, and `tests/integration/web-snapshot-bulk.test.ts`, which was watched failing with four per-workout detail reads before the change.
- **Done when:**
  - [x] One exercise batch produces one query per chunk, not one query per exercise.
  - [x] Web snapshot reads do not issue one detail read per workout.
  - [x] A test counts database calls or asserts the batched result matches the previous behavior.

### PERF-06 — 758 KB exercise catalog is loaded eagerly at module scope

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `src/database/defaultExercises.json` is 758,757 bytes. `src/database/seedData.ts:6-19` requires it at module scope, maps all records, and builds a `Map` at import time. Both `nativeStore.ts:18` and `webStore.ts:4` import `seedData`.
- **Impact:** The catalog is parsed and transformed on every launch even after seeding is complete, inflating startup time and the JS bundle.
- **Required change:** Load the JSON lazily only when seeding or synchronizing a new catalog version, or read the catalog from SQLite after the first seed. Consider trimming unused fields from the bundled payload.
- **Implementation (2026-10-18):** `seedData.ts` no longer evaluates the catalog at module scope: `getDefaultExercises()` parses the JSON and applies the MuscleWiki guide mappings on first call (cached), and `getBundledExercise` builds its lookup map from the same lazy list. Every consumer now resolves the catalog inside the function that actually needs it: native `synchronizeDefaultExercises`/`seedDefaultExercises` fetch it only after the stored `exercise_catalog_version` check fails, web `maybeSynchronize` only after the same check, `exercise-links.ts` and `exercise-media.ts` replaced their import-time ID sets with lazy getters, and the CSV importer and backup parser call the getter inside their functions.
- **Verification:** `tests/unit/seed-data.test.ts` asserts `defaultExercises.json` stays out of `require.cache` until the first use, then existing catalog/seeding tests exercise the lazy path. Measured on Node 22 with warm tsx caches (V8; Hermes pays more for the same JSON.parse): `seedData` module evaluation 9.6–9.8 ms → 6.2–6.3 ms import with the catalog parsed only on first use (~3.2 ms, ~0.001 ms when cached); the `exercise-media` startup import chain 11.4–15.9 ms → 8.1–8.3 ms; `expo export --platform web` total bundle 3,943,045 B → 3,943,213 B (+168 B, the wrapper code). Bundle bytes are intentionally unchanged because the catalog must still ship for first-launch seeding — the win is that launches with the current catalog version already applied never evaluate it.
- **Done when:**
  - [x] The catalog is not evaluated on launches where the bundled catalog version is already applied.
  - [x] Bundle size and cold-start time are measured before and after.
  - [x] Catalog seeding and upgrade tests still pass.

### PERF-07 — Analytics hydrates the full snapshot before checking for changes

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `AnalyticsScreen.tsx:126-142` calls `store.readSnapshot()` at line 129, then builds a signature and returns early at line 142 if it is unchanged. `AnalyticsScreen.tsx:133` also calls `getAllExercises()` even though the snapshot already contains exercises. `useReloadOnActivate` triggers this on every return to the tab at line 185.
- **Impact:** The optimization skips recomputation but not the expensive full hydration, so returning to Progress is never cheap.
- **Required change:** Fetch a cheap revision/count first, or add a store revision counter. Reuse `snapshot.exercises` and share a snapshot cache across tabs.
- **Implementation (2026-10-18):** `Store` gained an optional `getDataRevision()` (`src/database/contract.ts`): the native store returns `SELECT total_changes()` and the web store keeps a monotonic counter incremented inside `verifyAndRenewLease` — the funnel every one of its 21 write paths passes through — so lease heartbeats do not count. `loadAnalytics` checks the revision before `readSnapshot()` and returns early when it matches the previous load, and it reuses `snapshot.exercises` instead of calling `getAllExercises()`. The old JSON signature survives only as the fallback for stores without a counter. Coverage: `tests/integration/store-revision.test.ts` asserts on both platforms that reads keep the revision stable and that a write advances it.
- **Done when:**
  - [x] A no-change tab activation performs only a cheap revision check.
  - [x] No duplicate exercise catalog read occurs during analytics load.

### PERF-08 — Search re-normalizes the entire catalog per query

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `src/utils/search.ts:145-151` normalizes name, muscles, equipment, and category for every exercise on every call, then scores and sorts all candidates at `:180-207`. The empty-query branch sorts the full list at `:121-131`.
- **Impact:** Four or more regex-based normalizations per exercise per keystroke across 876 exercises. The 120 ms input debounce reduces but does not remove the cost.
- **Required change:** Precompute a normalized haystack and staple score once per catalog version, and precompute the empty-query top-100 list.
- **Implementation (2026-10-18):** `src/utils/search.ts` caches the per-catalog normalization index in a `WeakMap` keyed by the catalog array and the empty-query top-100 list by catalog identity; cached lists are sliced on return so callers cannot mutate them. Coverage: `tests/unit/search.test.ts` — "normalizes each catalog record once per catalog version" counts `String.prototype.toLowerCase` calls (first query > 300, second query ≤ 5) for both the scored path and the empty-query path, alongside ranking and filter-parity tests.
- **Done when:**
  - [x] Search calls do not re-normalize unchanged catalog records.
  - [x] A benchmark or test documents the improvement.

### PERF-09 — Records list is not virtualized

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `RecordsView.tsx:255-286` renders `records.map(...)` inside a `ScrollView`, mounted from `AnalyticsScreen.tsx:527-546`.
- **Impact:** Users with many trained exercises mount every record row at once, and the whole subtree re-renders on each search update.
- **Required change:** Make the records list a `FlatList` with the header content in `ListHeaderComponent`, or memoize the row component and bound the rendered list.
- **Implementation (2026-10-18):** The records branch is a `FlatList` with the card header and chip rows in `ListHeaderComponent` (only that branch dropped the outer `ScrollView`; the header scrollers keep it), configured with `initialNumToRender={12}`, `maxToRenderPerBatch={12}`, and `windowSize={7}`. `RecordRow` is extracted and memoized so a filtered list only re-renders rows whose own props changed. Coverage: `tests/unit/records-row-memoization.test.ts` — replacing one record re-renders only that row, and filtering the list leaves unchanged middle rows untouched.
- **Renderer verification (2026-10-18, DX-02):** `tests/unit/perf-09-records-virtualization.test.ts` mounts the list with 500 synthetic records and asserts exactly the 12-row initial window renders; React Native's own list is Flow-typed source that Node cannot load, so the mount count is measured through react-native-web's virtualized list under jsdom, and the native element's window configuration (initialNumToRender 12, maxToRenderPerBatch 12, windowSize 7) is asserted directly on the rendered `FlatList`.
- **Done when:**
  - [ ] Only visible rows are mounted for a 500-record synthetic dataset. — deferred to `DX-02`; the `FlatList` windowing configuration is in place.
  - [x] Search updates do not re-render unrelated rows.

### PERF-10 — Exercise detail runs the same full-history query twice

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `ExerciseDetailModal.tsx:155-163` calls `getExerciseStats`, `getExerciseGymScope`, and `getCompletedWorkoutsForExercise` in parallel. `getExerciseStats` at `nativeStore.ts:1177-1182` already calls `loadCompletedWorkoutsForExercise`.
- **Impact:** Opening a detail modal doubles the most expensive query, then walks the history a third time for the podium.
- **Required change:** Return raw workouts from the stats call or compute stats from the already-loaded history.
- **Implementation (2026-10-18):** New `src/workout/exercise-detail.ts#loadExerciseDetailData` loads the completed history once and shares it: `collectExerciseHistory` (`exercise-history.ts`) feeds the single-pass stats reducers in `gym-records.ts` (`summarizeStatsForEntries`/`summarizeDualStatsForEntries`) and `buildExercisePodium` (`pr.ts`). `ExerciseDetailModal` now only imports `getStore` and `reassignExerciseHistory` from the database layer. Coverage: `tests/integration/exercise-detail-query.test.ts` — one history query where the previous modal path issued two, with identical stats and podium results.
- **Done when:** Opening the modal issues one history query and performs one aggregation pass. (One query per open is asserted in the integration test; the collector is a single pass over the shared history that feeds stats and podium.)

### PERF-11 — Eager screen imports and permanently mounted tabs

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `App.tsx:15-19` statically imports all screens. `App.tsx:48-54` mounts a tab on first visit, and `App.tsx:127-138` keeps visited tabs mounted under `display: none`.
- **Impact:** Analytics and its chart stack are in the initial bundle. Hidden tabs retain state and subscriptions, and memory grows with each visited tab.
- **Required change:** Use `React.lazy` plus `Suspense` for Analytics and History, and consider unmounting or freezing heavy tabs after a timeout. Keep the fast first-switch behavior where it matters.
- **Implementation (2026-10-18):** `App.tsx` now loads `HistoryScreen` and `AnalyticsScreen` through `React.lazy` with a shared `Suspense` fallback, and warms both modules 1.5 s after startup so the first visit does not wait on the network while the initial bundle still excludes them. Because `ExerciseDetailModal` (reachable from eager screens) also renders the progression chart, `ProgressionCurveView` is `React.lazy`-loaded inside the detail modal as well. Hidden-tab retention moved to `src/hooks/useTabRetention.ts`: `workout` and `exercises` stay mounted for instant switching, while `history` and `analytics` are unmounted once they have been hidden for five minutes (30 s sweep, clock runs while the workout logger covers the tabs); revisiting a released tab mounts it fresh.
- **Verification:** `npx expo export --platform web` main JS 3,914,358 B → 3,736,947 B (−177,411 B); new async chunks `AnalyticsScreen-*.js` (129,981 B), `HistoryScreen-*.js` (35,098 B), `__common-*.js` (10,951 B). Analytics-only markers (`No progression data yet`, `RecordsView`, `Trophy room`, `Import workout data`) are absent from the initial bundle and present in the chunks. `tests/unit/tab-retention.test.ts` covers mount-on-visit, release at the retention boundary, cancel-on-return, non-evictable tabs, and eviction while the logger is open. Full suites: 173 integration / 543 unit.
- **Done when:**
  - [x] The initial web bundle excludes the Analytics chart module.
  - [x] Hidden-tab memory does not grow without bound during a long session.

### PERF-12 — Rest timer wakes the JS thread four times per second for a 1 Hz UI

- **Severity:** Low
- **Status:** `Done`
- **Evidence:** `WorkoutContext.tsx:387-393` runs a 250 ms interval and bails out of the state update when the displayed second has not changed.
- **Impact:** Four wakeups per second while resting, often with the screen dimmed, for a display that only changes once per second.
- **Required change:** Tick every 1000 ms aligned to `endsAt`, or self-reschedule a timeout to the next integer second.
- **Implementation (2026-10-18):** `WorkoutContext` replaces the interval with a self-scheduling `setTimeout` driven by the new `nextRemainingTickDelay` helper (`src/utils/timer.ts`), which aligns each wake-up to the next integer second of the remaining time and to the end of the rest. Coverage: `tests/unit/timer.test.ts` (`nextRemainingTickDelay`).
- **Done when:** The timer display remains accurate across backgrounding with one update per second. (Each tick re-arms from `computeRemaining`, so a foreground return shows the correct second immediately; the displayed second changes once per wake-up.)

### PERF-13 — Low-cost render and parsing issues

- **Severity:** Low
- **Status:** `Done`
- **Evidence:** `ConfettiCelebration.tsx:53-92` builds particles and assigns `particlesRef.current` during render. `ExerciseVisual.tsx:105-109` parses a 12.7 KB inline SVG on every plank visual mount.
- **Impact:** Render-phase side effects double under StrictMode; repeated SVG parsing adds avoidable work.
- **Required change:** Use a lazy `useState`/`useMemo` initializer for particles and hoist or asset-load the SVG.
- **Implementation (2026-10-18):** Confetti particles use a lazy `useState` initializer so nothing mutates a ref during render. `ConfettiCelebration` and `ExerciseVisual` share `getParsedSvgAst` (`src/utils/svgAstCache.ts`), a cache that parses each asset once per process and serves the AST to `SvgAst`. Coverage: `tests/unit/confetti-celebration.test.ts` and `tests/unit/svg-ast-cache.test.ts`.
- **Done when:** No ref mutation occurs during render and the plank visual parses once per process. (Asserted by "builds particles once per mount" and "parses each asset once per process".)

### PERF-14 — Web store scans and sorts full object stores in memory

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `webStore.ts:964-971` calls `getAll()` and sorts workouts in memory; the same pattern appears at `:1072-1113` and in `readSnapshot` at `:1345-1351`. There are no IndexedDB indexes on `startTime` or completion state.
- **Impact:** Large histories pay a full-store read and sort on web, and the N+1 detail loop compounds it.
- **Required change:** Add IDB indexes and use cursors or key ranges for history queries; align behavior with the native store.
- **Implementation (2026-10-18):** IndexedDB schema v5 adds a `startTime` index on `workouts` (created with new stores and added during the upgrade transaction for existing databases). `getAllWorkoutsSorted` — shared by `getWorkoutHistory` and `readSnapshot` — now walks that index with a backwards cursor instead of `getAll()` plus an in-memory sort, and `getCompletedWorkoutsForExercises`, `getPreviousSetsForExercise`, and `getExerciseStats` stream through the same reader. In-progress records are skipped per record while the cursor arrives (legacy rows may lack the marker, so an index on the flag could not be used safely), and equal-timestamp runs are re-sorted with `compareBinaryStrings` so the ID tie-break matches native's `id DESC` (SQLite BINARY) rather than IndexedDB's code-unit key order. Ordering by timestamp now also matches native's `start_time DESC` instead of the previous `localeCompare` sort.
- **Verification:** New contract scenario "orders completed history by newest start time, then descending workout ID" runs against both stores; `web-store.test.ts` asserts the v5 upgrade adds the index and that `getWorkoutHistory` succeeds with `IDBObjectStore.getAll` patched to throw; `web-snapshot-bulk.test.ts` now asserts the snapshot path opens exactly one `startTime` cursor and issues zero per-workout `get`/`getAll` calls. Full suites: 173 integration / 538 unit.
- **Done when:**
  - [x] History reads use an index and do not materialize the entire store when only a page is needed.

---

## 6. Architecture and maintainability findings

### ARCH-01 — ActiveWorkoutScreen is a 2,904-line component

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `src/screens/ActiveWorkoutScreen.tsx` spans lines 87-2904, with 24 `useState` calls, 6 effects, and zero `useCallback`. Three inline modals occupy roughly lines 1362-2013.
- **Impact:** Every feature change touches one of the highest-risk files in the app. Handlers are recreated on every render, defeating child memoization.
- **Required change:** Extract a controller hook/reducer for screen state, `WorkoutHeader`, `ExerciseStream`/`ExerciseCard`, and the three modals. Target under 600 lines for the screen and under 300 lines per presentational child.
- **Implementation (2026-10-18):** `ActiveWorkoutScreen.tsx` dropped from 1,629 (already trimmed by Phases 0-1) to 115 lines and is now pure composition. New `src/screens/activeWorkout/` module: `useActiveWorkoutController.ts` owns all screen state (24 `useState`), derived data (superset metadata, prior-record index, PR summary, live volume/set counts, displayed gym), the 6 effects (PR history load, PR celebration, Android back, gym-tracking reset, keyboard show/hide, ref sync), and every handler, including the ones previously inlined into the menus; `WorkoutHeader.tsx` (131 lines) keeps `LiveWorkoutClock` isolated on the clock context; `ExerciseStream.tsx` (176) owns superset headers/connectors, cards, empty state, and the add button; `SetOptionsModal.tsx` (291), `ExerciseOptionsMenu.tsx` (206), and `WorkoutOptionsMenu.tsx` (130) are the three extracted menus; `activeWorkoutLogic.ts` (122) holds the pure helpers (live stats, completed-set IDs, prior-workout collection/index, displayed-gym resolution, previous working set, drop suggestions, move guards). The unstable `useCallback`s (`handleToggleSetWithHaptics`, `handleApplyPreviousStats`, `openSetOptions`, `handleInputFocus`) were preserved so memoized cards keep their identity guarantees; dead bindings (`linkSuperset`, `startRestTimer`, `menuNextExercise`) were removed with the move.
- **Verification:** `npm run typecheck`, `npm run typecheck:tests`, 559 unit (543 + 16 new focused tests in `tests/unit/active-workout-logic.test.ts` and `tests/unit/active-workout-components.test.ts`) / 173 integration tests green; `npx expo export --platform web` succeeds.
- **Done when:**
  - [x] The screen is under 600 lines and the extracted modules have focused tests.
  - [x] No behavior regressions in the session, draft, or completion integration tests.

### ARCH-02 — AnalyticsScreen is a 2,031-line component with 32 state variables

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `src/screens/AnalyticsScreen.tsx` mixes snapshot loading (`:126-179`), backup save/import (`:282-356`), CSV import and remapping (`:357-513`), and charts/records rendering (`:515-1292`).
- **Impact:** Unrelated features share one state surface and render tree. A backup or CSV change can affect chart rendering and vice versa.
- **Required change:** Extract `useAnalyticsData`, `useBackupTransfer`, `useCsvImportFlow`, `ProgressCharts`, `RecordsSection`, and `DataTransferSection`.
- **Implementation (2026-10-18):** All six pieces exist and Analytics composes them: `src/hooks/useAnalyticsData.ts` (snapshot query, derived overview aggregates, progression/dashboard filter state), `src/hooks/useBackupTransfer.ts` (save/share/restore commands), `src/hooks/useCsvImportFlow.ts` (file pick, preview recomputation, exercise remapping, confirm), and `src/screens/analytics/{ProgressCharts,RecordsSection,DataTransferSection}.tsx`. `AnalyticsScreen.tsx` dropped from 1,954 to 368 lines and now owns only the section switcher, the 1RM/plate calculator tools, and composition; its per-section state (32 variables) moved into the owning hook or section. Dead trophy-podium imports and the unused `detailPodium` state were removed with the split; the four CSV handlers collapsed into one `recomputePreview` helper with the original log labels preserved.
- **Verification:** `npm run typecheck`, `npm run typecheck:tests`, 173 integration / 543 unit tests green; `npx expo export --platform web` succeeds with the split screen still inside the `AnalyticsScreen` async chunk.
- **Done when:** Each domain has a focused hook or component and Analytics composes them.

### ARCH-03 — WorkoutProvider is a 1,404-line application service

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `src/context/WorkoutContext.tsx` owns controller subscription, elapsed ticker, AppState flush, rest timers and notifications, draft recovery, gym switching, health sync, roughly two dozen mutations, and provider composition.
- **Impact:** It is one of the highest-churn files in the app and any change risks timers, persistence, notifications, or health export.
- **Required change:** Keep the provider as composition only. Extract `useSessionControllerBridge`, `useRestTimerEngine`, `useDraftRecovery`, `useGymSwitcher`, `useHealthSyncBridge`, and `useWorkoutMutations`.
- **Implementation (2026-10-18):** `WorkoutContext.tsx` dropped from 1,449 to 286 lines and is composition only. `src/context/workout/` now holds `useSessionControllerBridge` (controller creation/subscription, the 1 s workout clock, AppState background flush), `useRestTimerEngine` (countdown state, second-aligned ticker, 3-2-1 and finish haptics, notification handoff, draft restore), `useGymSwitcher` (list/selection, mid-workout switch, refresh resolution), `useExerciseAccordion` (expansion state), `useDraftRecovery` (draft list, resume/discard flows), `useHealthSyncBridge` (settings-loading buffer and drain), and `useWorkoutMutations` (start/complete, structural exercise and set edits, supersets, completed-set flow). The context slices (`useWorkoutActions`, `useWorkoutClock`, `useRestTimer`, `useWorkoutGyms`, `useIsWorkingOut`, `usePersistenceError`) and the `finishWorkoutWithHealthSync` test seam are unchanged.
- **Verification:** The provider-level harness test `tests/unit/workout-health-sync.test.ts` (9 tests, including completion ordering and the settings-buffer drain) is green; 173 integration / 543 unit tests pass with both typechecks.
- **Done when:** Each concern has a dedicated hook and the provider is primarily wiring.

### ARCH-04 — Native and web stores are forked implementations with behavioral drift

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `nativeStore.ts` (1,569 lines) and `webStore.ts` (1,535 lines) expose 44 identically named methods and duplicate normalization, merge, and deletion logic. Known divergence: native gym deletion rejects in-progress references at `nativeStore.ts:252-294`, while web reassigns workouts at `webStore.ts:534-588`. Web's `(workout as any).inProgress` filter at `webStore.ts:1112` is dead because the field is not in the `Workout` type.
- **Impact:** Every domain rule must be implemented and tested twice. Platform parity bugs are likely to recur.
- **Required change:** Extract a storage-agnostic `StoreCore` for normalization, validation, merge planning, and deletion policy. Keep the SQL and IndexedDB files as thin adapters. Add a shared contract suite that runs identical scenarios against both stores.
- **Implementation (2026-10-18):** New `src/database/storeCore.ts` owns the shared domain logic: record normalizers (`normalizeExerciseRecord`, `normalizeWorkoutRecord`, `normalizeRoutineRecord`, `normalizeDraftRecord`), snapshot canonicalization (`canonicalizeSnapshotGyms`), conflict validation (`validateSnapshotMergeConflicts` — the stricter native checks now also guard web), snapshot merge planning (`planSnapshotMerge`, which returns the exact records to persist in dependency order), and gym deletion policy (`planGymDeletion` + `pruneGymFromScopes`). Both adapters deleted their private copies and now only read/write storage around these plans; `DEFAULT_GYM_ID` now lives in `gym-profile.ts`. The COR-01 completion marker is applied inside the merge plan so imported records are completed on both platforms. Web also gained native's duplicate-scope and unknown-exercise merge validation for free.
- **Verification:** `tests/helpers/storeContract.ts` + `tests/integration/store-contract.test.ts` run 7 identical scenarios on both platforms (seed idempotency, workout round-trip, draft round-trip, gym-deletion policy incl. active drafts and in-progress records, merge import + scope conflicts). Full suites still pass after the extraction (167 integration / 526 unit). One web-only test message assertion (`Replacement gym…`) was aligned to the shared policy message.
- **Done when:**
  - [x] Shared domain logic lives in one module.
  - [x] The contract suite runs against both stores in integration tests.
  - [x] The known gym-deletion divergence is resolved or explicitly documented as intentional.

### ARCH-05 — Exercise picker and Exercises screen duplicate roughly 200 lines

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `src/components/ExercisePickerModal.tsx:32-240` and `src/screens/ExercisesScreen.tsx:33-248` duplicate filter constants, custom-exercise state, and save/edit handlers. Minor differences are limited to the row press behavior.
- **Impact:** Validation and alias fixes must be made twice and can drift.
- **Required change:** Extract `CustomExerciseModal` and shared filter options; keep the picker and screen as thin compositions.
- **Implementation (2026-10-18):** New `CustomExerciseModal` (`src/components/CustomExerciseModal.tsx`) owns the create/edit form: state seeding, alias-aware prefill, validation, persistence, and error reporting through one code path. New `src/workout/exercise-options.ts` owns the filter lists (`MUSCLE_GROUPS`, `EQUIPMENT_LIST`, custom pill options) and the normalization helpers (`resolveCustomMuscle`, `resolveCustomEquipment`, `customExerciseDefaults`). `ExercisePickerModal` and `ExercisesScreen` now mount the same modal and keep only their post-save behavior (the picker updates its selection or returns the created exercise; the screen reloads the catalog and refreshes the open detail), deleting ~190 duplicated lines.
- **Verification:** `tests/unit/custom-exercise.test.ts` covers resolver mapping, prefill defaults, and the create/edit/empty-name save flows through the shared modal (5 tests). Full suites: 170 integration / 537 unit.
- **Done when:**
  - [x] Custom-exercise behavior is implemented once and covered by shared tests.

### ARCH-06 — No repository/query layer; screens fetch directly

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** The audit found roughly 29 direct `getStore()`/database calls in screens and modals, including `AnalyticsScreen.tsx:128,321,370,405,435,453,471,489`, `HistoryScreen.tsx:165`, `ExercisesScreen.tsx:186`, and `WorkoutScreen.tsx:65-85`.
- **Impact:** Loading, caching, error policy, and invalidation are reimplemented per screen, so cross-screen consistency depends on remembering to refresh.
- **Required change:** Introduce domain hooks or a repository layer (`useWorkoutHistory`, `useAnalyticsSnapshot`, `useExerciseCatalog`) that own caching, invalidation, and errors. Keep `Store` as the persistence adapter.
- **Implementation (2026-10-18):** Five domain hooks now own all screen query state: `useWorkoutHistory` (history list, gyms, lazily cached details, eager PR badges plus per-workout PR refresh, and an `updateWorkout` cache upsert), `useAnalyticsSnapshot` (workouts, catalog, gyms, scopes, weekly volume, muscle frequency, suggested progression pick), `useExerciseCatalog` (filtered catalog that preserves array identity when a result set is unchanged), `useRoutines` (routines + week snapshot), and `useGymProfiles` (lazily loaded gym list for scope dialogs). Each hook owns its loading/error policy, request ordering, and reload-on-activation with a revision-gated skip. `HistoryScreen`, `AnalyticsScreen`, `ExercisesScreen`, and `WorkoutScreen` were converted to consume them. Remaining direct `getStore()` calls in `AnalyticsScreen` are imperative command flows (backup export/restore, CSV import planning) that move into command modules with the ARCH-02 decomposition; one-off pre-action reads (fresh gym list before starting a workout, per-exercise scope before opening the scope dialog) also stay imperative.
- **Verification:** `tests/unit/domain-hooks.test.ts` mounts each hook through a test-renderer harness and asserts load counts, revision-gated activation skips, post-write refreshes, detail caching, filter re-queries, and catalog array-identity preservation (6 tests). Full suites: 170 integration / 532 unit.
- **Done when:**
  - [x] Screens consume domain hooks rather than the raw store.

### ARCH-07 — No store revision or reliable cache invalidation

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `useReloadOnActivate` fires a per-tab emitter at `App.tsx:73-83`. Analytics and History use hand-built JSON signatures (`AnalyticsScreen.tsx:136-143`, `HistoryScreen.tsx:142-156`) that omit exercise names and scope contents.
- **Impact:** Renaming a custom exercise or changing a scope can leave charts and PR badges stale until another data change or a full reload.
- **Required change:** Add a monotonic `dataVersion` incremented on successful writes, expose it through the store, and invalidate domain queries against it.
- **Implementation (2026-10-18):** `Store.getDataRevision()` is now the single invalidation signal. Native keeps `SELECT total_changes()`; the web store's counter moved from tab-local memory onto the persisted writer-lease record in the `metadata` store — bumped by the same single write that renews the lease in every mutating operation — so a read-only tab observes writes made by the lease holder, and lease handovers preserve the count. `HistoryScreen` and `AnalyticsScreen` replaced their hand-built JSON signatures with a revision check performed before any hydration; stores without a counter always reload instead of trusting a partial signature.
- **Verification:** `store-revision.test.ts` asserts reads keep the revision stable, writes advance it, and a second tab on the same database sees the writer's revision; the store contract suite adds "advances the data revision for scope and catalog writes" on both platforms, covering the two writes named in COR-03.
- **Done when:** Any write that affects analytics or PRs increments the version and refreshes dependent views.

### ARCH-08 — Three platform-dispatch mechanisms coexist

- **Severity:** Medium
- **Status:** `Open`
- **Evidence:** The codebase uses Metro extensions (`db.native.ts`/`db.web.ts`, `saveBackup.*`, `restNotifications.*`), runtime `typeof document` with dynamic imports (`saveBackup.ts:10-15`, `health/index.ts:8-26`), and `Platform.OS` checks (`pickBackup.ts:4-8`, `SettingsContext.tsx:47-48`).
- **Impact:** The resolution matrix is hard to reason about, and the fallback branches in `restNotifications.ts` are effectively test-only on real devices.
- **Required change:** Standardize on Metro platform extensions for module selection and reserve `Platform.OS` for genuine in-module behavior differences. Document the matrix and add a test that asserts selection per platform.
- **Done when:** A single documented mechanism covers module selection.

### ARCH-09 — Hand-rolled navigation limits deep links and back behavior

- **Severity:** Medium
- **Status:** `Open`
- **Evidence:** `App.tsx:35-42` defines a static tab array and renders screens via conditionals. No navigation library or linking integration is present. Android back handling exists only inside the active logger.
- **Impact:** There are no deep links, no browser URL/history state, no back stack, and Android back exits the app from tab screens. Future flows (onboarding, settings, exercise deep links) will need navigation primitives built from scratch.
- **Required change:** Decide explicitly whether the fixed four-tab model is permanent. If yes, document the constraint and add web history plus shell-level Android back handling. If no, plan an expo-router/React Navigation migration.
- **Done when:** The product decision is documented and the chosen behavior is covered by tests.

### ARCH-10 — Dead code and unnecessarily public exports

- **Severity:** Low
- **Status:** `Done`
- **Evidence:** `DraggableExerciseCard.tsx` (176 lines) has no production import. `computeExerciseLayouts` in `active-exercises.ts:47` has no callers. `restoreBackup` and `shapeBackup` are used only by tests. Several helpers are exported but used only inside their own module.
- **Impact:** Future dead-code scans are noisy, and unused UI code suggests unfinished work.
- **Required change:** Delete genuinely dead modules or wire them in deliberately. Move test-only helpers to test utilities or mark them as such.
- **Implementation (2026-10-18):** Removed the unimported `DraggableExerciseCard` (182 lines), the uncalled `computeExerciseLayouts`, and the unreferenced `BackupV2`, `BackupData`, `RawCsvSetRow`, `SupersetGroupInfo`, and `Stat`/`StatProps` declarations (with their unused styles); unexported internal-only helpers (`formatRelativeDay`, `NOTE_COMMIT_DEBOUNCE_MS`, `PRRankLevel`, `PR_RANK_LABELS`, `summarizeStatsForEntries`, `isSamePRAchievement`, `extractLeaderboard`, `compareAchievements`, `MUSCLE_GROUP_MAP`, `matchesCategory`, `MUSCLE_ALIAS_MAP`, `EQUIPMENT_ALIAS_MAP`). `scripts/dead-code-scan.mjs` (`npm run check:dead-code`, wired into CI) walks `src/`, `tests/`, `App.tsx`, and `index.ts` and fails on exports with no reference anywhere while reporting test-only (deliberate seams such as the exported memo comparators and renderer helpers) and internal-only exports as informational categories. `restoreBackup`/`shapeBackup` have production callers after review (restore flow and `DataTransferSection`), so they stay.
- **Done when:** The dead-code scan is clean and every remaining export has a caller.

### ARCH-11 — Type-safety gaps at storage boundaries

- **Severity:** Medium
- **Status:** `Open`
- **Evidence:** There are 125 `any` occurrences in `src/`, concentrated in `nativeStore.ts` (42), `backup.ts` (17), and `readNativeFile.ts` (9). The native store is cast `as unknown as Store` at `nativeStore.ts:1521-1568`. Web wrappers use non-null assertions at `db.web.ts:149-158`, and `webStore.ts:1112` uses `(workout as any).inProgress` for a field that does not exist. `tsconfig.json` does not enable `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes`.
- **Impact:** Contract drift can pass typechecking, and the dead `inProgress` filter is a concrete example of a cast hiding a real bug.
- **Required change:** Type SQL row shapes explicitly, replace `catch (err: any)` with `unknown` plus a normalizer, add `noUncheckedIndexedAccess`, and replace cluster non-null assertions with an `invariant`/`requireDefined` helper.
- **Done when:** The store contract is checked structurally and the dead cast is removed.

### ARCH-12 — HistoryScreen is a 903-line component

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `src/screens/HistoryScreen.tsx` is 903 lines: the component spans lines 57-601 (five `useState` calls, two effects, seven handlers) and the style sheet spans 603-902. The history card markup, including the expanded set-detail tree and PR badges, is inlined into the `FlatList` `renderItem` at lines 297-538.
- **Impact:** The last remaining oversized screen after Phase 2 requires touching a single 545-line component for any history change, and the card tree cannot be rendered or tested in isolation.
- **Required change:** Extract a controller hook for screen state, a `HistoryCard` component for the list row, and the pure helpers (repeat-draft building, date formatting, totals, PR notification payloads). Target under 600 lines for the screen and under 300 lines per presentational child.
- **Implementation (2026-10-18):** `HistoryScreen.tsx` dropped from 903 to 121 lines and is now composition (`ScreenHeader`, gym filter chips, `FlatList` of `HistoryCard`, action sheet, edit/start modals). New `src/screens/history/` module: `useHistoryController.ts` (248 lines) owns the five state variables, both effects (gym-tracking reset, `workoutUpdate` cache sync), the handlers (expand, delete, perform-again, start-repeat, save-edit, PR-details notify), and the derived data (gym-scoped history, gym map, totals); `HistoryCard.tsx` (275 lines) owns the row including the expanded superset-aware set detail and PR badges; `historyLogic.ts` (102 lines) holds the pure helpers (`formatHistoryDate`, `filterHistoryByGym`, `computeHistoryTotals`, `buildRepeatExercises` with an injected UUID source, `buildPRDetailsNotification`). The style sheet moved to `src/screens/historyStyles.ts` so the screen and the card share it.
- **Verification:** `npm run typecheck`, `npm run typecheck:tests`, 569 unit (10 new focused tests in `tests/unit/history-logic.test.ts` and `tests/unit/history-card.test.ts`) / 173 integration tests green.
- **Done when:**
  - [x] The screen is under 600 lines and the extracted modules have focused tests.
  - [x] No behavior regressions in the history, repeat, and edit integration tests.

### ARCH-13 — WorkoutScreen is a 703-line component

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `src/screens/WorkoutScreen.tsx` is 703 lines: the component spans lines 40-441 (seven `useState` calls, one effect, seven handlers) and the style sheet spans 443-702. The week summary card (lines 190-238) and each routine card (lines 299-358) are inline JSX.
- **Impact:** Routine list changes and start-flow changes share one component, and the cards cannot be rendered or tested in isolation.
- **Required change:** Extract a controller hook for screen state, a `WeekSummaryCard` and a `RoutineCard` component, and the pure helpers (folder collection/filtering, routine summary metrics, week labels). Target under 600 lines for the screen and under 300 lines per presentational child.
- **Implementation (2026-10-18):** `WorkoutScreen.tsx` dropped from 703 to 170 lines and is now composition (`ScreenHeader`, quick-start card, `SectionHeader`, folder chips, `RoutineCard` list, empty states, action sheet, and the four modals). New `src/screens/workout/` module: `useWorkoutScreenController.ts` (224 lines) owns the seven state variables, the folder auto-reset effect, the start/duplicate/delete/edit handlers, and the derived folder list and filtered routines; `WeekSummaryCard.tsx` (60 lines) renders the week-in-review card; `RoutineCard.tsx` (80 lines) renders one routine row; `workoutScreenLogic.ts` (53 lines) holds the pure helpers (`collectRoutineFolders`, `filterRoutinesByFolder`, `buildRoutineSummary`, `formatTodayLabel`, `formatWeekDuration`). The style sheet moved to `src/screens/workoutStyles.ts` so the screen and both cards share it.
- **Verification:** `npm run typecheck`, `npm run typecheck:tests`, 578 unit (9 new focused tests in `tests/unit/workout-screen-logic.test.ts` and `tests/unit/workout-screen-components.test.ts`) / 173 integration tests green.
- **Done when:**
  - [x] The screen is under 600 lines and the extracted modules have focused tests.
  - [x] No behavior regressions in the routine, folder, and start integration tests.

---

## 7. Correctness and platform-parity findings

### COR-01 — Web completed-workout filter is dead

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `webStore.ts:1112` filters with `!(workout as any).inProgress`, but `Workout` has no `inProgress` field (`src/types/index.ts:67-78`) and `normalizeWorkout` does not preserve one. Native filters with SQL `WHERE w.in_progress = 0` at `nativeStore.ts:1119`. Web `getWorkoutDetail` also returns any stored record (`webStore.ts:991-1000`), while native requires completion (`nativeStore.ts:987`).
- **Impact:** In-progress or otherwise unintended records can appear in web history and PR calculations, and web behavior differs from native.
- **Required change:** Model completion state explicitly in the stored record and filter it consistently, or remove the dead check and guarantee that only completed workouts enter the store.
- **Implementation (2026-10-18):** Stored completion is now explicit on both platforms. New `src/database/workoutRecord.ts` owns the rule (`isInProgressRecord`, `asCompletedRecord`): native persists `in_progress = 0`, web stamps `inProgress: false` on `finishWorkout` and snapshot merges (mirroring native's merge insert). Every web read path — `getAllWorkoutsSorted` (history + snapshot), `getWorkoutDetail`, `getPreviousSetsForExercise`, `getCompletedWorkoutsForExercises`, `getExerciseStats`, and history reassignment — filters raw records through `isInProgressRecord` before normalization (the old check ran after `normalizeWorkout`, which could drop the field). `getWorkoutDetail` now returns `null` for in-progress records like native. Legacy records without the marker stay visible (absent = completed).
- **Verification:** `tests/integration/completion-parity.test.ts` — per-platform tests plus a cross-platform `deepEqual` parity test covering a completed and an injected in-progress record across history, detail, snapshot, PR inputs, previous sets, and stats. Pre-fix run failed on web exactly as expected (in-progress record leaked into history, detail, snapshot, previous sets, stats); post-fix all 3 tests pass. Fixture gained `insertRawWorkoutRecord` to write foreign records on both platforms.
- **Done when:**
  - [x] Both platforms return the same records for the same fixture.
  - [x] A parity test covers completed and in-progress records.

### COR-02 — Gym deletion policy diverges between native and web

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** Native rejects deletion when a draft or in-progress workout references the gym (`nativeStore.ts:258-271`). Web rejects only draft references and silently reassigns workouts (`webStore.ts:554-564`).
- **Impact:** The same user action succeeds on web and fails on native, with different data consequences.
- **Required change:** Define one policy in `StoreCore` and apply it on both platforms.
- **Implementation (2026-10-18):** `planGymDeletion` in `src/database/storeCore.ts` is the single policy: `validateGymDeletion`, rejection while an active draft or an in-progress stored workout references the gym, then a plan for draft/scope rewrites and default inheritance. Native feeds it `getWorkoutDrafts()`/`getExerciseGymScopes()` and an `in_progress = 1` query; web feeds the same readers plus raw records marked `inProgress` (via the COR-01 marker). Web now rejects in-progress references instead of silently reassigning; error messages are identical across platforms.
- **Verification:** Store contract suite scenarios "rejects gym deletion while an active draft references the gym", "rejects gym deletion while an in-progress workout references the gym", and "deletes a gym and reassigns workouts, scope links, and default status" pass on both stores.
- **Done when:** A parity test exercises gym deletion with drafts and in-progress workouts on both stores.

### COR-03 — Refresh signatures omit relevant fields

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** The Analytics signature at `AnalyticsScreen.tsx:136-143` includes workout IDs/times/gym/volume/counts, gym fields, scope count, and exercise count, but not exercise names or scope contents. The History signature at `HistoryScreen.tsx:142-156` omits `exerciseGymScopes` even though PR evaluation consumes them at `:169-176`.
- **Impact:** Renames and scope changes can leave analytics and PR displays stale.
- **Required change:** Replace hand-built signatures with a store revision counter or hash the full relevant inputs.
- **Implementation (2026-10-18):** Both screens deleted their partial JSON signatures. `AnalyticsScreen` checks `getDataRevision()` before hydrating the snapshot (removing the old signature fallback), and `HistoryScreen` checks the revision before loading history, gyms, and the PR snapshot. Renaming a custom exercise or changing a scope advances the revision (asserted in the store contract suite), so activating either tab reloads; no partial-signature false negatives remain, and views no longer need a second data change or a full reload to refresh.
- **Verification:** Store contract scenario "advances the data revision for scope and catalog writes" (both platforms) plus the existing revision contract and screen integration suites.
- **Done when:** Renaming an exercise and changing a scope both refresh the affected views immediately.

---

## 8. Accessibility findings

### A11Y-01 — Core workout controls have incomplete screen-reader coverage

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `ActiveWorkoutScreen.tsx` contains 55 `TouchableOpacity` elements, 22 `accessibilityRole` attributes, and 23 `accessibilityLabel` attributes. Missing coverage includes the collapsed exercise row at `:763-781`, the compact RPE badge at `:1084-1093`, and the inline RPE cell at `:1097-1106`. The set checkbox at `:1111-1126` shows the correct pattern.
- **Impact:** A screen-reader user cannot reliably identify or operate the primary set controls.
- **Required change:** Add roles, labels, hints, and state to every interactive control, starting with the logger set/exercise/RPE surfaces.
- **Implementation (2026-10-18):** The logger interaction tree was migrated to `AppTouchable` and every control now carries a role, a label, and dynamic state or hints: the collapsed/expanded exercise rows (`ActiveExerciseCard`; the collapsed row announces "name, N of M sets completed" with an expand hint), the expanded menu and collapse buttons, set badges, compact and inline RPE cells, and move/delete controls (`ActiveSetRow`), the add-exercise button (`ExerciseStream`), all `ExerciseOptionsMenu` rows (including the conditional superset label and disabled state on move up/down), the `WorkoutOptionsMenu` rows (conditional RPE-column label, documented scrim as `accessible={false}`), the `SetOptionsModal` close/done/type/drop/RPE chips (with selected state), plate and delete shortcuts, and the logger-reachable modals: `WarmupModal` (bar chips, presets, custom steps, ramp rows and steppers, replace toggle, apply button with disabled state), `WorkoutDurationModal`, `PlateCalculatorModal`, `ExercisePickerModal`, `DraftRecoveryModal`, and `DraftResumeBanner`. A scoped `no-restricted-imports` rule now rejects raw `TouchableOpacity`/`TouchableHighlight`/`Pressable` imports in these files, so new controls must use the primitive. `WorkoutHeader` and `ActiveWorkoutScreen` controls were already labelled and only needed the primitive migration. Verification: the brace-aware scan used to size the work reports 124 unlabelled touchables app-wide before and 0 in the logger surfaces after; both typechecks, ESLint, Prettier, and the 584-test suite pass. Remaining unlabelled controls outside the logger and rest scope are tracked as `A11Y-06`.
- **Done when:** Every touchable in the logger has a meaningful label and role, verified by a checklist and automated where possible.

### A11Y-02 — Rest controls, mini bar, and read-only banner are unlabeled

- **Severity:** High
- **Status:** `Done`
- **Evidence:** `RestTimerOverlay.tsx:59-83` has three touchables with no role or label. `ActiveWorkoutMiniBar.tsx:31-35` has one large unlabeled touchable. `ReadOnlyBanner.tsx:35-46` has an unlabeled "Take Over" action.
- **Impact:** Rest-timer adjustment, resuming a minimized workout, and recovering from read-only mode are difficult or impossible without sight.
- **Required change:** Add labels/roles to these controls and make the countdown a polite live region.
- **Implementation (2026-10-18):** `RestTimerOverlay`'s controls now read "Decrease rest timer by 30 seconds", "Increase rest timer by 30 seconds", and "Skip rest". `ActiveWorkoutMiniBar` announces "Resume workout <name>" with a return hint, and `ReadOnlyBanner`'s action is "Take over editing session" with busy/disabled state. `RestTimeWheelModal` labels its close button, presets, every minute/second wheel row (with selected state), the apply-to-all checkbox, and the confirm button ("Disable rest timer" or "Confirm rest timer"). All four files use the `AppTouchable` primitive and are covered by the scoped `no-restricted-imports` list. The countdown's polite live region is implemented with the dynamic-semantics work in `A11Y-03`. Verification: the audit scan reports 0 unlabelled touchables in these files; both typechecks, ESLint, Prettier, and the 584-test suite pass.
- **Done when:** All three surfaces are operable with a screen reader.

### A11Y-03 — No live regions or value semantics for dynamic UI

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** There are zero `accessibilityLiveRegion` and zero `accessibilityValue` occurrences in `src/`. The rest timer, workout clock, PR toast, and 30 text inputs expose no dynamic semantics.
- **Impact:** Countdowns and record celebrations are silent, and inputs do not announce their current values.
- **Required change:** Add live regions to timers and toasts, and add label/value semantics to weight, reps, RPE, and notes inputs.
- **Implementation (2026-10-18):** The rest countdown is a polite live region with `accessibilityRole="timer"` and a value ("Rest time remaining"): the PR toast is an assertive live region (role `alert` with the full announcement) and now uses `AppTouchable`. The header duration metric became a self-contained clock component so its `accessibilityValue` follows the ticking time without re-rendering the header; it is deliberately not a live region because a once-per-second announcement stream is hostile, and the value stays queryable on demand. `WeightInput`, `RepsInput`, and `ExerciseNoteInput` accept an `accessibilityLabel` and expose `accessibilityValue` from their current display text; `ActiveSetRow` passes per-set labels ("Weight for set 3", "Reps for set 3") and `ActiveExerciseCard` labels the note field per exercise. RPE is chip-based and was covered by `A11Y-01`. Tests: `tests/unit/accessibility-semantics.test.ts` asserts the live regions, roles, and values.
- **Done when:** Dynamic updates are announced without requiring focus changes.

### A11Y-04 — Modal semantics and focus handling are inconsistent

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** Only 4 occurrences of `accessibilityViewIsModal` exist across the app despite many custom modals.
- **Impact:** Screen-reader users can escape into background content while a modal is open.
- **Required change:** Standardize modal containers on `accessibilityViewIsModal`, initial focus, and focus return.
- **Implementation (2026-10-18):** Every custom modal container (26 files, 31 containers including the nested rep-target dropdown in `RoutineEditorModal`) now sets `accessibilityViewIsModal`, so screen readers cannot leave the modal. `src/hooks/useModalAccessibility.ts` standardizes initial focus: the content container takes iOS accessibility focus when the modal opens, and UIKit returns focus to the presenting element on close; Android's native modal window owns focus trapping and restoration, and the hook is a documented no-op there (and for hidden modals). The hook is wired into all 25 modal components through the container ref. Tests: `tests/unit/modal-accessibility.test.ts` covers the focus move, the hidden-modal no-op, and the non-iOS no-op; a repository scan confirms every `<Modal` element is accompanied by `accessibilityViewIsModal`.
- **Done when:** Every modal traps focus and restores it on close.

### A11Y-05 — No enforced accessibility primitive or lint rule

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** Accessibility attributes are applied ad hoc. There is no required-label wrapper component and no `jsx-a11y`-style rule in CI.
- **Impact:** New UI will keep reproducing the same gaps.
- **Required change:** Add an `AppTouchable`/`IconButton` primitive that requires an accessibility label, and enforce it through review and lint where possible.
- **Implementation (2026-10-18):** `src/components/ui.tsx` exports `AppTouchable`, whose props require `accessibilityLabel` and default `accessibilityRole` to `button` (`IconButton` already required a label); dismiss scrims opt out with `accessible={false}` instead of a meaningless label. `tests/unit/app-touchable.test.ts` covers label and role forwarding, press handling, the scrim opt-out, and the type-level requirement (a `@ts-expect-error` proves an omitted label does not compile). Scoped `no-restricted-imports` rules reject raw `TouchableOpacity`/`Pressable`/`TouchableHighlight` imports in the logger and rest surfaces (landed with `A11Y-01`; the rest surfaces follow in `A11Y-02`), so new controls there must use the primitive. `eslint-plugin-react-native-a11y` was evaluated first but supports only ESLint 8 and below, so the type-enforced primitive plus scoped import restrictions carry the enforcement.
- **Done when:** New interactive components use the primitive by default.

### A11Y-06 — Unlabelled controls remain outside the logger and rest surfaces

- **Severity:** Low
- **Status:** `Done`
- **Evidence:** After the logger (`A11Y-01`) and rest (`A11Y-02`) migrations, a brace-aware scan for `TouchableOpacity` openings without an `accessibilityLabel` still reports 49 controls in shared modals, shared primitives whose accessible name currently comes from child text, and secondary screens: `RoutineEditorModal` (21), `CsvImportModal` (6), `FolderManageModal` (4), `WorkoutEditModal` (4), `CustomExerciseModal` (3), `ExerciseScopeModal` (3), `ui.tsx` (4), and one each in `AnalyticsScreen`, `ExercisesScreen`, `WorkoutScreen`, and `history/HistoryCard`. These are outside the Phase 3 exit criteria (logger and rest controls) and are logged as residual instead of being skipped.
- **Impact:** Outside the logging flow, screen readers fall back to child text or announce icon-only controls incompletely.
- **Required change:** Migrate the remaining interactive components to `AppTouchable`, adding labels/roles/state and extending the scoped `no-restricted-imports` list; give the shared primitives (`SegmentedControl`, `Chip`, `ActionSheet`, header actions) explicit labels where child text is not a full description.
- **Implementation (2026-10-18):** All 49 controls were labelled and migrated to `AppTouchable` across `RoutineEditorModal` (21), `CsvImportModal` (6), `FolderManageModal` (4), `WorkoutEditModal` (4), `CustomExerciseModal` (3), `ExerciseScopeModal` (3), the shared `ui.tsx` primitives (`SegmentedControl` segments, the `SectionHeader` action, the `ActionSheet` cancel button, and the menu scrim now `accessible={false}`), and one control each in `AnalyticsScreen`, `ExercisesScreen`, `WorkoutScreen`, and `history/HistoryCard`; the two `Pressable` dismiss scrims in `GymPickerModal`/`WorkoutStartModal` opt out with `accessible={false}`. The scoped `no-restricted-imports` list now covers every migrated file. `tests/unit/accessibility-touchable-scan.test.ts` walks `src/` with a brace- and quote-aware scan and fails on any raw `TouchableOpacity`/`TouchableHighlight`/`Pressable` without a label and role (scrims and the `AppTouchable` primitive's prop spread excepted), so the standard stays enforced in CI.
- **Done when:** The scan reports zero unlabelled touchables outside explicit `accessibilityViewIsModal`/`accessible={false}` dismiss scrims.

---

## 9. Developer-experience and quality-gate findings

### DX-01 — No lint or formatting tooling

- **Severity:** High
- **Status:** `Done`
- **Evidence:** No ESLint, Prettier, Biome, EditorConfig, husky, or lint-staged configuration exists. `package.json` has no `lint` script. Style is enforced only by prose in `CONTRIBUTING.md`.
- **Impact:** Hook dependency mistakes and inconsistent formatting reach review. Contributors must infer style from surrounding code.
- **Required change:** Add ESLint with `react-hooks`, `@typescript-eslint`, and an RN-compatible accessibility subset; add Prettier or Biome; add `lint` and `format:check` scripts and a CI job. Add a pre-commit hook only if it does not slow the core loop.
- **Implementation (2026-10-18):** `eslint.config.mjs` (flat config) applies `@eslint/js`, the type-unaware `typescript-eslint` recommended set, and `react-hooks` with `rules-of-hooks` and `exhaustive-deps` as errors. `@typescript-eslint/no-explicit-any` is a warning pending `ARCH-11`; tests relax only host-stub-specific rules. The first full run surfaced 236 problems: 49 unused imports/variables, 14 hook-dependency gaps, a dead branch in `resolveInitialAccordionState` (`src/workout/gym-session.ts`, removed as unreachable), a missing rethrow cause in `src/utils/backup.ts`, and stale `require` suppressions replaced with reasons. Real hook fixes landed for `ExercisePickerModal` (memoized loader), `ProgressionCurveView` (memoized accessor), and the logger keyboard effect; the remaining deliberate dependency narrowings carry line-scoped suppressions with rationale. Prettier (single quotes, 100 columns, `arrowParens: avoid`, `trailingComma: all`) baselined the repository; the generated `src/database/defaultExercises.json` catalog is ignored. `npm run lint`, `npm run lint:fix`, `npm run format`, and `npm run format:check` exist, and CI runs lint and the format check on every push (branch filter broadened to `**`) and pull request. No pre-commit hook was added: CI enforces the gates without slowing the core loop. `eslint-plugin-react-native-a11y` was evaluated for the accessibility subset but does not support ESLint 9+; the required-label primitive and scoped import restriction in `A11Y-05` cover that gap. Verification: `npm run lint` exits 0 (0 errors, 124 `any` warnings tracked by `ARCH-11`), `npm run format:check` is clean, and both typechecks plus the 578 + 173 test suites pass on the formatted tree.
- **Done when:** CI fails on lint errors and formatting drift.

### DX-02 — No component or UI tests

- **Severity:** High
- **Status:** `Done`
- **Evidence:** No React renderer dependency exists. The only component-adjacent tests are hand-rolled React fakes in `tests/unit/exercise-visual.test.ts` and `tests/unit/workout-health-sync.test.ts`. `tests/` references 2 of roughly 45 UI files.
- **Impact:** Regressions in the primary logging flow, modals, and navigation are caught only by manual testing or the APK launch smoke test.
- **Required change:** Add React Native Testing Library and cover the critical flows: set logging, rest timer, finish/discard, draft recovery, and exercise search. Add one device-level end-to-end flow.
- **Implementation (2026-10-18):** `@testing-library/react-native` 14 (loaded through its `pure` entry so jest-only matchers are not required) plus `test-renderer` run under the existing `node --test` runner via `tests/helpers/rntlHarness.ts`: React Native itself is Flow-typed source that Node cannot load, so the harness stubs `react-native` with string host components, mocks lucide/safe-area, and provides a row-rendering FlatList double for flow tests (explicitly not a virtualization double). `tests/unit/critical-flows.test.ts` covers the five critical journeys: set logging (`ActiveSetRow`: checkbox toggle, debounced weight commit asserting nothing fires per keystroke, RPE cell), rest timer (`RestTimerOverlay`: read, +30s/-30s, skip), finish and discard (`WorkoutHeader` finish, `WorkoutOptionsMenu` discard and close), draft recovery (`DraftRecoveryModal` continue/discard), and exercise search (`ExercisePickerModal`: initial load, 120 ms debounce, filtering, and selection closing the picker). The harness also unblocked the deferred renderer verifications: the `PERF-03` aggregate spy and the `PERF-09` 500-record mount count. The device-level end-to-end journey lands in `DX-04` (Maestro).
- **Done when:** Critical UI paths have automated tests that run in CI.

### DX-03 — No coverage measurement or threshold

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** No `c8`, `nyc`, or experimental coverage flag is configured, and no workflow uploads or checks coverage.
- **Impact:** Coverage can regress silently, and there is no signal for which new modules need tests.
- **Required change:** Enable coverage for unit and integration runs, publish a report, and set an initial non-regression threshold.
- **Implementation (2026-10-18):** `npm run test:coverage` runs the unit and integration suites in one Node test process with `--experimental-test-coverage`, excludes `tests/**` from the report, enforces non-regression thresholds (lines 90, branches 83, functions 89 against the measured 91.08 / 84.03 / 89.97), and writes an lcov report to `coverage/lcov.info`. CI runs this in place of the separate test steps and uploads the lcov file as a `coverage-lcov` artifact, so a coverage drop fails the run with the threshold message (verified locally: raising the line threshold to 99 exits 1). `coverage/` is gitignored and excluded from Prettier and ESLint.
- **Done when:** CI reports coverage and fails on a configured drop.

### DX-04 — No end-to-end flow tests

- **Severity:** Medium
- **Status:** `Open`
- **Evidence:** `scripts/android-smoke-test.sh` installs and launches the APK and fails on a crash, but it does not exercise a flow.
- **Impact:** Lifecycle bugs that only appear in a real app (backgrounding, permissions, navigation) are not covered.
- **Required change:** Add Maestro or Detox for a small smoke journey: start workout, log a set, minimize, resume, finish.
- **Done when:** The journey runs in CI on an emulator.

### DX-05 — Tests are excluded from typechecking

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `tsconfig.json:7` excludes `tests`. CI runs `npx tsc --noEmit`, so 15,784 lines of test code are never typechecked. `@types/node` is not a direct devDependency.
- **Impact:** Broken fixtures and API drift in tests are invisible until runtime.
- **Required change:** Add a `tsconfig.test.json` that includes `tests/`, add `@types/node`, and typecheck it in CI.
- **Implementation (2026-10-18):** `tsconfig.test.json` extends the app config with `types: ["node"]`; `@types/node` is a direct devDependency; latent fixture drift (legacy `bodyPart`/`orderIndex` fields, missing `gymId`, stale mock shapes, module-mock typings) was fixed across the suite; `npm run typecheck:tests` runs locally and in the CI and release workflows.
- **Done when:** Test type errors fail CI.

### DX-06 — No dependency automation or security gate

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** No Dependabot, Renovate, CodeQL, or `npm audit` step exists. Local audit: 29 vulnerabilities, including a critical `shell-quote` advisory reached through `react-devtools-core` and several high-severity build-tool transitive issues.
- **Impact:** Security and compatibility drift accumulate silently. Most findings are build-time, but they still affect contributor and CI environments.
- **Required change:** Add Dependabot/Renovate with grouped Expo updates, run `npm audit --omit=dev` in CI with an agreed policy, and document triage for accepted advisories.
- **Implementation (2026-10-18):** `.github/dependabot.yml` adds weekly npm and GitHub Actions updates with grouped Expo, React Native, and dev-tooling PRs; majors of `expo`, `react-native`, `react`, and `react-dom` are left to `npx expo install --fix` during SDK upgrades rather than individual Dependabot bumps. `scripts/audit-policy.mjs` runs `npm audit --omit=dev`, fails on high/critical advisories unless they are explicitly accepted with a reason, and prints the production-tree counts; `npm run audit:policy` runs in CI on every push and pull request. Six build/dev-tooling advisories (including the critical `shell-quote` reached through `react-devtools-core`) are accepted with triage notes in `docs/release-checklist.md` section 2, so dependency updates and any new advisory are visible and actionable.
- **Done when:** Dependency updates and audit results are visible and actionable on every relevant PR.

### DX-07 — No Node/toolchain pinning and incorrect prerequisites

- **Severity:** Medium
- **Status:** `Done`
- **Evidence:** `package.json` has no `engines` or `packageManager`; there is no `.nvmrc`. README and CONTRIBUTING state Node 18+, CI uses Node 24, and the test harness requires `node:sqlite` (Node 22.5+) and `--experimental-test-module-mocks` (Node 22.3+).
- **Impact:** Contributors following the docs can hit confusing failures before running a single test.
- **Required change:** Add `.nvmrc`, `engines`, and `packageManager`; update README and CONTRIBUTING to Node 22.5+ with CI on the same version.
- **Implementation (2026-10-18):** Added `.nvmrc` (24), `engines.node >= 22.5.0`, and `packageManager: npm@11.19.1`. README, CONTRIBUTING, and `docs/release-checklist.md` now state Node 22.5+ with Node 24 matching `.nvmrc` and CI.
- **Done when:** A fresh checkout following the docs runs the verification suite without version workarounds.

### DX-08 — Version and documentation drift

- **Severity:** Low
- **Status:** `Done`
- **Evidence:** `package.json` says version 1.0.0 while `app.json` says 1.0.5. `docs/audit-remediation-results.md:76` says 147 tests (current baseline is 620+). The release checklist and README disagree on Node requirements.
- **Impact:** Small inconsistencies erode trust in the documentation and complicate release checks.
- **Required change:** Make `app.json` the single version source (or synchronize both), refresh the stale test counts, and update prerequisites.
- **Implementation (2026-10-18):** `package.json` is at 1.0.5, matching `app.json` `expo.version`, and `scripts/check-version-sync.mjs` enforces package/app agreement plus the documented `android.versionCode` base formula (`npm run version:check`, also a CI step). The release checklist's "Cutting a release" steps now include the version check and a documentation-freshness pass over this audit and the test counts. `docs/audit-remediation-results.md` was refreshed from the stale 147-test block to the current 580 unit + 173 integration totals, with the original figure noted. README, CONTRIBUTING, and the release checklist already agreed on Node 22.5+/24 via `DX-07`. Coverage: `tests/unit/version-sync.test.ts` passes on the repository and exits 1 for mismatched fixtures.
- **Done when:** Version and documentation checks are part of the release checklist.

### DX-09 — Missing open-source collaboration templates

- **Severity:** Low
- **Status:** `Done`
- **Evidence:** No `SECURITY.md`, issue templates, pull-request template, or `CODEOWNERS`.
- **Impact:** Security reports and contribution quality depend on ad hoc communication.
- **Required change:** Add a security policy, issue/PR templates, and a lightweight review checklist that references this audit.
- **Implementation (2026-10-18):** Added `SECURITY.md` (private GitHub advisory reporting, scope for local storage, the web lease, and the opt-in health export, and a pointer at the accepted build-tooling advisories), issue forms for bugs and feature requests plus `config.yml` that routes security reports to the private flow, a pull-request template whose checklist mirrors the verification suite and asks for the audit finding ID, and `.github/CODEOWNERS` covering the maintainer on release and CI metadata. CONTRIBUTING now links the templates and the security policy.
- **Done when:** The templates are present and linked from CONTRIBUTING.

### DX-10 — Web export artifacts break the typecheck

- **Severity:** Low
- **Status:** `Done`
- **Evidence:** `tsconfig.json` excluded `dist` but not the documented `dist-audit-web` export directory. Because the Expo base config sets `allowJs`, a `tsc --noEmit` run after the documented web export step type-checked the 3.9 MB minified bundle and crashed with `RangeError: Maximum call stack size exceeded` instead of a useful error.
- **Impact:** Contributors following the verification protocol hit an opaque crash on their next typecheck, and the export could be committed accidentally.
- **Required change:** Exclude generated export directories from the typecheck and ignore them in git.
- **Implementation (2026-10-18):** `tsconfig.json` now excludes `dist-*`, and `.gitignore` ignores `dist-*/`. Verified with the export directory present: both typechecks exit 0.
- **Done when:** Running the verification protocol in order leaves both typechecks clean.

---

## 10. Product findings

### PROD-01 — App Store and F-Droid submissions are pending

- **Severity:** Medium
- **Status:** `Open`
- **Evidence:** ROADMAP Phase 4 marks F-Droid and App Store publishing as incomplete. The F-Droid recipe and release pipeline exist, but submission to fdroiddata and iOS device acceptance remain.
- **Impact:** Distribution is limited to GitHub APK releases, and iOS users cannot install through the App Store.
- **Required change:** Complete the release checklist, submit to fdroiddata, and finish the iOS custom-build acceptance path.
- **Done when:** The app is installable from at least one public store per platform.

### PROD-02 — Automatic backups and remote exercise photos are not merged

- **Severity:** Medium
- **Status:** `Open`
- **Evidence:** `feat/android-automatic-backups` and `feat/remote-exercise-images-setting` contain commits not on `main`. `origin/feat/time-distance-charts` also exists.
- **Impact:** Users still depend on manual exports for disaster recovery, and completed work sits idle on branches.
- **Required change:** Review, test, and merge or explicitly defer each branch. Keep branch lifetimes short.
- **Done when:** Each branch is merged or closed with a documented decision.

### PROD-03 — Rich exercise media and watch companion remain unfinished

- **Severity:** Low
- **Status:** `Open`
- **Evidence:** ROADMAP Phase 4 lists rich media and Wear OS/Apple Watch as incomplete.
- **Impact:** These are differentiators against paid competitors but not blockers for the core tracker.
- **Required change:** Keep them behind the reliability and performance work; scope a small media increment before a full animation system.
- **Done when:** A scoped milestone is agreed and tracked.

### PROD-04 — No localization or i18n infrastructure

- **Severity:** Medium
- **Status:** `Open`
- **Evidence:** The app is English-only; no i18n library, message catalog, or locale-aware formatting layer exists.
- **Impact:** International adoption is limited, and retrofitting strings after more UI work is more expensive.
- **Required change:** Introduce a minimal message catalog and locale-aware number/date formatting before expanding the string surface.
- **Done when:** User-facing strings are centralized and a second locale can be added without touching screen logic.

### PROD-05 — No deep links or web URL state

- **Severity:** Medium
- **Status:** `Open`
- **Evidence:** `App.tsx` has no linking integration, and no code writes browser history. External links are limited to exercise references in `src/utils/exercise-links.ts`.
- **Impact:** Web refresh always returns to the Workout tab, and exercises/workouts cannot be linked to or bookmarked.
- **Required change:** Decide whether deep links are in scope. If yes, add route state and browser history; if no, document the limitation.
- **Done when:** The chosen behavior is implemented or explicitly documented.

### PROD-06 — Web installability and offline shell are not configured

- **Severity:** Low
- **Status:** `Open`
- **Evidence:** `app.json` has no web manifest configuration, and the current export contains no manifest or service worker.
- **Impact:** The data layer is local-first, but the web shell is not installable and may not reload offline.
- **Required change:** Add a web manifest and service worker strategy if web is a supported target, or state the limitation in the README.
- **Done when:** The web behavior matches the documented promise.

---

## 11. Prioritized remediation plan

The plan is ordered by user-data risk, then core interaction performance, then structural drag. Each item references its finding ID. Check items off as they are completed.

### Phase 0 — Reliability and guardrails (target: days)

- [x] `REL-01` Add a root error boundary and per-tab boundaries.
- [x] `REL-02` Surface persistence failures with retry and export.
- [x] `REL-03` Add `reportError` and remove silent catches.
- [x] `REL-04` Fix dialog action error handling.
- [x] `REL-05` Route completed-workout updates through a use case.
- [x] `PERF-04` Add database indexes.
- [x] `PERF-05` Batch history queries and remove N+1 reads.
- [x] `DX-05` Typecheck the test suite.
- [x] `DX-07` Pin Node and fix prerequisites.

**Exit criteria:** A simulated storage failure and a simulated render failure are both visible and recoverable; the hot history queries use indexes; a clean checkout runs the documented suite.

### Phase 1 — Logger and analytics responsiveness (target: one to two weeks)

- [x] `PERF-01` Split active-workout state; memoize exercise cards and set rows.
- [x] `PERF-02` Debounce exercise notes.
- [x] `PERF-03` Debounce Trophy Room search and filter precomputed records.
- [x] `PERF-07` Add a cheap revision check before analytics hydration.
- [x] `PERF-08` Precompute search normalization and the staple list.
- [x] `PERF-09` Virtualize the records list.
- [x] `PERF-10` Remove the duplicate detail query.
- [x] `PERF-12` Reduce the rest-timer tick to one update per second.
- [x] `PERF-13` Fix confetti and SVG parsing costs.

**Renderer-level verifications (landed 2026-10-18 with `DX-02`):** the `PERF-03` per-keystroke aggregate spy and the `PERF-09` 500-record mount-count assertion now run in the React Native Testing Library harness; see each finding for the tests. The comparator, memoization, query-count, revision-contract, and call-count tests listed per finding remain in place.

**Exit criteria:** Toggling a set re-renders only the affected rows; typing does not trigger a full workout re-render; returning to Analytics with no changes does not hydrate the full database; a 500-record dataset scrolls without mounting all rows.

### Phase 2 — Architecture and startup (target: two to four weeks)

- [x] `ARCH-01` Decompose `ActiveWorkoutScreen`.
- [x] `ARCH-02` Decompose `AnalyticsScreen`.
- [x] `ARCH-03` Split `WorkoutProvider` into focused hooks.
- [x] `ARCH-04` Extract `StoreCore` and add a shared contract suite.
- [x] `ARCH-05` Deduplicate custom-exercise UI.
- [x] `ARCH-06` Add repository/domain hooks.
- [x] `ARCH-07` Add a store revision counter and invalidation.
- [x] `ARCH-12` Decompose `HistoryScreen`.
- [x] `ARCH-13` Decompose `WorkoutScreen`.
- [x] `PERF-06` Lazy-load the exercise catalog.
- [x] `PERF-11` Lazy-import heavy screens and bound hidden-tab retention.
- [x] `PERF-14` Add IndexedDB indexes and indexed history reads.
- [x] `COR-01` Fix the web completion filter.
- [x] `COR-02` Unify gym deletion policy.
- [x] `COR-03` Replace partial signatures with the revision counter.

**Exit criteria:** No screen exceeds roughly 600 lines; shared domain rules live in one module; both stores pass the same contract suite; cold-start catalog work is eliminated once seeded.

**Residual note (2026-10-18):** All Phase 2 findings are `Done`. Two screens exceed the 600-line guideline and carry no original finding: `src/screens/HistoryScreen.tsx` (903 lines) and `src/screens/WorkoutScreen.tsx` (703 lines). Both were scheduled as `ARCH-12` and `ARCH-13` and completed on the same branch (see their findings for implementation and verification notes).

### Phase 3 — Quality gates and accessibility (target: ongoing, start immediately)

- [x] `DX-01` Add ESLint, Prettier/Biome, and CI enforcement.
- [x] `DX-02` Add React Native Testing Library and critical-flow tests.
- [x] `DX-03` Add coverage reporting and a threshold.
- [ ] `DX-04` Add one end-to-end smoke journey.
- [x] `DX-06` Add dependency automation and an audit policy.
- [x] `DX-08` Fix version and documentation drift.
- [x] `DX-09` Add collaboration and security templates.
- [x] `A11Y-01` Label the core logger controls.
- [x] `A11Y-02` Label rest controls, mini bar, and read-only banner.
- [x] `A11Y-03` Add live regions and value semantics.
- [x] `A11Y-04` Standardize modal semantics.
- [x] `A11Y-05` Add a required-label primitive.

**Exit criteria:** CI enforces lint, types, tests, and coverage; the core flows have UI tests; the logger and rest controls are screen-reader operable.

### Phase 4 — Product follow-through (target: after Phase 1-2)

- [ ] `PROD-01` Complete F-Droid and iOS publishing.
- [ ] `PROD-02` Merge or close automatic backups, remote photos, and time/distance charts.
- [ ] `PROD-03` Scope the next media/watch milestone.
- [ ] `PROD-04` Add i18n scaffolding.
- [ ] `PROD-05` Decide and document deep-link scope.
- [ ] `PROD-06` Add the web manifest/service worker or document the limitation.
- [ ] `ARCH-08` Standardize platform dispatch.
- [ ] `ARCH-09` Decide and document the navigation model.
- [x] `ARCH-10` Remove dead code.
- [ ] `ARCH-11` Tighten storage-boundary types.
- [x] `A11Y-06` Label the remaining shared surfaces (see the residual inventory).

---

## 12. Verification protocol

Every remediation pull request must run:

```bash
npx tsc --noEmit
npm run typecheck:tests
npm test
npm run test:integration
npx expo export --platform web --output-dir dist-audit-web
```

Add the following for the relevant change:

- **Database changes:** migration upgrade test from the previous schema version, plus `EXPLAIN QUERY PLAN` evidence for the hot queries.
- **Performance changes:** before/after numbers using React DevTools Profiler, a render counter, query counts, or a synthetic dataset. Record the method and result in the pull request.
- **Store changes:** run the shared contract suite against both native and web stores.
- **UI/accessibility changes:** a screen-reader checklist and, once available, an automated component test.
- **Release changes:** the full `docs/release-checklist.md` flow.

### Definition of done

- [ ] The finding's acceptance criteria are met.
- [ ] New behavior has automated coverage at the appropriate layer.
- [ ] The verification suite passes locally and in CI.
- [ ] The finding status is updated in this document.
- [ ] Any follow-up work discovered is recorded as a new finding rather than left implicit.

---

## 13. Metrics appendix

### Baseline size

| Metric | Value |
| :--- | :--- |
| Application TypeScript files | 142 |
| Application TypeScript lines | 39,801 |
| Screens | 5 |
| Components | 40 |
| Test files | 68 |
| Test lines | 15,784 |
| Unit tests passing | 478 |
| Integration tests passing | 142 |

### Baseline dependency state

- `npx expo install --check` reports 8 packages behind expected SDK 57 versions: `@expo/metro-runtime`, `expo`, `expo-build-properties`, `expo-crypto`, `expo-document-picker`, `expo-notifications`, `expo-sharing`, and `expo-sqlite`.
- `npm audit --omit=dev` reports 29 vulnerabilities: 1 critical, 19 high, 9 moderate. The critical advisory is in `shell-quote`, reached through `react-devtools-core`. Most high findings are in Metro/Expo build tooling rather than runtime code.

### Recommended measurement additions

- **Startup:** record `performance.now()` marks around store initialization and first screen render; compare across releases.
- **Render counts:** add a development-only render counter to `ActiveWorkoutScreen`, `ExerciseCard`, and `SetRow` to prove the context split works.
- **Query counts:** wrap the store in development to log query counts per screen activation; assert budgets in tests where practical.
- **Bundle:** use Expo Atlas or a bundle analyzer on a production export; track the catalog and chart chunks separately.
- **Synthetic performance fixture:** generate 500 workouts x 5 exercises x 4 sets (10,000 sets) and use it for web and native history/analytics testing.
- **Accessibility:** maintain a checklist of the five primary flows and verify each with a screen reader before release.

---

## 14. Out of scope

This audit did not include:

- Device-level profiling on physical low-end hardware.
- App Store review policy or legal/licensing review beyond the existing provenance documents.
- Reproduction of the F-Droid build-server output; the release workflow already covers it.
- Security penetration testing or threat modeling.
- Visual design critique beyond ergonomics and accessibility.
- A full review of the 876-exercise content dataset for accuracy.

---

## 15. Document history

| Date | Change | Author |
| :--- | :--- | :--- |
| 2026-10-18 | Initial audit at commit `377e12a` | Repository audit |
| 2026-10-18 | Phase 0 landed on `phase-0-reliability-and-performance`: `REL-01`–`REL-05`, `PERF-04`, `PERF-05`, `DX-05`, `DX-07` moved to `Done` with implementation and test evidence recorded in each finding; `DX-10` added for the export-artifact typecheck crash and fixed. Verification: app and test typechecks clean, 495 unit + 146 integration tests pass, web production export succeeds | Remediation |
