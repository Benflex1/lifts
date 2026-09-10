# Task 5 implementation, self-review, and verification report

Date: 2026-09-10
Worktree: `/workspace/lifts/.worktrees/multi-gym-tracking`

## Implementation

- Added `BackupV3` and kept a separate legacy `BackupV2` input type.
- Updated backup parsing to accept v2 and v3. Legacy v2 records receive the reserved `gym-default` gym and normalized workout/draft gym IDs. V3 gym records, colors, names, IDs, timestamps, scope records, linked IDs, and workout/draft references are structurally validated alongside the existing exercise, routine, set, and draft validation.
- Updated exports to emit version 3 with gyms and exercise gym scopes. Existing `buildBackupJson()` and `exportBackup()` entry points remain unchanged; the internal export alias is now `buildV3BackupJson`.
- Added pure gym restore mapping. Source defaults and the reserved ID map to the destination default, identical non-default IDs are reused, differing collisions receive `gym-import-restore-*` IDs, and imported gym IDs are propagated through workouts, drafts, and linked scopes.
- Extended restore planning with gym/scope preview counts, gym-aware identical-workout comparison, scope conflict detection, post-mapping scope validation, and non-destructive gym/scope merge payloads. Existing settings behavior remains “import missing keys only.”
- Hardened native and web snapshot merges to validate before writes, preserve the destination default and existing gym records, reject conflicting scopes, validate all imported gym references, and retain atomic native transaction and web lease/transaction behavior. Native exercise upserts preserve child scope rows and occur before inserting scope rows to satisfy the existing foreign key.
- Updated Analytics restore summary and export label to show gym/scope counts and version 3.
- Added focused unit and integration coverage for v2 normalization, v3 validation, malformed linked IDs, gym collisions, cross-platform gym/scope round trips, preview counts, destination preservation, and conflict rollback.

## Self-review

- Task 6+ history, records, and UI behavior were not implemented.
- Source-default and reserved-`gym-default` aliases cannot create a second default gym.
- Collision remapping covers every imported workout, draft, and linked scope reference; generated IDs avoid destination/source IDs already in use.
- Gym and scope conflicts are detected during restore planning before `mergeSnapshot()` is called, and store-level validation also rejects conflicting scope writes.
- Existing workout/routine/exercise/draft conflict rules and settings conflict rule remain intact.
- Native scope foreign-key ordering is handled without weakening the existing schema.
- No changes were made outside the requested worktree.

## Verification

TDD RED phase was observed: the initial focused run failed on the new v3 expectations and missing `gym-restore` module. After implementation, the focused command passed:

```text
npx tsx --test tests/unit/backup-validation.test.ts tests/unit/gym-restore.test.ts tests/integration/backup-roundtrip.test.ts
38 tests passed, 0 failed
```

Full verification passed:

```text
npm test
123 tests passed, 0 failed

npm run test:integration
62 tests passed, 0 failed

npx tsc --noEmit
exit 0

git diff --check
exit 0
```

No concrete test or typecheck blockers remain. Device/manual validation and Expo packaging/doctor checks were not run because they are outside the requested focused verification set.

## Fix round 1 — review findings addressed

### Finding 1: strict gym validation

- Backup parsing now stores the trimmed value returned by `validateGymName()`.
- Native and web snapshot merge paths canonicalize gym names into a copied merge snapshot before any persistence operation.
- Backup parsing and both merge paths require `createdAt` to be a string and reject malformed timestamps before persistence; numeric values no longer pass through `Date.parse()` coercion.
- Focused coverage verifies trimmed names plus numeric and malformed timestamps for backup parsing and both native/web merge paths.

### Finding 2: required coverage

- Collision restore coverage now runs against both native and web destination stores and verifies the destination collision record is preserved.
- Added native and web mid-merge failure tests. Native uses the existing `NodeSqliteDriver` test fake, armed after initialization, to fail after a successful transactional write. Web uses a test-only `IDBFactory` proxy around `fake-indexeddb` that aborts the active transaction after a configured write count. Neither seam is exposed by production APIs or weakens transaction behavior.
- Both failure tests assert gyms, scopes, workouts, drafts, and settings are unchanged. The existing preflight conflicting-scope test remains.

### Fix-round TDD and verification

The new strict-validation tests were observed failing before the implementation: both stores persisted whitespace and accepted numeric timestamps, and the parser preserved whitespace. After the fixes, the focused command passed:

```text
npx tsx --test tests/unit/backup-validation.test.ts tests/unit/gym-restore.test.ts tests/integration/backup-roundtrip.test.ts
44 tests passed, 0 failed
```

Additional verification passed:

```text
npx tsx --test tests/integration/native-store.test.ts tests/integration/web-store.test.ts
35 tests passed, 0 failed

npm test
124 tests passed, 0 failed

npm run test:integration
67 tests passed, 0 failed

npx tsc --noEmit
exit 0

git diff --check
exit 0
```

Known caveats remain unchanged: device/manual validation and Expo packaging/doctor checks were not run. No Task 6+ behavior was added.
