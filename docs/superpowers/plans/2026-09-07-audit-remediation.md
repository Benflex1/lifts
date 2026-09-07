# Lifts Audit Remediation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only when parallel agent work is authorized. Steps use checkbox syntax for tracking.

**Goal:** Resolve the audit's data-loss and logging defects and deliver an honestly documented, testable free workout tracker.

**Architecture:** Retain platform-specific database adapters and the current screens. Introduce a shared storage contract, isolated draft storage, serialized mutations, a testable workout lifecycle, and a self-contained backup format. Use SQLite on native and IndexedDB on web; keep React state as the current view of durable data rather than a substitute for it.

**Tech Stack:** Existing Expo 57, React Native 0.86, TypeScript 6, expo-sqlite, and tsx/node:test. Proposed additions: expo-document-picker for native restore; fake-indexeddb and Playwright for persistence/browser regression tests. Resolve compatible versions through Context7 and the installed SDK before installation.

**Spec:** [Audit remediation design](../specs/2026-09-07-audit-remediation-design.md). Read it before execution. The earlier parity-pass plan is historical context, not an implementation recipe for this work.

## Global constraints

- Keep the app free, local-first, account-free, and without ads or tracking.
- Preserve existing native workout history, routines, custom exercises, settings, and unfinished drafts through migrations.
- Store canonical weights in kg; changing display units must not rewrite stored weights.
- Keep zero kg valid. Never invent a weight when completing a set.
- Preserve the original workout start timestamp across minimize, background, restart, and recovery.
- Finish and discard must be durable before the UI drops the active session.
- Storage failures must be visible and retryable; never silently fall back to temporary storage.
- Retain the existing Expo 57 / React Native 0.86 stack unless a verified compatibility issue requires a change.
- Add no backend, subscriptions, cloud accounts, or required paid build service.
- Do not claim native-device verification, legal provenance, or store availability without evidence.

## Sequence and change boundaries

Execute 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. These are reviewable milestones, not a single unchecked rewrite. After each task, run its targeted regression checks and the existing tests/typecheck; commit only the task's files if committing is part of the execution workflow. Do not mass-stage unrelated edits.

| Task | Result | Principal files |
| --- | --- | --- |
| 1 | Native storage and migration safety | `src/database/db.native.ts`, new `contract.ts`, `nativeStore.ts`, `migrations.ts`, `writeQueue.ts` |
| 2 | Durable, correctly seeded web storage | `src/database/db.web.ts`, new `webStore.ts`, `seedData.ts`, `src/context/StorageContext.tsx`, `App.tsx` |
| 3 | Safe session lifecycle and recovery | `src/context/WorkoutContext.tsx`, new `src/workout/session.ts`, `DraftResumeBanner.tsx`, new `DraftRecoveryModal.tsx` |
| 4 | Correct inputs and routine targets | new `src/workout/sets.ts`, `src/types/index.ts`, `WeightInput.tsx`, workout screens and adapters |
| 5 | Working confirmations and completion | new `src/context/DialogContext.tsx`, new `src/components/WorkoutSummaryModal.tsx`, affected screens, `App.tsx` |
| 6 | Complete export and atomic restore | `src/utils/export.ts`, new `backup.ts`, `restore.ts`, `pickBackup.native.ts`, `pickBackup.web.ts`, both stores |
| 7 | Reachable units and consistent statistics | settings context, new `SettingsModal.tsx`, calculators, history/PR queries |
| 8 | Truthful docs and open-source provenance | `README.md`, `ROADMAP.md`, `LICENSE`, new `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md`, `docs/data-provenance.md` |
| 9 | Enforced checks and release evidence | `package.json`, new `.github/workflows/ci.yml`, `playwright.config.ts`, `docs/release-checklist.md` |

## Task 1: Protect native storage and migrations

**Modify:** `src/database/db.native.ts`, `src/database/db.ts`, `App.tsx`, `package.json`.
**Create:** `src/database/contract.ts`, `src/database/nativeStore.ts`, `src/database/migrations.ts`, `src/database/writeQueue.ts`, `tests/helpers/storeFixture.ts`, `tests/integration/native-store.test.ts`.

**Interfaces:** Define `WorkoutDraft = { version: 1; workout: Workout; savedAt: string; revision: number; restTimer: { endsAt: number; totalSeconds: number } | null }` in `contract.ts`. Define `DataSnapshot = { workouts: Workout[]; routines: Routine[]; exercises: Exercise[]; drafts: WorkoutDraft[]; settings: Record<string, string> }`. A `Store` exposes `readSnapshot(): Promise<DataSnapshot>`, `saveDraft(draft: WorkoutDraft): Promise<void>`, `finishWorkout(workout: Workout): Promise<void>`, `discardDraft(id: string): Promise<void>`, and `mergeSnapshot(snapshot: DataSnapshot): Promise<void>` in addition to the existing public query/CRUD operations. Platform wrappers retain existing query exports during the transition.

- [x] Establish `createStoreFixture(platform: 'native' | 'web')` in `tests/helpers/storeFixture.ts`, returning `{ store, reopen, dispose }`; `reopen` returns a new adapter against the same temporary database. Native integration tests must execute the actual migration/query code through an injected SQLite driver, not a separate mock implementation of the repository. A Node SQLite driver can cover SQL behavior; a native-device check must still cover Expo-specific behavior.
- [x] Create an old-schema fixture containing a completed workout, two drafts, a custom exercise, a routine, and a unit setting. Add assertions for reopening/migrating twice without changing any IDs, notes, weights, timestamps, or counts. Inject a migration failure and assert rollback leaves the old records intact. Add a failed-write test followed by a successful write to prove the write queue recovers.
- [x] Run `npx tsx --test tests/integration/native-store.test.ts` and record failures before implementation.
- [x] Extract production SQL into `nativeStore.ts` with an injected database interface. Keep the native platform wrapper responsible for opening Expo SQLite. Use a numbered transactional migration and a dedicated `workout_drafts` table containing versioned JSON snapshots. Convert every old in-progress workout to a draft, then remove its old normalized rows in the same transaction. Keep completed rows intact. Never reseed over user changes.
- [x] Route all mutations through one queue per database; transaction callbacks must operate on their transaction connection. Configure foreign keys on every connection before transaction work. Export reads must observe a consistent snapshot. Replace blanket migration exception swallowing with explicit schema/version checks and propagated failures. Preserve routine creation/last-performed metadata when editing routines.

Queue behavior to implement in `writeQueue.ts`:

```ts
export function createWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => undefined);
    return result;
  };
}
```

- [x] Replace `App.tsx`'s unconditional ready state after failure with loading/ready/error states and a Retry action. No main UI or providers may issue storage reads before initialization succeeds.
- [x] Rerun the integration test, `npm test`, and `npx tsc --noEmit`. On native, upgrade an existing fixture installation and verify no data disappears. Gate: initialization failures are visible; transaction rollback and migration idempotence are demonstrated.

## Task 2: Persist web data and unify seeds

**Modify:** `src/database/db.web.ts`, `src/database/db.native.ts`, `App.tsx`, `package.json`.
**Create:** `src/database/webStore.ts`, `src/database/seedData.ts`, `src/context/StorageContext.tsx`, `tests/integration/web-store.test.ts`, `tests/unit/seed-data.test.ts`.

**Consumes:** `Store`, `DataSnapshot`, and `WorkoutDraft` from Task 1.
**Produces:** `createWebStore(name: string): Promise<Store>`; shared `DEFAULT_ROUTINES` with exact exercise IDs; `StorageContext` exposes ready/error/read-only state to mutation controls.

- [x] Add fake-indexeddb as a test-only dependency after checking current documentation. Extend `createStoreFixture('web')` to reopen the production adapter against the same named database. Test every user record type across adapter recreation, including settings and drafts; test transaction abort without partial writes.

```ts
const fixture = await createStoreFixture('web');
const before = await fixture.store.readSnapshot();
const reopened = await fixture.reopen();
assert.deepEqual(await reopened.readSnapshot(), before);
await fixture.dispose();
```

- [x] Add seed tests asserting 876 unique exercise IDs and exact ID equality for each routine's embedded exercise. Run `npx tsx --test tests/integration/web-store.test.ts tests/unit/seed-data.test.ts` before implementation.
- [x] Implement IndexedDB stores for exercises, routines, workouts, drafts, settings, and metadata with explicit schema versioning. Resolve mutations only on transaction completion, not individual request success. Update an optional read cache only after commit; initialization must load saved data rather than replace it.
- [x] Extract the native PPL templates into shared `seedData.ts`; use them on both platforms. Load the full bundled library. Resolve by exact ID and throw on missing references. Seed only absent built-in records on first initialization; later launches must not overwrite edits.
- [x] Add a single-writer browser lease in an IndexedDB metadata transaction, with heartbeat/expiry and owner checks inside each write transaction. A second tab becomes visibly read-only. A tab that loses the lease retains pending edits and offers export/retry rather than overwriting another tab's data. Test lease expiry, takeover, and stale-writer rejection with an injected clock.
- [x] If storage is denied or full, show a persistent error with retry/export options and keep unsaved state. Do not substitute module-memory storage. Verify actual browser reload, tab close/reopen, second-tab behavior, and storage denial. Explain that data already lost by the old preview cannot be recovered.
- [x] Run targeted tests, `npm test`, `npx tsc --noEmit`, and a web bundle build. Gate: all saved records survive reload and seed identities match on both platforms.

## Task 3: Make the workout lifecycle durable

**Modify:** `src/context/WorkoutContext.tsx`, `src/components/DraftResumeBanner.tsx`, `src/screens/WorkoutScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/utils/timer.ts`.
**Create:** `src/workout/session.ts`, `src/components/DraftRecoveryModal.tsx`, `tests/unit/session.test.ts`, `tests/integration/draft-lifecycle.test.ts`.

**Consumes:** queued `Store` operations and `WorkoutDraft`.
**Produces:** `createSessionController(store: Store, now: () => number)` returning `start(workout: Workout): Promise<void>`, `update(workout: Workout): void`, `flush(): Promise<void>`, `resume(draft: WorkoutDraft): void`, `finish(): Promise<Workout>`, `discard(): Promise<void>`, and `getState()`. State contains `phase: 'idle' | 'starting' | 'active' | 'finishing' | 'discarding'`, active workout, and persistence error. Context owns rendering, haptics, and subscription cleanup; the controller owns lifecycle ordering.

- [ ] Write deterministic controller tests using an injected clock and deferred storage promises. Cover start/start, draft/finish, draft/discard, finish/finish, failed finish/retry, background flush, and active-session replacement. A request arriving during a transition must not create a second session.
- [ ] Create a 20-minute draft and assert recovery leaves `startTime` unchanged. Finish at a known clock value and assert exact elapsed seconds. Add old zero-duration draft recovery using its original timestamp. Test expired and unexpired rest deadlines.

```ts
const started = '2026-09-07T10:00:00.000Z';
assert.equal(computeElapsedSeconds(started,
  Date.parse('2026-09-07T10:20:00.000Z')), 1200);
// Controller test also asserts resumed.workout.startTime === started.
```

- [ ] Run `npx tsx --test tests/unit/session.test.ts tests/integration/draft-lifecycle.test.ts` before implementation.
- [ ] Implement synchronous transition guards before awaits. Start should await its first durable draft write before reporting success. Persist dirty snapshots at least every three seconds during continued editing; flush after completed-set changes and background transitions. Debounce alone must not indefinitely postpone saves.
- [ ] Capture a snapshot revision/generation on scheduling. Finish/discard invalidates pending callbacks, drains any in-flight write, and makes the final durable operation. Completed-workout insertion/update and matching draft removal must share one transaction. A failed finish/discard restores an editable active phase with the data retained.
- [ ] Remove timestamp rebasing; recompute duration when saving/recovering/finishing. Save rest-deadline metadata with draft snapshots. Clear interval listeners on unmount and avoid relying on asynchronous page-unload writes for web durability.
- [ ] Guard Start Empty, routine start, and Repeat at the controller boundary as well as in the UI. Existing sessions offer Resume/Cancel. Render all migrated drafts in a recovery selector; resuming one must not delete the others. Keep durable draft state in sync after finish/discard.
- [ ] Run lifecycle tests plus existing checks. Gate: no completed workout becomes a draft again, no discarded draft reappears, and failed writes never clear the active workout.

## Task 4: Correct set logging, targets, and identity

**Modify:** `src/context/WorkoutContext.tsx`, `src/types/index.ts`, `src/components/WeightInput.tsx`, `src/screens/ActiveWorkoutScreen.tsx`, both stores and migrations as needed.
**Create:** `src/workout/sets.ts`, `tests/unit/workout-sets.test.ts`.

**Interfaces:** `initialReps(target: string, setIndex: number, previousReps?: number): number`; `validateCompletedSet(set: WorkoutSet): string | null`; `ActiveExercise.targetReps?: string`. Preserve these target labels in drafts and saved workouts using an additive nullable native column. The numeric `weightKg` field remains numeric; zero is a valid value rather than a missing-value sentinel.

- [ ] Add failing behavior tests with the exact intended semantics:

```ts
assert.equal(initialReps('5', 0), 5);
assert.equal(initialReps('6-8', 0, 12), 6);
assert.equal(initialReps('10, 8, 6', 1), 8);
assert.equal(initialReps('10, 8, 6', 4), 6);
assert.equal(initialReps('AMRAP', 0, 12), 12);
```

- [ ] Add completed-set tests for 0 kg, a previous 60 kg set followed by explicit 0 kg, fractional weights, negative/non-finite input, integer reps, and repeated occurrences of the same exercise. Run `npx tsx --test tests/unit/workout-sets.test.ts` and confirm the current behavior fails.
- [ ] Initialize suggested weights and reps at set creation. Completion validates and toggles the current values; remove the fallback chain that manufactures 20 kg or replaces zero. Keep fixed/range/per-set/AMRAP targets visible. Unsupported free-form target text remains visible and falls back to previous reps or ten; do not silently reinterpret it as a numeric prescription.
- [ ] Make weight entry commit before Complete and Finish consume the snapshot. Preserve raw decimal text while typing, accept decimal point/comma consistently, and display validation errors for invalid numeric input. A unit switch while editing must commit using the old unit or explicitly retain/cancel that edit before converting.
- [ ] Replace timestamp-derived workout/exercise/set IDs with collision-resistant IDs generated at creation. Keep IDs stable through reorder, save, and recovery. Use occurrence IDs to distinguish repeated exercises and prevent set-primary-key collisions.
- [ ] Test Finish while a weight input remains focused and fast Complete taps in the UI. Run all targeted and existing checks. Gate: zero stays zero, target five starts at five, and the last typed value reaches storage.

## Task 5: Repair completion and cross-platform dialogs

**Modify:** `App.tsx`, `src/screens/ActiveWorkoutScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/screens/WorkoutScreen.tsx`, `src/components/FolderManageModal.tsx`, `src/components/DraftResumeBanner.tsx` and other mutation error call sites.
**Create:** `src/context/DialogContext.tsx`, `src/components/WorkoutSummaryModal.tsx`, `tests/e2e/workout-lifecycle.spec.ts`.

**Interfaces:** `useDialog()` supplies `confirm(options: { title: string; message: string; confirmLabel: string; destructive?: boolean }): Promise<boolean>` and `notify(options: { title: string; message: string }): Promise<void>`. Put the provider above all screens. The App owns `completedWorkout: Workout | null`; the logger reports successful completion via `onCompleted(workout: Workout)`.

- [ ] Introduce the browser test harness with a fresh storage context per test and a real served app. Test Complete → persisted history → visible summary → dismiss → History; test cancel/confirm deletion and discard, including keyboard focus and Escape/back behavior. Add a failed-save case that keeps the workout editable.
- [ ] Run `npx playwright test tests/e2e/workout-lifecycle.spec.ts` before wiring the fixes. The summary and web confirmation assertions should fail on the current implementation.
- [ ] Render the summary above the conditional logger/tab switch in `App.tsx`. Navigate and refresh History when the summary is dismissed. Disable Finish during its in-flight operation; do not treat optional haptic failures as database-save failures.
- [ ] Replace `Alert.alert` dependencies with the application dialog provider. Cancel resolves false and changes no data; only explicit confirm starts a destructive mutation. Errors remain visible through `notify` or inline error state. Add accessibility labels, dialog roles where supported, focus management, and busy states to affected controls.
- [ ] Verify native Android back and iOS dismissal, plus browser keyboard/mouse behavior. Run targeted tests, `npm test`, and `npx tsc --noEmit`. Gate: successful completion has a reachable summary and History; every web confirmation path works.

## Task 6: Ship complete, restorable backups

**Modify:** `src/utils/export.ts`, `src/screens/AnalyticsScreen.tsx`, both stores, `package.json`, `tests/unit/export.test.ts`.
**Create:** `src/utils/backup.ts`, `src/utils/restore.ts`, `src/utils/pickBackup.native.ts`, `src/utils/pickBackup.web.ts`, `tests/unit/backup-validation.test.ts`, `tests/integration/backup-roundtrip.test.ts`.

**Interfaces:** `BackupV2 = DataSnapshot & { version: 2; exportedAt: string }`; `parseBackup(json: string): BackupV2`; `pickBackupJson(): Promise<string | null>`; `restoreBackup(json: string, store: Store): Promise<void>`. A public `buildBackupJson()` now reads the store's consistent snapshot rather than history summaries.

- [ ] Build a round-trip fixture containing two occurrences of one exercise, zero/fractional weights, all set types, RPE, exercise/workout notes, targets, a custom exercise, routines, settings, completed history, and drafts. Export → empty destination restore → compare semantic content, ignoring only export timestamps.

```ts
const json = JSON.stringify({ version: 2,
  exportedAt: new Date().toISOString(), ...await source.readSnapshot() });
await restoreBackup(json, destination);
assert.deepEqual(await destination.readSnapshot(), await source.readSnapshot());
```

- [ ] Test malformed JSON, unknown versions, v1 summary-only data, duplicate IDs, missing exercise references, non-finite/negative weights, invalid timestamps and set types, invalid RPE, repeated import, conflicting IDs, and transaction failure halfway through restore. Run `npx tsx --test tests/unit/backup-validation.test.ts tests/integration/backup-roundtrip.test.ts` before implementation.
- [ ] Make exports self-contained: include custom exercises and definitions for every referenced bundled exercise, complete workouts/sets, routine metadata, drafts, and user settings. Exclude internal schema versions, browser leases, and migration metadata from user settings.
- [ ] Validate an unknown parsed object explicitly before any writes. Set a documented initial 50 MiB file limit and check selected-file size before reading on both platforms. Reject oversize files without changes. Never claim a v1 summary file can restore missing sets.
- [ ] Add native document picking through an SDK-compatible expo-document-picker installation; use cache copying before reading native files. Web uses the selected File. Cancellation is a no-op. Show a preview of record counts and merge semantics before confirmation.
- [ ] Implement a single-transaction merge: insert missing records in dependency order, skip identical records, abort all changes on conflicting IDs. Preserve existing settings; import only missing setting keys and show that rule in the preview. Block restore while active/starting/finishing/discarding. Refresh settings, history, routines, custom-exercise caches, and recovery state after success.
- [ ] Confirm both cross-platform directions, native → web and web → native, on actual runtime builds. Run targeted tests and existing checks. Gate: restored sets and PRs match the source and a failed import changes nothing.

## Task 7: Expose settings and correct history-derived behavior

**Modify:** `src/context/SettingsContext.tsx`, `src/screens/WorkoutScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/screens/ExercisesScreen.tsx`, `src/screens/AnalyticsScreen.tsx`, `src/components/PlateCalculatorModal.tsx`, both stores.
**Create:** `src/components/SettingsModal.tsx`, `tests/integration/history-stats.test.ts`, `tests/e2e/settings.spec.ts`.

**Interfaces:** `setUnit(unit: WeightUnit): Promise<void>` resolves after persistence. Settings loading/error state is explicit. Reuse `useDialog()` for save errors. Existing `getExerciseStats`, `getPreviousSetsForExercise`, and `getWorkoutDetail` retain their signatures.

- [ ] Add a browser regression for opening Settings, selecting lb, reloading, and observing lb in logger/history/calculators. Record the canonical database weight before/after and assert equality. Test a rejected settings write without falsely showing a persisted success.
- [ ] Add integration tests proving drafts never count toward completed-workout PRs/session totals and edits/deletes refresh derived results. Include repeated exercise occurrences and a recent session with no completed sets. Run `npx tsx --test tests/integration/history-stats.test.ts` before implementation.
- [ ] Add an accessible Settings entry in the Workout header and a kg/lb selector. Await storage before finalizing selection, preserving or rolling back the displayed preference on failure. Ensure loading does not flash an incorrect persisted preference.
- [ ] Compute PRs and previous-set suggestions only from completed workout data. Count sessions once even when an exercise appears twice. Prefer the latest session containing completed sets for suggestions and map repeated occurrences deterministically. Use consistent one-rep calculation behavior across exercise statistics and the standalone calculator.
- [ ] Make Repeat reconstruct the selected historical workout's exercise order, counts, and targets instead of substituting a subsequently edited routine. Preserve historical values as suggestions and reset completion flags. Keep the active-session guard from Task 3.
- [ ] When calculator units change, convert existing input using the old unit rather than reinterpret the same digits. Align lb bar/plate options and percentage tables with the actual documented list. Test plate remainders and changing units during input.
- [ ] Verify that saving/deleting/renaming data refreshes screens and custom-exercise caches; a renamed/deleted selected folder resets to All. Run targeted tests and existing checks. Gate: users can change units and all displayed statistics are derived from the intended persisted data.

## Task 8: Correct documentation and establish provenance

**Modify:** `README.md`, `ROADMAP.md`, `LICENSE` only where ownership is established.
**Create:** `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md`, `docs/data-provenance.md`.

- [ ] Trace the bundled exercise JSON and shipped image/icon assets to upstream sources using repository history and verifiable upstream content. Record source URL, revision/hash, transformations, license text, and redistribution requirements. Do not infer public-domain status from naming or resemblance. If the provenance cannot be established, document it as a distribution blocker for those assets rather than fabricate attribution.
- [ ] Preserve the Expo notice for inherited material. Add a Lifts authorship notice only where supported by repository authorship/ownership; do not assign third-party work to the current maintainer. Document dependency and data licenses separately.
- [ ] Rewrite README feature claims from the acceptance results. State native offline support, persistent browser storage limitations, backup version/import behavior, available analytics, actual seed routines, and release status. Remove claims of complete Lyfta parity and unsupported exercise-history/video/percentage features.
- [ ] Reopen inaccurate completion checkboxes in ROADMAP. Separate remediation completion from future supersets, charts, video, sharing, and health integration. Record the intentional change from web preview to persistent web support.
- [ ] Write CONTRIBUTING with the verified toolchain, clean install, tests, platform checks, data-migration expectations, and issue/review workflow. Verify README links and prerequisites against installed package engines. No application tests are required for prose-only edits; review links and factual claims directly.
- [ ] Gate: every bundled data/asset claim is evidenced or explicitly unresolved, and no promised feature exceeds the verified implementation.

## Task 9: Enforce regression checks and document a reproducible release

**Modify:** `package.json`, `package-lock.json` only for justified compatible changes, `tsconfig.json` if required.
**Create:** `.github/workflows/ci.yml`, `playwright.config.ts`, `docs/release-checklist.md`, `docs/audit-remediation-results.md`.

- [ ] Add separate `test:integration` and `test:e2e` scripts while retaining the fast unit suite. Include test code in a dedicated TypeScript check if the application tsconfig continues excluding tests. Configure browser tests to serve a real build on localhost with isolated per-test data.

Required checks:

```bash
npm ci
npm test
npm run test:integration
npx tsc --noEmit
npx expo export --platform web --output-dir dist-audit-web
npx playwright test
npm audit --json
```

- [ ] Run these checks in CI on pull requests using a Node version verified against installed dependency engines. Cache downloads, not mutable app databases. Install the browser needed by the browser tests. Include Android/iOS JS bundle smoke checks without presenting them as native installation tests.
- [ ] Triage the reported uuid advisory through its actual xcode/ngrok paths. Prefer compatible upstream updates with lockfile review and regression checks. Do not apply `npm audit fix --force` or downgrade Expo to satisfy the scanner. Record remaining advisory IDs, dependency paths, affected usage, and review date; fail on new high/critical findings and unreviewed changes to the accepted baseline.
- [ ] Document and execute a clean local Android debug APK build using verified Expo/native tooling in an isolated checkout. Record JDK/Android SDK/Node requirements and build commands in the release checklist. Development builds may use debug signing; do not invent production package identifiers or claim store readiness. Document the iOS simulator/device build workflow on macOS and mark unexecuted checks accurately.
- [ ] Run the device acceptance matrix: fresh install; upgrade fixture; offline native logging; background/lock; force-stop/recovery; zero-weight set; repeated exercise; routine targets; unit change; focused input/Finish; export/restore; failed storage; delete/discard; completion/History; Android back; iOS safe-area/dialog usability. Record platform, build, steps, and result for each.
- [ ] Add `docs/audit-remediation-results.md` with links from each original finding to its regression test and verification evidence. Any unavailable native environment remains an explicit unverified gate, not a passing result.
- [ ] Gate: tasks 1–8 pass, migrations/backup round trips pass, web workflows pass, and native runtime checks are recorded before calling the app release-ready. Store publishing remains outside this plan.

## Acceptance mapping

| Audit finding | Resolving tasks | Required evidence |
| --- | --- | --- |
| Web data loss | 2 | Reload/reopen and failure-injection tests |
| Incomplete backup/no restore | 6 | Full cross-adapter round trip and atomic failure |
| Active session replacement | 3 | Start/repeat guards and double-tap races |
| Fabricated zero-weight values | 4 | 0 kg through complete/save/recover/restore |
| Recovery duration reset | 3 | Original timestamp and 20-minute recovery |
| Ignored rep targets | 4 | Fixed/range/per-set/AMRAP cases |
| Inaccessible unit setting | 7 | UI selection, reload, unchanged canonical values |
| Unreachable completion summary | 5 | Finish → summary → refreshed History |
| Wrong/incomplete web seeds; stale drafts | 2, 3 | 876 IDs, exact references, no post-finish draft |
| Broken web confirmations | 5 | Cancel/confirm delete and discard |
| Missing parity features | 8 | Accurate scope and deferred roadmap |
| Authorship/data provenance | 8 | Evidence-backed notices or explicit blocker |
| Thin tests, dependency findings, release gaps | 1–9 | CI, advisory triage, device/release records |

## Documentation used while preparing the plan

- Context7 resolved `/expo/expo` as the primary Expo source. Its available version-specific IDs stopped at SDK 56; SDK 57 compatibility must be checked against the installed packages, not inferred from older examples.
- [Expo SQLite transaction implementation](https://github.com/expo/expo/blob/main/packages/expo-sqlite/src/SQLiteDatabase.ts), cross-checked against installed `node_modules/expo-sqlite/src/SQLiteDatabase.ts`: non-exclusive async transactions may interleave; exclusive transactions use a separate connection and are unavailable on web. A transaction change alone does not replace write ordering and per-connection foreign-key configuration.
- [Expo Document Picker](https://github.com/expo/expo/tree/main/packages/expo-document-picker): resolve an SDK-compatible package for native file picking; no cloud-storage entitlement is needed for the local-backup requirement.
- Before implementing IndexedDB testing, browser automation, or additional SDK calls, use Context7 to verify the selected dependencies and APIs as required by the repository instructions.

## Handoff

This deliverable is a plan, not an implementation or release approval. Default execution can proceed task-by-task inline using the executing-plans workflow; parallel agents are an optional execution choice when authorized. No application changes, dependency installations, commits, or publishing actions are part of writing this plan.
