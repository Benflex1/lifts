# Task 3 implementation report

## Implementation

- Added native SQLite migration 5 for `gyms`, the unique default-gym invariant, `exercise_gym_scopes`, `workouts.gym_id`, legacy workout backfill, and canonical draft payload normalization.
- Added native gym and exercise-scope row mappers, validation-backed CRUD, write-queue usage, and atomic gym deletion/reassignment behavior.
- Updated native completion, history/detail reads, draft persistence, snapshots, and snapshot merging to carry gym IDs and scope data.
- Added native database wrapper exports for gym and scope operations.
- Added focused migration, rollback, CRUD, scope, and snapshot integration coverage.

## Self-review

- Migration 5 is appended after migration 4 and writes its marker only after all schema/data work succeeds. The injected failure is inside the transaction, so the table, index, column, backfill, and marker roll back together.
- Gym writes use the existing native write queue; multi-record changes use one SQLite transaction. Deletion requires a distinct replacement, reassigns workouts/drafts, preserves valid JSON drafts, repairs linked scopes, and transfers default status before deleting.
- Legacy missing gym IDs normalize to `gym-default`; routines remain unchanged and drafts remain JSON-only.
- No later UI/web/backup tasks were implemented.

## Verification

- `npx tsx --test tests/integration/native-store.test.ts tests/unit/gym-scope.test.ts tests/unit/gym-profile.test.ts tests/unit/gym-history.test.ts tests/unit/gym-records.test.ts` — 32 passed, 0 failed.
- `git diff --check` — passed.
- `npx tsc --noEmit` — native Task 3 diagnostics are resolved; it remains non-zero because existing Task 4/6 and backup work is incomplete in `db.web.ts`, `webStore.ts`, `utils/backup.ts`, and `utils/restore.ts`. Those files are outside Task 3 scope and were intentionally not changed.
