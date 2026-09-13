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
