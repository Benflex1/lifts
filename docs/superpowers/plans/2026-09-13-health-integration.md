# HealthKit and Health Connect Workout Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add an opt-in native export of completed Lifts strength-workout sessions to Apple HealthKit on iOS and Health Connect on Android without weakening local workout persistence or web support.

**Architecture:** Keep the app-facing health API provider-neutral, with a pure completed-workout mapper and fingerprinted local sync ledger. Isolate all HealthKit and Health Connect imports in platform adapters, trigger export only after the local SessionController transaction succeeds, and retry through the ledger without blocking the existing completion UI.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, @kingstinct/react-native-healthkit, react-native-nitro-modules, react-native-health-connect, expo-build-properties, SQLite migrations, IndexedDB, and the repository's node:test/tsx fixtures.

**Spec:** docs/superpowers/specs/2026-09-13-health-integration-design.md

## Global Constraints

- Implementation work must be performed only by gpt-5.6-luna workers, per the user's instruction.
- Health export is opt-in, defaults off, and is hidden on web.
- Export only strength-workout type, title, start time, and end time/duration; never read or export sets, weights, volume, calories, biometrics, routes, or notes.
- Local completion remains authoritative: a provider denial, unavailable provider, or provider write failure must not reject or roll back a locally saved workout.
- Native SQLite schema advances from version 6 to version 7; IndexedDB advances from version 2 to version 3.
- Health sync records are device-local operational metadata and are excluded from DataSnapshot, backup export, restore, and merge.
- Do not hand-edit generated android/ or ios/ directories; use Expo config plugins and CNG-compatible configuration.
- Use TDD for behavior changes: write the focused failing test, run it to confirm failure, implement the smallest change, and rerun the focused test before broader checks.
- Keep commits small and scoped; do not reset or overwrite the existing dependency-alignment commit or unrelated user changes.

## File map

Create the following focused modules:

- src/health/contract.ts — provider IDs, minimal workout payload, provider interface, authorization result, and sync status/record types.
- src/health/mapper.ts — validation and conversion from completed Workout to the minimal payload.
- src/health/fingerprint.ts — deterministic payload fingerprint.
- src/health/sync.ts — ledger-aware export and retry orchestration using injected Store and provider dependencies.
- src/health/settings.ts — injectable provider authorization guard used by SettingsContext.
- src/health/index.ts — public health service entry points, platform-provider loading boundary, and safe post-completion enqueue helper.
- src/health/provider.web.ts — web-unavailable provider boundary with no native imports.
- src/health/provider.native.ts — native runtime dispatcher using lazy platform imports.
- src/health/healthkit.ts — HealthKit adapter and write authorization.
- src/health/health-connect.ts — Health Connect adapter and write permission.
- src/health/healthkit-payload.ts — pure HealthKit workout request mapper.
- src/health/health-connect-payload.ts — pure Health Connect exercise-session mapper.

Modify the existing storage and UI boundaries:

- package.json, package-lock.json, app.json — native packages, config plugins, usage text, and Android write permission.
- src/database/contract.ts — Store health-ledger methods and snapshot exclusion by contract.
- src/database/migrations.ts — SQLite migration 7.
- src/database/nativeStore.ts — SQLite ledger CRUD and workout-delete cascade behavior.
- src/database/webStore.ts — IndexedDB version 3 ledger store, CRUD, and delete behavior.
- src/context/SettingsContext.tsx — persisted opt-in setting and authorization flow.
- src/components/SettingsModal.tsx — native-only user-facing switch.
- src/context/WorkoutContext.tsx — fire-and-forget export after successful local completion.
- README.md, ROADMAP.md, THIRD_PARTY_NOTICES.md, docs/release-checklist.md — accurate setup, feature, license, and acceptance documentation.

Add focused tests:

- tests/unit/health-mapper.test.ts
- tests/unit/health-payloads.test.ts
- tests/unit/health-sync.test.ts
- tests/integration/health-ledger.test.ts
- tests/integration/native-store.test.ts and tests/integration/web-store.test.ts only where existing migration fixture coverage is best extended.

---

### Task 1: Validate native package and Expo configuration compatibility

**Files:**
- Modify: package.json
- Modify: package-lock.json
- Modify: app.json
- Test: generated Expo config/native project in a disposable copy of the worktree

**Interfaces:**
- Consumes: Expo SDK 57 dependency set from commit d571592.
- Produces: installable native packages and config that generate HealthKit entitlement/usage configuration and Health Connect manifest/permission configuration.

- [ ] Step 1: Install the selected packages with Expo's resolver.

Run:

~~~bash
npx expo install @kingstinct/react-native-healthkit react-native-nitro-modules react-native-health-connect expo-build-properties
~~~

Keep the versions selected by the installed Expo SDK and lockfile. Do not manually guess package versions.

- [ ] Step 2: Add the config plugins and write-only platform configuration.

Extend app.json without removing the existing expo-sqlite, expo-sharing, or expo-font plugins:

~~~json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.benflex1.lifts"
},
"android": {
  "adaptiveIcon": {
    "backgroundColor": "#E6F4FE",
    "foregroundImage": "./assets/android-icon-foreground.png",
    "backgroundImage": "./assets/android-icon-background.png",
    "monochromeImage": "./assets/android-icon-monochrome.png"
  },
  "predictiveBackGestureEnabled": false,
  "package": "com.benflex1.lifts",
  "permissions": ["android.permission.health.WRITE_EXERCISE"]
},
"plugins": [
  "expo-sqlite",
  "expo-sharing",
  "expo-font",
  [
    "@kingstinct/react-native-healthkit",
    {
      "NSHealthUpdateUsageDescription": "Lifts saves your completed workout sessions to Apple Health."
    }
  ],
  "react-native-health-connect",
  [
    "expo-build-properties",
    {
      "android": {
        "compileSdkVersion": 36,
        "targetSdkVersion": 36,
        "minSdkVersion": 26
      }
    }
  ]
]
~~~

Preserve the existing Android adaptive-icon fields and web configuration. Do not add read permissions or HealthKit read usage text because this feature does not read health data.

- [ ] Step 3: Validate the JavaScript/config layer.

Run:

~~~bash
npx expo config --json >/tmp/lifts-health-expo-config.json
npx tsc --noEmit
npx expo-doctor
~~~

Expected: config resolves, TypeScript passes, and Expo Doctor reports no dependency/config mismatch. If a package is incompatible with SDK 57, resolve that incompatibility before proceeding to application behavior.

- [ ] Step 4: Validate generated native configuration in a disposable copy.

Copy the worktree to a temporary directory, install its dependencies there, and run:

~~~bash
npx expo prebuild --no-install --platform ios
npx expo prebuild --no-install --platform android
~~~

Inspect the generated files for the HealthKit entitlement and NSHealthUpdateUsageDescription, the Android WRITE_EXERCISE permission, and the requested SDK levels. Do not commit generated native directories from the disposable copy.

- [ ] Step 5: Run the baseline tests and commit the configuration slice.

Run:

~~~bash
npm test
npm run test:integration
~~~

Expected: the existing 298 unit and 118 integration tests remain green before new behavior is added.

Commit:

~~~bash
git add package.json package-lock.json app.json
git commit -m "build: configure native health integrations"
~~~

---

### Task 2: Add the shared health contract, mapper, and fingerprint

**Files:**
- Create: src/health/contract.ts
- Create: src/health/mapper.ts
- Create: src/health/fingerprint.ts
- Create: tests/unit/health-mapper.test.ts

**Interfaces:**
- Consumes: Workout from src/types/index.ts.
- Produces: HealthProviderId, HealthWorkoutPayload, HealthProvider, HealthSyncStatus, HealthSyncRecord, toHealthWorkoutPayload(workout), and fingerprintHealthPayload(payload).

- [ ] Step 1: Write the failing mapper tests.

Use a complete minimal Workout fixture with an ISO start time, a later ISO end time, a title, a gym ID, and one exercise/set. Assert that the result is exactly:

~~~ts
{
  workoutId: 'workout-1',
  title: 'Upper Body',
  startTime: '2026-09-13T08:00:00.000Z',
  endTime: '2026-09-13T09:15:00.000Z',
  durationSeconds: 4500,
}
~~~

Also assert that reversed timestamps and invalid timestamps throw, and that exercise/set fields do not appear in the payload.

- [ ] Step 2: Run the focused test to confirm failure.

~~~bash
npx tsx --test tests/unit/health-mapper.test.ts
~~~

Expected: FAIL because the health modules do not exist.

- [ ] Step 3: Implement the contract and pure mapper.

Use these types:

~~~ts
export type HealthProviderId = 'healthkit' | 'health-connect';
export type HealthSyncStatus = 'pending' | 'synced' | 'failed';

export interface HealthWorkoutPayload {
  workoutId: string;
  title: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

export interface HealthProvider {
  id: HealthProviderId;
  isAvailable(): Promise<boolean>;
  requestWriteAuthorization(): Promise<'granted' | 'denied' | 'unavailable'>;
  writeStrengthWorkout(payload: HealthWorkoutPayload): Promise<void>;
}

export interface HealthSyncRecord {
  workoutId: string;
  provider: HealthProviderId;
  payloadFingerprint: string;
  status: HealthSyncStatus;
  attemptedAt: string;
  syncedAt?: string;
  lastError?: string;
}
~~~

toHealthWorkoutPayload must parse both timestamps, reject non-finite dates and endTime <= startTime, preserve the ISO strings from the stored workout, and calculate durationSeconds as the non-negative floored difference in seconds. It must not use Workout.durationSeconds when the timestamps disagree.

Implement fingerprintHealthPayload as a deterministic serialization of the five payload fields in fixed order:

~~~ts
return JSON.stringify([
  payload.workoutId,
  payload.title,
  payload.startTime,
  payload.endTime,
  payload.durationSeconds,
]);
~~~

This is an equality key, not a security digest.

- [ ] Step 4: Run the focused tests to confirm they pass.

~~~bash
npx tsx --test tests/unit/health-mapper.test.ts
npx tsc --noEmit
~~~

Expected: PASS.

- [ ] Step 5: Commit the pure health contract.

~~~bash
git add src/health/contract.ts src/health/mapper.ts src/health/fingerprint.ts tests/unit/health-mapper.test.ts
git commit -m "feat: add health workout payload contract"
~~~

---

### Task 3: Add the provider-native payload mappers and adapters

**Files:**
- Create: src/health/healthkit-payload.ts
- Create: src/health/health-connect-payload.ts
- Create: src/health/healthkit.ts
- Create: src/health/health-connect.ts
- Create: src/health/provider.native.ts
- Create: src/health/provider.web.ts
- Create: src/health/index.ts
- Create: tests/unit/health-payloads.test.ts

**Interfaces:**
- Consumes: HealthWorkoutPayload and HealthProvider from Task 2.
- Produces: getPlatformHealthProvider(): Promise<HealthProvider | null> and adapters implementing availability, write authorization, and one strength workout write.

- [ ] Step 1: Write failing pure provider-payload tests.

Assert that the HealthKit mapper returns a request equivalent to:

~~~ts
{
  startDate: new Date('2026-09-13T08:00:00.000Z'),
  endDate: new Date('2026-09-13T09:15:00.000Z'),
  workoutActivityType: 'HKWorkoutActivityTypeStrengthTraining',
}
~~~

Assert that the Health Connect mapper returns an ExerciseSession record with the supplied strength exercise type, the exact ISO start/end strings, and the workout title. Pass ExerciseType.STRENGTH_TRAINING from the adapter; keep the pure mapper free of package imports. Do not add metadata or client record IDs in this release; the local ledger provides normal duplicate suppression. The mapper must not add a read permission, route, calories, or set fields.

- [ ] Step 2: Run the focused test to confirm failure.

~~~bash
npx tsx --test tests/unit/health-payloads.test.ts
~~~

Expected: FAIL because the provider payload modules do not exist.

- [ ] Step 3: Implement the pure provider payload mappers.

Keep these files free of native package imports so their behavior can run in Node tests. Use the exact current package type names from the installed declarations; the expected values are HKWorkoutActivityTypeStrengthTraining and ExerciseType.STRENGTH_TRAINING.

- [ ] Step 4: Implement the HealthKit adapter.

In src/health/healthkit.ts, lazily imported only by the iOS/native boundary:

~~~ts
import {
  isHealthDataAvailableAsync,
  requestAuthorization,
  saveWorkoutSample,
} from '@kingstinct/react-native-healthkit';
~~~

Implement isAvailable() with isHealthDataAvailableAsync(). Implement authorization with:

~~~ts
await requestAuthorization({
  toWrite: ['HKWorkoutTypeIdentifier'],
});
~~~

Import authorizationStatusFor and AuthorizationStatus, then call authorizationStatusFor('HKWorkoutTypeIdentifier') and return 'granted' only for AuthorizationStatus.sharingAuthorized; return 'denied' for sharingDenied or notDetermined. Map request failures to 'denied' and unavailable HealthKit to 'unavailable'; do not pass a toRead array. Implement writeStrengthWorkout with saveWorkoutSample and the pure payload mapper, passing only start date, end date, and strength activity type. Do not include Lifts workout IDs as HealthKit metadata.

- [ ] Step 5: Implement the Health Connect adapter.

In src/health/health-connect.ts, use the documented methods:

~~~ts
import {
  ExerciseType,
  SdkAvailabilityStatus,
  getSdkStatus,
  initialize,
  insertRecords,
  requestPermission,
} from 'react-native-health-connect';
~~~

Return available only for SdkAvailabilityStatus.SDK_AVAILABLE. Initialize before requesting permissions or inserting records. Request exactly:

~~~ts
await requestPermission([
  { accessType: 'write', recordType: 'ExerciseSession' },
]);
~~~

Insert exactly one ExerciseSession record with ExerciseType.STRENGTH_TRAINING, the payload title, and the payload timestamps. Verify the returned Permission[] contains the requested write ExerciseSession permission; return 'granted' only then, otherwise return 'denied'. Map SDK unavailable/update-required to 'unavailable', permission denial to 'denied', and insertion errors to rejected writes. Do not call readRecords, readRecord, or getGrantedPermissions.

- [ ] Step 6: Implement web-safe and native-safe provider loading.

provider.web.ts must return null and contain no health package imports. provider.native.ts must return null in Node/test environments, lazily import only the adapter for the runtime platform, and return null for unsupported platforms. index.ts should use typeof document !== 'undefined' to select the web boundary and lazy-import the native boundary, matching the repository's restNotifications pattern.

- [ ] Step 7: Run focused tests and static checks.

~~~bash
npx tsx --test tests/unit/health-payloads.test.ts
npx tsc --noEmit
npx expo export --platform web
~~~

Expected: PASS, and the web export must not evaluate a native health package.

- [ ] Step 8: Commit the adapters.

~~~bash
git add src/health/healthkit-payload.ts src/health/health-connect-payload.ts src/health/healthkit.ts src/health/health-connect.ts src/health/provider.native.ts src/health/provider.web.ts src/health/index.ts tests/unit/health-payloads.test.ts
git commit -m "feat: add native health provider adapters"
~~~

---

### Task 4: Add the SQLite and IndexedDB sync ledger

**Files:**
- Modify: src/database/contract.ts
- Modify: src/database/migrations.ts
- Modify: src/database/nativeStore.ts
- Modify: src/database/webStore.ts
- Create: tests/integration/health-ledger.test.ts
- Modify: tests/integration/native-store.test.ts
- Modify: tests/integration/web-store.test.ts

**Interfaces:**
- Consumes: HealthProviderId, HealthSyncStatus, and HealthSyncRecord from src/health/contract.ts.
- Produces: Store.getHealthSyncRecord(workoutId, provider), Store.getHealthSyncRecords(status?), and Store.saveHealthSyncRecord(record) with native/web parity.

- [ ] Step 1: Write failing store-contract and migration tests.

Add tests that:

1. Apply native migrations through version 6, then initialize the store and assert migration 7 created health_sync_records.
2. Inject failAtVersion: 7, assert the table and migration marker are absent, then rerun migrations successfully.
3. Save and reopen a pending, synced, and failed record, preserving optional timestamps and error text.
4. Save a completed workout and ledger row, delete the workout, and assert the ledger row is gone.
5. Create an IndexedDB version-2 fixture, reopen it with the web store, and assert all old stores/records remain while the composite-key ledger store exists.
6. Assert readSnapshot() never contains a health ledger field and backup round trips do not create or restore ledger rows.

- [ ] Step 2: Run the focused integration tests to confirm failure.

~~~bash
npx tsx --test tests/integration/health-ledger.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts
~~~

Expected: FAIL because the store contract and schema version 7 do not exist.

- [ ] Step 3: Extend the Store contract.

Import the health types as type-only imports and add:

~~~ts
getHealthSyncRecord(workoutId: string, provider: HealthProviderId): Promise<HealthSyncRecord | null>;
getHealthSyncRecords(status?: HealthSyncStatus): Promise<HealthSyncRecord[]>;
saveHealthSyncRecord(record: HealthSyncRecord): Promise<void>;
~~~

Do not add health records to DataSnapshot.

- [ ] Step 4: Implement native SQLite migration 7.

Append a numbered transaction in src/database/migrations.ts:

~~~sql
CREATE TABLE IF NOT EXISTS health_sync_records (
  workout_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('healthkit', 'health-connect')),
  payload_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'synced', 'failed')),
  attempted_at TEXT NOT NULL,
  synced_at TEXT,
  last_error TEXT,
  PRIMARY KEY (workout_id, provider),
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS health_sync_records_status_idx
  ON health_sync_records(status);
~~~

Insert migration marker 7 only after the DDL succeeds and preserve the existing failAtVersion rollback convention.

- [ ] Step 5: Implement native ledger CRUD.

Use the existing native writeQueue for writes. Map database columns to HealthSyncRecord, use INSERT OR REPLACE for saveHealthSyncRecord, order list reads by attempted_at ASC, workout_id ASC, provider ASC, and parameterize the optional status filter. Keep readSnapshot, backup, and merge code unchanged with respect to ledger data.

- [ ] Step 6: Implement IndexedDB version 3 and ledger CRUD.

Change idb.open(name, 2) to version 3. In onupgradeneeded, preserve every existing store and add:

~~~ts
const health = d.createObjectStore('health_sync_records', {
  keyPath: ['workoutId', 'provider'],
});
health.createIndex('status', 'status', { unique: false });
~~~

Use the existing lease verification for writes, get([workoutId, provider]) for point reads, getAll() plus status filtering for list reads, and transaction completion rather than request success as the write confirmation.

- [ ] Step 7: Delete ledger records with local workouts.

Native deletion already relies on the workout foreign key; verify the SQLite connection has foreign keys enabled. Extend the web deleteWorkout transaction to include health_sync_records and delete all records whose workoutId matches before or alongside deleting the workout.

- [ ] Step 8: Run the focused integration tests and commit.

~~~bash
npx tsx --test tests/integration/health-ledger.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts tests/integration/backup-roundtrip.test.ts
npx tsc --noEmit
~~~

Expected: PASS.

~~~bash
git add src/database/contract.ts src/database/migrations.ts src/database/nativeStore.ts src/database/webStore.ts tests/integration/health-ledger.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts tests/integration/backup-roundtrip.test.ts
git commit -m "feat: persist health sync ledger"
~~~

---

### Task 5: Implement ledger-aware sync and retry orchestration

**Files:**
- Create: src/health/sync.ts
- Modify: src/health/index.ts
- Create: tests/unit/health-sync.test.ts

**Interfaces:**
- Consumes: Store health-ledger methods, getWorkoutDetail, HealthProvider, toHealthWorkoutPayload, and fingerprintHealthPayload.
- Produces: syncWorkoutWithProvider(store, workout, provider, now?) and retryHealthSyncs(store, provider, now?) for internal orchestration, plus public index wrappers syncCompletedWorkout(workout), retryPendingHealthSyncs(), and enqueueCompletedWorkoutSync(workout, enabled, sync?) that obtain the store/provider or safely enqueue the completion side effect.

- [ ] Step 1: Write failing service tests with an in-memory fake Store and provider.

Cover these exact cases:

- no provider produces no ledger write;
- first export writes pending, calls the provider once, then writes synced;
- provider rejection writes pending, then failed with a bounded readable lastError and does not throw;
- an existing synced record skips the provider for the same payload;
- an existing synced record also skips the provider when the local payload fingerprint changes, per the v1 no-update policy;
- an existing failed or pending record with the same fingerprint retries through syncWorkoutWithProvider;
- retryHealthSyncs lists pending/failed rows, loads each workout, and attempts each eligible row;
- concurrent calls for the same (workoutId, provider) serialize so the provider cannot receive duplicate normal calls.

- [ ] Step 2: Run the focused tests to confirm failure.

~~~bash
npx tsx --test tests/unit/health-sync.test.ts
~~~

Expected: FAIL because the service does not exist.

- [ ] Step 3: Implement syncWorkoutWithProvider.

Use the following order:

~~~text
return if provider is null
map and fingerprint the completed workout
read existing (workoutId, provider) record
return existing if existing.status === 'synced'
return existing if existing exists with a different fingerprint
save pending record with attemptedAt=now and cleared lastError
await provider.writeStrengthWorkout(payload)
save synced record with syncedAt=now
on error, save failed record with lastError and return the failed record
~~~

Use a module-level map keyed by provider ID plus workout ID to serialize duplicate calls, removing the entry in finally. Limit persisted error text to 500 characters after converting unknown errors to a plain string. If ledger persistence itself fails, log the error and resolve without throwing to the caller.

- [ ] Step 4: Implement retryHealthSyncs.

List only pending and failed records, load each completed workout with store.getWorkoutDetail, and call syncWorkoutWithProvider for each. Skip missing local workouts and continue to the next record. The caller controls whether the setting is enabled and whether a provider is available.

- [ ] Step 5: Implement the public health entry points.

In src/health/index.ts, implement syncCompletedWorkout(workout) by obtaining the Store and platform provider, returning null when the provider is absent or unavailable, and delegating to syncWorkoutWithProvider. Implement retryPendingHealthSyncs() the same way, delegating to retryHealthSyncs after checking availability. Implement enqueueCompletedWorkoutSync(workout, enabled, sync = syncCompletedWorkout) as a synchronous guard: return when enabled is false, otherwise call sync(workout) without awaiting and attach a catch that logs the error. This is the only completion-side-effect helper used by WorkoutContext.

- [ ] Step 6: Run focused tests and commit.

~~~bash
npx tsx --test tests/unit/health-sync.test.ts
npx tsc --noEmit
~~~

Expected: PASS.

~~~bash
git add src/health/sync.ts src/health/index.ts tests/unit/health-sync.test.ts
git commit -m "feat: add retryable health sync service"
~~~

---

### Task 6: Add the opt-in setting and native Settings UI

**Files:**
- Modify: src/context/SettingsContext.tsx
- Modify: src/components/SettingsModal.tsx
- Create: src/health/settings.ts
- Create: tests/unit/health-settings.test.ts

**Interfaces:**
- Consumes: getPlatformHealthProvider, retryPendingHealthSyncs, authorizeHealthSync, and existing getSetting/setSetting wrappers.
- Produces: healthSyncEnabled: boolean and setHealthSyncEnabled(enabled: boolean): Promise<void> from useSettings.

- [ ] Step 1: Write failing setting behavior tests.

Test the injectable authorizeHealthSync(provider) helper and the existing settings behavior:

- missing health_sync_enabled loads as false;
- enabling an unavailable provider leaves state false and does not persist true;
- denied authorization leaves state false and does not persist true;
- granted authorization persists true and exposes state true;
- disabling persists false without requesting authorization;
- a settings-storage failure restores the prior value and notifies through the existing dialog boundary;
- web provider absence leaves the setting false/no-op.

- [ ] Step 2: Run the focused tests to confirm failure.

~~~bash
npx tsx --test tests/unit/health-settings.test.ts tests/unit/settings.test.ts
~~~

Expected: FAIL because the setting is not present.

- [ ] Step 3: Implement the injectable authorization guard.

Add authorizeHealthSync(provider) to src/health/settings.ts. It must throw a user-readable error when provider is null, when isAvailable() resolves false, or when requestWriteAuthorization() returns denied/unavailable, and resolve only for granted authorization. Keep the provider interface as the only dependency so the tests can use a fake provider.

- [ ] Step 4: Extend SettingsContext.

Add healthSyncEnabled to the context default as false. Load health_sync_enabled in the existing initial Promise.all, interpreting only the exact string true as enabled. The setter must:

1. Return immediately when the requested value equals current state.
2. For false, optimistically set state and persist false.
3. For true, load the platform provider, check isAvailable(), request write authorization, and reject with a user-readable error unless the result is granted.
4. Persist true only after authorization succeeds.
5. Roll state back and notify on any failure, matching the existing Gym Tracking rollback pattern.

After initial settings load, if the persisted value is true, asynchronously call retryPendingHealthSyncs. The public wrapper must load the provider and skip when it is unavailable. Catch/log retry failures so app startup remains successful. Use authorizeHealthSync for the enable path.

- [ ] Step 5: Add the native-only Settings row.

In SettingsModal, use Platform.OS !== 'web' to render a switch labeled Sync completed workouts, with a subtitle that says Lifts writes workout sessions to Apple Health or Health Connect and does not read health data. Reuse the existing isSaving state, Switch accessibility properties, and error-notification behavior. Do not render the row on web.

- [ ] Step 6: Run focused tests and static checks.

~~~bash
npx tsx --test tests/unit/health-settings.test.ts tests/unit/settings.test.ts
npx tsc --noEmit
npx expo export --platform web
~~~

Expected: PASS.

- [ ] Step 7: Commit the setting slice.

~~~bash
git add src/health/settings.ts src/context/SettingsContext.tsx src/components/SettingsModal.tsx tests/unit/health-settings.test.ts tests/unit/settings.test.ts
git commit -m "feat: add opt-in health sync setting"
~~~

---

### Task 7: Trigger health export after successful workout completion

**Files:**
- Modify: src/context/WorkoutContext.tsx
- Modify: tests/integration/completion-lifecycle.test.ts
- Create: tests/unit/workout-health-sync.test.ts

**Interfaces:**
- Consumes: healthSyncEnabled from useSettings and enqueueCompletedWorkoutSync from src/health.
- Produces: fire-and-forget post-completion export with no change to finishWorkout(): Promise<Workout | null> semantics.

- [ ] Step 1: Write failing completion-isolation tests.

Test enqueueCompletedWorkoutSync with an injected sync function, and extend the existing completion lifecycle assertions:

- local store failure still rejects finishWorkout and does not call health sync;
- local store success returns the completed workout immediately and invokes health sync when enabled;
- a rejected health-sync promise does not reject the completion flow or prevent onFinish navigation;
- disabled setting does not call health sync.

- [ ] Step 2: Run the focused test to confirm failure.

~~~bash
npx tsx --test tests/integration/completion-lifecycle.test.ts tests/unit/workout-health-sync.test.ts
~~~

Expected: FAIL because WorkoutContext does not trigger health sync.

- [ ] Step 3: Wire the post-persistence side effect.

In WorkoutContext, call the existing controller finish first. After it returns the successfully persisted workout, call enqueueCompletedWorkoutSync(completedWorkout, healthSyncEnabled). The helper obtains the store/provider internally through src/health/index.ts, catches provider errors into the ledger, and never alters the value returned to ActiveWorkoutScreen. Do not put health work inside the SessionController transaction or before store.finishWorkout resolves.

- [ ] Step 4: Run focused tests and commit.

~~~bash
npx tsx --test tests/integration/completion-lifecycle.test.ts tests/unit/workout-health-sync.test.ts
npx tsc --noEmit
~~~

Expected: PASS.

~~~bash
git add src/context/WorkoutContext.tsx tests/integration/completion-lifecycle.test.ts tests/unit/workout-health-sync.test.ts
git commit -m "feat: sync completed workouts after local save"
~~~

---

### Task 8: Update documentation and release acceptance records

**Files:**
- Modify: README.md
- Modify: ROADMAP.md
- Modify: THIRD_PARTY_NOTICES.md
- Modify: docs/release-checklist.md

**Interfaces:**
- Consumes: implemented behavior and the exact package/config setup from Tasks 1–7.
- Produces: documentation that does not claim Expo Go supports native health modules, and a traceable release checklist for automated and device validation.

- [ ] Step 1: Write documentation checks.

Use repository searches as the failing checks:

~~~bash
rg -n "Expo Go|Health Connect|Apple Health|HealthKit|health_sync_enabled" README.md ROADMAP.md THIRD_PARTY_NOTICES.md docs/release-checklist.md
~~~

Confirm the current documentation still contains the Expo Go-only development instruction and the Phase 4 health backlog entry.

- [ ] Step 2: Update user-facing setup and feature documentation.

Document that standard web and non-health native work remains local-first, while HealthKit/Health Connect export requires a custom development build/native build and is opt-in. Add the feature to the README's Progress/Data Ownership section, move the roadmap item from backlog to the current implementation state, and state the deliberate scope: completed workout session summary only, no reads or set-level export.

- [ ] Step 3: Add third-party notices.

Add the installed HealthKit, Nitro Modules, Health Connect, and Expo Build Properties packages with their repository URLs and licenses based on their package metadata. Do not copy license text unless the package requires it; link to the authoritative license when the existing notice format does so.

- [ ] Step 4: Add release checklist rows.

Record automated acceptance for SQLite migration 6→7, IndexedDB 2→3, backup exclusion, web no-op behavior, local-completion isolation, and retry deduplication. Add deferred device rows for one iOS HealthKit custom build and one Android Health Connect custom build, explicitly marked unverified until the user performs device testing.

- [ ] Step 5: Run documentation checks and commit.

~~~bash
rg -n "Expo Go|Health Connect|Apple Health|HealthKit|health_sync_enabled" README.md ROADMAP.md THIRD_PARTY_NOTICES.md docs/release-checklist.md
git diff --check
git add README.md ROADMAP.md THIRD_PARTY_NOTICES.md docs/release-checklist.md
git commit -m "docs: document native health export"
~~~

---

### Task 9: Run the full verification suite and inspect the final diff

**Files:**
- Verify: all files changed by Tasks 1–8

**Interfaces:**
- Consumes: all implementation slices and tests.
- Produces: evidence-backed branch readiness, with native device validation still clearly separated if no devices are available.

- [ ] Step 1: Run all automated checks.

~~~bash
npm test
npm run test:integration
npx tsc --noEmit
npx expo-doctor
npx expo export --platform web
git diff --check
~~~

Expected: all commands exit 0; web export succeeds without native health runtime errors; Expo Doctor reports a clean dependency tree.

- [ ] Step 2: Inspect changed files and verify scope.

~~~bash
git status --short
git diff --stat main...HEAD
git diff --name-only main...HEAD
rg -n "toRead|readRecords|readRecord|getGrantedPermissions|READ_" src/health app.json README.md
~~~

Expected: no HealthKit read authorization, Health Connect read permission/API, or unrelated feature changes. The only intentional root/worktree changes are the dependency alignment, design/plan artifacts, health implementation, configuration, tests, and documentation.

- [ ] Step 3: Record deferred device validation honestly.

If no custom iOS/Android builds are available, leave device checklist rows unverified and report the exact remaining commands/actions. Do not claim HealthKit or Health Connect writes have been proven by Node tests or web export.

- [ ] Step 4: Commit any final verification-only documentation adjustment.

Only if the checklist status needs correction after the run:

~~~bash
git add docs/release-checklist.md
git commit -m "docs: record health integration verification status"
~~~
