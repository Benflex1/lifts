# Task 4 Implementation / Self-Review / Verification Report

## Implementation

- Upgraded IndexedDB opening from version 1 to version 2.
- Added `gyms` (`id` key, `isDefault` index) and `exercise_gym_scopes` (`exerciseId` key, `scopeType` and multi-entry `linkedGymIds` indexes) stores.
- Seeded the canonical `gym-default` during upgrade and normalized legacy workout/draft payloads during writer initialization and read mapping.
- Added web gym profile CRUD with trimmed/length-bounded names, palette color validation, default selection, lease-protected writes, and atomic deletion/reassignment across workouts, drafts, gyms, and scopes.
- Added scope CRUD with exercise existence and linked-gym validation, plus lease protection.
- Added canonical gym/scope snapshot read and merge support while preserving the existing “settings only if missing” merge rule and rejecting dangling references.
- Added the ten web database wrappers and compatibility domain/contract types required by the web persistence slice.
- Added focused integration coverage for v1 upgrade, legacy normalization, CRUD/default rules, scope validation, atomic reassignment, snapshots, leases, and read-only rejection.

## Self-review

- Existing workout/draft/routine/settings behavior remains covered by the original web and native integration suites.
- Every new mutating web operation calls `verifyAndRenewLease()` before writing.
- Legacy records are normalized in one writer transaction and safely mapped in memory for read-only tabs.
- Gym deletion updates references before deleting the gym in a single IndexedDB transaction; default reassignment is conditional on deleting the default gym.
- Snapshot merge accepts legacy snapshots without gym arrays for compatibility, normalizes missing workout/draft gym IDs, validates supplied gym references, and avoids importing a second default.
- Later backup/history/UI work was not implemented.
- The requested brief path was absent from this checkout; the reviewed Task 4 section and design spec were used as the implementation authority. Task 1–3 production contracts were also absent, so compatibility fields were added to the shared types/contract without modifying native persistence.

## Verification

- `npx tsx --test tests/integration/web-store.test.ts` — 16 passed.
- `npx tsx --test tests/integration/web-store.test.ts tests/integration/native-store.test.ts` — 32 passed.
- `npm test` — 118 passed.
- `npm run test:integration` — 57 passed.
- `npx tsc --noEmit` — two known Task 5 diagnostics remain at `src/utils/backup.ts:399` and `src/utils/restore.ts:202`; no Task 4 diagnostics remain.
- `git diff --check` — passed.

## Concerns

- The shared `Store` contract now contains one required declaration for each Task 1 gym/profile/scope operation; native implementations from the preceding tasks satisfy those declarations.
- `Workout.gymId` remains required in the canonical Task 1 types; web persistence still normalizes missing legacy records to `gym-default` during upgrade and reads.

## Fix-round 1

- Routed web gym name/color/deletion and exercise-scope validation through the canonical shared validators; the web palette now exactly matches native.
- Added merge preflight validation for duplicate gym/scope IDs, gym profile values, exercise existence, scope type/cardinality, and all referenced gyms before any IndexedDB writes.
- Matched native default-first/name ordering in `getGyms()` and issued the gym deletion request after reference updates are scheduled.
- Added focused tests for exact validation parity, ordering, repeated upgrade persistence, read-only legacy reads, invalid merge atomicity, and invalid scope types.
- The corrected branch verification is 32 focused integration passes, 118 unit passes, and 57 full integration passes. Typecheck remains limited to the two expected Task 5 backup/restore diagnostics listed above.

## Fix-round note (correct integration worktree)

This report was corrected in `/workspace/lifts/.worktrees/multi-gym-tracking` after the Task 4 commit was cherry-picked into the reviewed integration branch. The cherry-pick had combined the required Task 1 gym/scope declarations with duplicate optional declarations and had promoted previous-set/stat signatures to their Task 6 forms. The contract now has exactly one required declaration for each gym/profile/scope method, while `getPreviousSetsForExercise(exerciseId, occurrenceIndex?)` returns legacy `WorkoutSet[]` and `getExerciseStats(exerciseId)` returns the existing flat stats. Web/native wrappers remain legacy through Task 5; gym-aware query algorithms are deferred to Task 6.

The corrected worktree verification produced 29 passing focused web/native integration tests. `npx tsc --noEmit` is otherwise clean; the remaining two diagnostics are the expected Task 5 backup/restore construction errors caused by the now-required snapshot gym/scope arrays:

- `src/utils/backup.ts:399` — legacy `BackupV2` construction lacks Task 5 gym/scope fields.
- `src/utils/restore.ts:202` — legacy restore snapshot construction lacks Task 5 gym/scope fields.
