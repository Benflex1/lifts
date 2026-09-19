# Native Database Startup Lock Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Prevent concurrent native SQLite connections or initialization transactions from locking the database during app startup.

**Architecture:** Coalesce native `getDatabase()` and `getStore()` calls behind one shared database-open promise so startup callers share one `expo-sqlite` connection and one store instance. Coalesce concurrent `initDatabase()` calls behind a separate initialization promise, clear it after either settlement so explicit calls retain their existing lifecycle, and preserve retry-after-failure behavior.

**Tech Stack:** Expo SDK 57, expo-sqlite, TypeScript, Node test runner with module mocks.

**Spec:** User-reported native startup error: `NativeStatement.finalizeAsync` rejected with `database is locked`.

## Global Constraints

- Do not change the SQLite schema, migrations, or user data.
- Do not add retries that hide an initialization race; serialize the root operation instead.
- Preserve retry-after-failure behavior in the storage error screen.
- Keep web behavior unchanged; the fix is limited to `src/database/db.native.ts`.
- Use test-first development and run the focused native database test for this targeted review-fix pass.

## Task 1: Serialize native store and database initialization

**Files:**
- Modify: `src/database/db.native.ts`
- Modify: `tests/unit/native-db.test.ts`

**Interfaces:**

```ts
export async function getStore(): Promise<Store>;
export async function initDatabase(): Promise<void>;
```

- [x] **Step 1: Add failing concurrency tests**

Keep the existing test that calls `getStore()` twice before the mocked `openDatabaseAsync()` resolves and asserts one open call plus the same store object. Add isolated-module tests that interleave `getDatabase()` and `getStore()`, verify a failed shared open can be retried, invoke `initDatabase()` twice while a mocked store `init()` is gated, assert successful sequential calls invoke `init()` twice, and assert rejected initialization clears the in-flight promise so a later retry can run again.

- [x] **Step 2: Run the focused tests and verify they fail**

```bash
node --experimental-test-module-mocks --import tsx --test tests/unit/native-db.test.ts
```

Expected: the interleaved database/store test fails with two `openDatabaseAsync` calls, the open-retry test observes stale in-flight state, and the sequential initialization test observes only one `store.init()` call.

Observed before the production change: the interleaved database/store test made two opens, the failed-open retry test made three opens, and the sequential initialization test called `store.init()` once instead of twice.

- [x] **Step 3: Coalesce native startup promises**

Add a private module-level database-open helper/promise shared by `getDatabase()` and `getStore()`. On open failure, clear the in-flight promise and cached database so retry can recover. Keep store construction behind its own in-flight promise. `initDatabase()` must create one promise around `getStore().then(store => store.init())`, clear it in `finally`, and let concurrent callers share it while later explicit calls invoke `store.init()` again.

- [x] **Step 4: Run focused verification**

```bash
node --experimental-test-module-mocks --import tsx --test tests/unit/native-db.test.ts
```

Focused verification for this review-fix pass completed with 6 tests passed and 0 failures. No long full-suite checks were run, per the targeted review-fix instructions.

- [x] **Step 5: Commit**

```bash
git add src/database/db.native.ts tests/unit/native-db.test.ts docs/superpowers/plans/2026-09-19-native-database-startup-lock.md
git commit -m "fix: serialize native database startup"
```

Finalization evidence: the focused native database test command completed with 3 passing tests and 0 failures. The existing production change and isolated module-mock tests were retained; no full-suite checks were run during finalization per task instructions.
