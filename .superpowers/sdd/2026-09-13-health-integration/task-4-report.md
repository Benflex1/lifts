# Task 4 Report: SQLite and IndexedDB Health Sync Ledger

## Result

Implemented native SQLite migration 7 and web IndexedDB version 3 persistence for `HealthSyncRecord`, with parity for point reads, status-filtered reads, writes, ordering, and workout deletion cleanup. `DataSnapshot`, backup, restore, and merge behavior remain ledger-free.

## Changed files

- `src/database/contract.ts` — added type-only health ledger methods to `Store`; `DataSnapshot` unchanged.
- `src/database/migrations.ts` — added transactional migration 7 with the required composite primary key, provider/status checks, foreign key, and status index.
- `src/database/nativeStore.ts` — added row mapping and queued SQLite CRUD; existing foreign-key cascade removes ledger rows with workouts.
- `src/database/webStore.ts` — upgraded IndexedDB from version 2 to 3, added the required composite-key store and `status` index, added lease-protected CRUD, and deleted matching ledger rows in the workout transaction.
- `tests/integration/health-ledger.test.ts` — added migration rollback, native/web persistence, schema, deletion, and backup exclusion coverage.
- `tests/integration/web-store.test.ts` — updated an existing raw database inspection to open the new version 3 schema.

Health adapter files, package/config files, and generated native directories were not modified.

## TDD evidence

RED:

```text
npx tsx --test tests/integration/health-ledger.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts
5 failed, 46 passed; failures were the missing migration-7 behavior and missing Store ledger methods.
```

GREEN:

```text
npx tsx --test tests/integration/health-ledger.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts tests/integration/backup-roundtrip.test.ts
80 passed, 0 failed

npx tsc --noEmit
passed
```

## Regression checks

- `npm test` — 308 passed, 0 failed.
- `npm run test:integration` — 123 passed, 0 failed.
- `npx expo-doctor` — 21/21 checks passed.
- `npx expo export --platform web` — passed; web bundle exported to `dist`.
- `git diff --check` — passed before commit.

## Design ruling

The brief specifies only a composite IndexedDB key and a status index, so web deletion uses `getAll()` within the existing read-write transaction and deletes matching composite keys. This preserves atomic cleanup without adding an unrequested index. Native deletion relies on migration-time `PRAGMA foreign_keys = ON`, which is already the store’s migration invariant.

## Self-review

- Composite keys and exact field names match the brief on both stores.
- Native list queries parameterize the optional status filter and use the required ordering.
- Web writes resolve on transaction completion, not request success; writes remain lease-protected.
- Optional `syncedAt` and `lastError` values round-trip without introducing null fields into returned records.
- Backup/snapshot paths do not read or write ledger data.
- Existing v2 IndexedDB records and stores remain available after upgrade.
- No unresolved correctness concerns found.

## Commits

- `c895dd0 feat: persist health sync ledger`

## Fix round: native schema regression coverage

Addressed the medium test-quality finding without production changes. The native migration test now verifies `PRAGMA foreign_keys`, the named status index via `PRAGMA index_list`, the composite `workouts(id)` foreign key and `ON DELETE CASCADE` via `PRAGMA foreign_key_list`, both provider/status CHECK clauses from the table definition, and rejection of invalid provider/status inserts.

Fix-round verification:

- `npx tsx --test tests/integration/health-ledger.test.ts` — 5 passed, 0 failed.
- `npx tsx --test tests/integration/health-ledger.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts tests/integration/backup-roundtrip.test.ts` — 80 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `npm test` — 308 passed, 0 failed.
- `git diff --check` — passed.

Fix-round commit:

- `d67788a test: cover native health ledger schema constraints` — test-only fix.

## Fix round: device-local health sync opt-in backup isolation

Addressed the whole-branch review finding in the backup/restore slice. `health_sync_enabled` is now omitted by `buildBackupJson`, ignored while preparing restore settings, and ignored by both native and web snapshot merges. All other settings continue to export and import normally. Added integration coverage proving a local `true` value is absent from exports, an incoming legacy value cannot overwrite an existing local value, cannot create a value on an empty destination, and cannot be introduced through direct snapshot merge.

Fix-round TDD and verification:

- RED: `npx tsx --test tests/integration/backup-roundtrip.test.ts` — 29 passed, 1 failed; the new assertion observed `health_sync_enabled` in the exported settings.
- GREEN: `npx tsx --test tests/integration/backup-roundtrip.test.ts` — 30 passed, 0 failed.
- `npx tsx --test tests/integration/backup-roundtrip.test.ts tests/integration/health-ledger.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts` — 81 passed, 0 failed.
- `npm test` — 349 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Fix commit:

- One fix commit was created for this backup/restore isolation round; its ID is included in the handoff.

## Fix round: native and web device-local setting coverage

Addressed the scoped review finding by running the existing `health_sync_enabled` backup/restore/merge regression against both native and web store fixtures. The web path now explicitly covers export omission, protection of an existing local value, rejection on an empty destination, ordinary setting import, and direct snapshot merge isolation. Fixture disposal remains per-platform and all existing behavior is preserved.

Fix-round TDD and verification:

- RED: with only the web merge guard temporarily removed via `apply_patch`, `npx tsx --test tests/integration/backup-roundtrip.test.ts` produced 29 passed, 1 failed; the web iteration restored `health_sync_enabled` unexpectedly.
- GREEN: after restoring the guard, `npx tsx --test tests/integration/backup-roundtrip.test.ts` produced 30 passed, 0 failed.
- `npx tsx --test tests/integration/backup-roundtrip.test.ts tests/integration/health-ledger.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts` — 81 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

The fix commit contains only test coverage and this report update; no production behavior was changed in the fix round.
