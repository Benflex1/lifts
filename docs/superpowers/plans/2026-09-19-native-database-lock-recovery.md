# Native Database Lock Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ensure a failed native SQLite startup does not leave the app retrying against a poisoned connection that still holds a database lock.

**Architecture:** Keep the existing shared native database/store promises. When `store.init()` rejects, detach the store and database from the module state, close the failed SQLite connection best-effort, and let the next retry open a fresh connection. The reset must finish before the rejected initialization promise settles so concurrent retry callers cannot race the cleanup.

**Tech Stack:** Expo SDK 57, expo-sqlite 57.0.3, TypeScript, Node test runner with module mocks.

**Spec:** User-reported startup error: `NativeStatement.finalizeAsync` rejected with `database is locked`.

## Global Constraints

- Do not change the SQLite schema, migrations, or persisted user data.
- Keep the fix native-only; web storage behavior must remain unchanged.
- Preserve concurrent `getDatabase()`/`getStore()` coalescing and sequential `initDatabase()` behavior.
- Do not silently delete or reset the database file; only close and discard the failed in-memory connection.
- Use one implementation/fix pass and verify focused plus full automated checks before completion.

## Review Focus

- A migration/seed failure must close the failed connection before a retry starts; test that the retry opens a different database object.
- A failed `closeAsync()` must not mask the original initialization error or prevent retry; test best-effort cleanup.
- Concurrent callers during failed initialization must share the same failure and must not start a second open before cleanup finishes; test the promise boundary.
- A successful initialization must retain the existing sequential-call behavior; preserve the existing regression test.
- Web builds must not include or execute the native reset path; retain the web export verification.

### Task 1: Reset failed native initialization state

**Files:**
- Modify: `src/database/db.native.ts`
- Modify: `tests/unit/native-db.test.ts`

**Interfaces:**
- `initDatabase(): Promise<void>` remains the public startup entry point.
- Add only private native helpers/state; do not change the `Store` or `SqliteDriver` contracts.

- [x] **Step 1: Write failing recovery tests**

Added isolated module-mock tests where `openDatabaseAsync()` returns `databaseOne` then `databaseTwo`, the first store initialization rejects, the failed connection is closed, and cleanup failure preserves the original initialization error.

- [x] **Step 2: Run the focused tests and verify they fail**

```bash
node --experimental-test-module-mocks --import tsx --test tests/unit/native-db.test.ts
```

Expected: the new tests fail because `initDatabase()` currently clears only its promise; the failed store and `dbInstance` remain cached, so the retry reuses the original connection and does not close it.

Evidence: pre-fix focused run exited 1 with 6 passing tests and both new recovery tests failing for the expected cached-connection behavior.

- [x] **Step 3: Implement best-effort failed-connection reset**

Add a private helper in `src/database/db.native.ts` that captures the current `SQLiteDatabase`, clears `storeInstance`, `storePromise`, `dbInstance`, and `databaseOpenPromise`, then awaits `database.closeAsync()` inside a swallowed cleanup catch. In `initDatabase()`, catch the initialization error, await that helper, rethrow the original error, and keep the existing `finally` that clears `initPromise`:

```ts
initPromise = getStore()
  .then((store) => store.init())
  .catch(async (error) => {
    await resetFailedNativeDatabase();
    throw error;
  })
  .finally(() => {
    initPromise = null;
  });
```

Do not close a healthy connection after success, and do not alter web code.

- [ ] **Step 4: Run focused and full verification**

```bash
node --experimental-test-module-mocks --import tsx --test tests/unit/native-db.test.ts
npm test
npm run test:integration
npx tsc --noEmit
npx expo export --platform web
```

Expected: all commands exit successfully; the focused suite includes the new failed-connection recovery cases, and the web bundle remains native-module safe.

Evidence: post-fix focused run exited 0 with 8 passing tests. The long full-suite, integration, typecheck, and web-export commands were intentionally not run per the user request for independent verification.

- [x] **Step 5: Commit**

```bash
git add src/database/db.native.ts tests/unit/native-db.test.ts docs/superpowers/plans/2026-09-19-native-database-lock-recovery.md
git commit -m "fix: reset failed native database connections"
```

Evidence: committed with the requested message after staging only the scoped plan, native source, and unit test files.
