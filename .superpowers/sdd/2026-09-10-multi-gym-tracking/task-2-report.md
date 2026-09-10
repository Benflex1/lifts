# Task 2 Report: Shared History Suggestion and Record Algorithms

## Implementation summary

Implemented the shared pure algorithms for gym-aware previous-set suggestions and dual-tier exercise records.

- `resolvePreviousSetsForExercise` delegates scope resolution to the Task 1 policy helpers, uses the caller-provided newest-first occurrence order, filters to completed occurrences, and labels only foreign-gym fallbacks.
- `calculateDualExerciseStats` aggregates global and scope-limited records from completed `Workout[]` input, including max weight, max single-set volume, max reps, estimated 1RM, and distinct workout session count.
- No storage, UI, sorting, persistence, or raw weight conversion was added.

## Files changed

- `src/workout/gym-history.ts`
- `src/workout/gym-records.ts`
- `tests/unit/gym-history.test.ts`
- `tests/unit/gym-records.test.ts`

## Commands and results

- `npx tsx --test tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts`
  - GREEN: 5 tests passed, 0 failed.
- `npx tsx --test tests/unit/gym-scope.test.ts tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts tests/unit/workout-sets.test.ts tests/unit/analytics.test.ts`
  - GREEN: 35 tests passed, 0 failed.
- `git diff --check`
  - Passed with no whitespace errors.
- `npx tsc --noEmit`
  - Fails on existing Task 1 integration points in native/web database stores, backup/restore, and history wrappers that still implement the old contracts. No errors originate from the two new algorithm modules or their tests.

## RED/GREEN evidence

### RED

Immediately after adding the new tests, before production modules existed:

`npx tsx --test tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts`

failed with `MODULE_NOT_FOUND` for `src/workout/gym-history` and `src/workout/gym-records`, confirming the tests exercised the missing feature.

### GREEN

After implementing the modules, the focused command passed all 5 tests. The specified regression command subsequently passed all 35 tests.

## Self-review findings

- History selection preserves input order and does not sort.
- Global exercises allow every gym and never receive a source label.
- Gym-specific and linked-group scopes use `getAllowedGymIds`; fallback labels contain both source gym fields.
- Records include only `isCompleted === true` sets and count each qualifying workout once.
- Global and gym records are independent zero-filled records when no data matches.
- Record calculations use raw `weightKg`, `weightKg * reps`, and `calculate1RM(...).average`.
- Changes are limited to the requested pure modules and unit tests, aside from this required report.

## Concerns

The repository-wide TypeScript check remains failing because downstream Task 1 store/backup/restore integrations have not yet been migrated to the new canonical contracts. The required focused unit/regression suites pass.

## Fix round 1

### Review findings addressed

- Changed non-global history fallback to select the first occurrence with completed sets, preserving the caller-provided newest-first order instead of blindly using an empty `occurrences[0]`.
- Expanded unit coverage for the full Task 2 contract: max single-set volume, max reps, estimated 1RM, zero-filled records, duplicate occurrence/session counting, linked and global scope behavior, incomplete-set exclusion, and empty-newest-occurrence fallback.

### Fix-round TDD evidence

- RED: after adding the empty-newest regression test and before the production fix, `npx tsx --test tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts` failed 1 of 9 tests. The failure was the expected `TypeError` from the missing suggestion caused by the empty first occurrence; the other 8 tests passed.
- GREEN: after the minimal fallback fix, the focused command passed 9 of 9 tests.

### Fix-round verification

- `npx tsx --test tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts`: 9 passed, 0 failed.
- `npx tsx --test tests/unit/gym-scope.test.ts tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts tests/unit/workout-sets.test.ts tests/unit/analytics.test.ts`: 39 passed, 0 failed.
- `git diff --check`: passed.

### Fix-round self-review and concerns

The fix remains limited to the Task 2 history/records modules and their tests; no later-task storage or UI code was changed. Existing concern remains unchanged: repository-wide TypeScript integration errors are in downstream Task 1 store/backup/restore code, while all requested focused and relevant regression tests pass.
