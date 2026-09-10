# Task 6 Report: Gym-Aware Workout History and Suggestions

## Scope

Implemented only Task 6 in the `multi-gym-tracking` worktree. Active session/UI work and later tasks were not implemented.

## TDD evidence

1. Added native/web integration coverage for local and foreign gym suggestions, foreign source labels, global and linked scopes, dual stats, draft exclusion, history/detail gym IDs, repeated occurrences, and same-workout empty-occurrence fallback.
2. Ran the focused tests before the implementation. Both platform cases failed because the old stores ignored gym IDs and returned flat stats.
3. Implemented the native/web loaders and wrapper/contract changes.
4. Re-ran the focused tests; all new and existing history tests passed on both platforms.

## Implementation

- Native SQLite now loads completed exercise occurrence fragments ordered by workout start time, workout ID, occurrence order, and set number; it joins gym names and treats legacy missing gym IDs as `gym-default`.
- Web IndexedDB now normalizes and sorts completed workout objects using the same ordering and occurrence fallback policy, resolving gym names from persisted profiles.
- Both stores delegate previous-set selection to `resolvePreviousSetsForExercise` and stats aggregation to `calculateDualExerciseStats`.
- Suggestions return `PreviousSetSuggestion[]`, including source gym metadata only for foreign fallback values. Global and linked-group matches remain unlabeled.
- Stats return zero-filled `DualExerciseStats` with global and scope-limited records, including `maxSetVolumeKg`, and include completed workouts only.
- Public native/web wrappers and the `Store` contract now expose the Task-6 signatures. The exercise details screen was minimally adapted to request the default gym and display the global tier so the required wrapper signature remains type-safe.
- Existing history and detail mappings continue to expose canonical `gymId` values.
- No weight conversion was added; stored kg values are used unchanged.

## Verification

- `npx tsx --test tests/integration/history-stats.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts` — 43 passed, 0 failed.
- `npm test` — 124 passed, 0 failed.
- `npm run test:integration` — 71 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Final verification was rerun after removing an incidental web history-summary sort change; the retained fix-round behavior and all existing suites remained green.

The shell profile prints pre-existing `NPM_CONFIG_PREFIX`/missing temporary `uv` environment warnings before commands; they did not affect exit status or test results.

## Fix round 1

### Review findings addressed

- Native repeated-exercise occurrence fragments now use a compact index of matching exercises, independent of interleaved exercises and their absolute SQLite `order_index`.
- Web occurrence loading now applies the same descending workout-ID tie-break as native when start timestamps match.
- Web completed suggestion sets now sort by ascending `setNumber` and then set ID; native suggestion SQL uses the same set-ID tie-break for parity.

### TDD evidence

Added native/web integration regressions for interleaved repeated occurrences, equal timestamps with IDs `tie-a`/`tie-b`, and intentionally unsorted persisted set arrays. Before the fixes, the focused run failed with native `[45]` vs expected `[65]`, web `[40]` vs expected `[50]`, and web `[20, 10]` vs expected `[10, 20]`. Each isolated fix was then run against its matching test and passed on both platforms.

### Fix-round verification

- Focused history/native/web integration command — 49 passed, 0 failed.
- `npm test` — 124 passed, 0 failed.
- `npm run test:integration` — 77 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
