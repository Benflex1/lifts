# Task 7 Report: Active-Gym Lifecycle State and Untouched-Set Rehydration

## Scope

Implemented only the Task 7 lifecycle behavior in the `multi-gym-tracking` worktree:

- Pure untouched-set suggestion rehydration.
- Gym/default loading and `WorkoutContext` values `gyms`, `activeGym`, and `setActiveGym`.
- Explicit start gym selection with saved-default fallback.
- Gym-aware routine and added-exercise suggestion queries.
- Draft resume using the draft's saved gym.
- History-repeat source gym metadata while preserving entered target values.
- Race-safe asynchronous gym switching using the current controller state.
- Rest-timer-preserving controller update and durable autosave on gym switching.
- Completion/draft lifecycle coverage for non-default gym IDs.

Picker, settings, history-filter, and other UI tasks remain out of scope.

## Implementation

- Added `src/workout/gym-session.ts` with `resolveStartGymId` and immutable `rehydrateUntouchedSuggestions`.
- Updated `src/context/WorkoutContext.tsx` to load gym state, resolve start gyms, pass gym IDs to suggestion lookups, preserve source metadata, resume draft gyms, and asynchronously switch active workouts safely.
- Updated `src/screens/HistoryScreen.tsx` so repeat sets carry their source gym metadata without changing their entered weight, reps, or target values.
- Added unit coverage in `tests/unit/gym-session.test.ts`.
- Extended completion and draft lifecycle integration coverage for gym persistence.

Rehydration only replaces `previousWeightKg`, `previousReps`, `previousGymId`, and `previousGymName` on incomplete sets whose `isWeightEdited` flag is false. It does not mutate the source workout or alter entered values.

## TDD Evidence

1. Added the pure helper tests and lifecycle assertions before production implementation.
2. Focused red run failed because `src/workout/gym-session.ts` did not exist; the existing lifecycle tests passed.
3. Added the minimal pure helper; focused tests then passed.
4. Added context lifecycle behavior and reran focused tests, typecheck, and diff checks successfully.

## Verification

- `npx tsx --test tests/unit/gym-session.test.ts tests/integration/completion-lifecycle.test.ts tests/integration/draft-lifecycle.test.ts` — 15 passed, 0 failed.
- `npm test` — 126 passed, 0 failed.
- `npm run test:integration` — 85 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

## Concerns

There is no existing React provider test-renderer harness in this repository, so provider orchestration is covered through the pure helper tests plus the existing native/web controller and store lifecycle suites. Picker/settings/history UI validation remains intentionally deferred to their planned tasks.

## Fix Round 1

### Review findings addressed

1. Added a tested async orchestration seam, `switchWorkoutGym`, that captures workout ID, controller revision, workout gym ID, active exercise instance IDs, and underlying exercise-definition IDs before suggestion lookup. Results are cancelled when the request token or any captured session/exercise identity is stale, including swaps that retain an active exercise instance ID.
2. Added the same snapshot guard to `addExercisesToWorkout` through `appendExercisesToCurrentWorkout`. Added-exercise suggestions use the shared gym-aware query seam and are not appended after a gym switch, workout update, finish, replacement, or start.
3. Added provider orchestration seams and tests for default/explicit gym resolution, repeated occurrence query routing, active gym switch autosave/timer preservation, stale cancellation, current exercise graph matching, append cancellation, and repeat source resolution. Existing native/web draft lifecycle coverage verifies saved non-default gym IDs through resume and completion.
4. History-repeat source metadata now uses `detail.gymId` from freshly loaded workout detail, not the potentially stale history summary gym ID.

### Fix-round verification

- `npx tsx --test tests/unit/gym-session.test.ts tests/integration/completion-lifecycle.test.ts tests/integration/draft-lifecycle.test.ts` — 21 passed, 0 failed.
- `npm test` — 132 passed, 0 failed.
- `npm run test:integration` — 85 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

No picker, settings, or history-filter UI was added.
