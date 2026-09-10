# Task 10 Report — Gym-aware history, workout reassignment, and exercise scope UI

Date: 2026-09-10

## Implemented

- Added optional `gymId` edits to `applyWorkoutEdits`, including trimmed non-empty validation, immutable updates, and stable completed workout IDs.
- Added gym loading, an All Gyms chip, one chip per gym, non-mutating filtered history, filtered workout/volume summaries, gym tags, deleted-filter recovery, and tracking-toggle visibility semantics to `HistoryScreen`.
- Added a tracking-aware gym field to `WorkoutEditModal`. Valid gym IDs are checked before saving through the existing `saveCompletedWorkout` path, and the cached detail/history list refresh after success.
- Added `ExerciseScopeModal` with Global, Gym-specific, Linked gyms, shared `validateExerciseGymScope` validation, linked-gym selection, and “Use equipment default” removal through `deleteExerciseGymScope`.
- Updated `ExercisesScreen` to load the default/current gym and scope override, display separate Global/current-gym stat cards with max weight, max single-set volume, estimated 1RM, and sessions, and expose effective scope editing only while gym tracking is enabled.
- Extended unit and integration coverage for gym reassignment, empty gym IDs, filtered history counts/volume, non-mutation, and stable IDs.

## TDD evidence

- Initial focused run failed as expected: 2 failures in the new `applyWorkoutEdits` tests because `gymId` was not yet applied or validated; the existing 24 tests passed.
- Minimal helper implementation was then added and the focused unit tests passed.

## Verification

- Focused: `npx tsx --test tests/unit/workout-edit.test.ts tests/unit/gym-scope.test.ts tests/integration/history-stats.test.ts` — 31 passed, 0 failed.
- Unit regression: `npm test` — 140 passed, 0 failed.
- Integration regression: `npm run test:integration` — 85 passed, 0 failed.
- TypeScript: `npx tsc --noEmit` — passed.
- Web export: `npx expo export --platform web --output-dir /tmp/lifts-web-export-multi-gym-history` — passed.
- Formatting check: `git diff --check` — passed.

## Scope / concerns

- No analytics charts, documentation, release checklist, or other later-task work was implemented.
- Device-specific manual acceptance was not performed; this task’s requested automated web export and regression matrix passed.
- Expo commands emit existing environment/Metro warnings about `NPM_CONFIG_PREFIX`, missing `/tmp/.../uv/env`, and `NO_COLOR`; they did not affect exit status or export output.

## Fix round 1

Review findings addressed:

- Added shared `validateWorkoutGymId` validation and applied it at both native and web completed-workout persistence boundaries. Unknown, whitespace-only, and non-canonical IDs are rejected before workout writes; invalid-save tests confirm no history/detail record is created.
- Added native and web integration coverage for invalid completed-workout gym IDs and no-write behavior.
- Added request-token guarded exercise-detail loading. Scope saves now reload current-exercise dual stats, while stale requests cannot overwrite a newer selection or error state.
- Cleared previous exercise gym/stats/scope state before loading a newly selected exercise and on load failure.
- Guarded `ExerciseScopeModal` Android/back dismissal while saving, with a tested dismissal helper.

Fix-round TDD evidence:

- The new red run failed in 4 expected places: native/web invalid saves were accepted or fell through to SQLite foreign-key failure, and the new validator/dismissal helpers were absent.
- Helper tests passed after the minimal helper implementation; persistence tests passed after store-boundary validation was added.

Fix-round verification:

- Focused: `npx tsx --test tests/unit/workout-edit.test.ts tests/unit/gym-scope.test.ts tests/unit/gym-profile.test.ts tests/unit/gym-picker.test.ts tests/integration/history-stats.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts` — 74 passed, 0 failed.
- Unit regression: `npm test` — 142 passed, 0 failed.
- Integration regression: `npm run test:integration` — 87 passed, 0 failed.
- TypeScript: `npx tsc --noEmit` — passed.
- Web export: `npx expo export --platform web --output-dir /tmp/lifts-web-export-multi-gym-history` — passed.
- Formatting check: `git diff --check` — passed.

Fix-round concern: device-specific manual acceptance remains outside this automated fix round.
