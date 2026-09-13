# HealthKit and Health Connect workout export

## Status

Proposed implementation spec following the approved Phase 4 direction. This document is the review gate before implementation planning.

## Context

Lifts currently stores completed workouts locally through the provider-neutral `Store` contract. Native storage is SQLite with numbered migrations through version 6; web storage is IndexedDB at version 2. A workout is persisted by `SessionController.finish()` before `WorkoutContext.finishWorkout()` returns the completed `Workout`. Settings are persisted through `SettingsContext` and the same database adapters.

The next integration should share completed workout sessions with the platform health store while preserving Lifts as the source of truth for workout history. This is an opt-in native feature, not a health-data import feature.

## Goals

- Let a user opt in to exporting completed strength-workout sessions.
- Use HealthKit on iOS and Health Connect on Android behind one provider-neutral application interface.
- Export only a coarse workout session: strength-workout type, title, start time, and end time/duration.
- Persist local sync state so normal retries do not create duplicate writes.
- Keep local workout completion successful even when authorization, platform availability, or a health-store write fails.
- Keep the web build compiling and behaviorally unchanged; the setting is hidden on web.
- Keep health-provider state out of user backup files because permissions and health records belong to the device/account, not to a Lifts backup.

## Non-goals for this release

- Reading HealthKit or Health Connect data into Lifts.
- Importing prior workouts.
- Exporting individual sets, reps, weights, volume, calories, heart rate, routes, body measurements, or notes.
- Live workout sessions, background/watch synchronization, Apple Watch support, or Android exercise tracking.
- Editing or deleting an already-exported platform record when a Lifts workout is edited or deleted.
- Web Health API integration.

## User experience

On iOS and Android Settings, add a native-only switch named **Sync completed workouts** with copy explaining that Lifts writes workout sessions to Apple Health or Health Connect and does not read health data.

The switch is off by default. Turning it on performs the provider's write-authorization request first. Persist `health_sync_enabled=true` only after authorization succeeds. If the user denies access or the provider is unavailable, leave the switch off and show a concise notification with a route to the platform's health-permission settings where the provider supports one. Turning the switch off only changes the local preference and does not delete records already written to the platform health store.

The setting is not rendered on web. The shared settings context still exposes a stable false/no-op value for web so platform-specific UI is not required elsewhere.

After a completed workout is saved locally, export begins in the background. The completion screen and history navigation do not wait for or depend on the health write. A failed export is reported as a non-blocking notification when practical and remains eligible for retry; it must never turn a successful local completion into a save error.

## Architecture

Create a `src/health/` module with three layers:

1. A shared contract and pure workout-to-payload mapper.
2. A native provider dispatcher selected by platform.
3. iOS and Android adapters that contain all third-party imports and platform API details.

The application-facing service should expose operations equivalent to:

```ts
type HealthProviderId = 'healthkit' | 'health-connect';

interface HealthWorkoutPayload {
  workoutId: string;
  title: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

interface HealthProvider {
  id: HealthProviderId;
  isAvailable(): Promise<boolean>;
  requestWriteAuthorization(): Promise<'granted' | 'denied' | 'unavailable'>;
  writeStrengthWorkout(payload: HealthWorkoutPayload): Promise<void>;
}
```

The exact third-party method signatures remain inside the adapters. The rest of the app must not import HealthKit or Health Connect packages directly.

The mapper accepts a completed `Workout`, requires valid ISO timestamps and `endTime > startTime`, and derives duration from the persisted workout timestamps. It does not include exercise or set data in the provider payload. Provider adapters map the shared payload to the platform's strength-workout/session record type.

Use `@kingstinct/react-native-healthkit` plus its required `react-native-nitro-modules` dependency for iOS, and `react-native-health-connect` for Android. These packages require a native build/custom development client; Expo Go is not a supported validation target. Their config plugins must be used rather than placing provider-specific native setup in application components.

## Completion and retry flow

The local lifecycle remains authoritative:

```text
finish active session
        |
        v
persist completed Workout + remove draft
        |
        +--> return to existing completion UI immediately
        |
        +--> if native setting enabled, enqueue health sync
                    |
                    +--> mark local record pending
                    +--> provider write
                    +--> mark synced, or mark failed with error
```

`WorkoutContext` should trigger the health service only after `finishWorkout()` has returned the successfully persisted completed workout. The service must catch provider errors outside the local completion promise. A provider failure is an integration status, not a `SessionController` persistence failure.

Retry pending and failed records on native app startup after storage initialization, and when the user re-enables the setting. Retry only while the setting is enabled and the provider is available. A future manual retry control can reuse the same service; it is not required for this release.

The normal retry key is `(workoutId, provider)`. Before writing, calculate a stable fingerprint from the shared payload. If an existing record is `synced` with the same fingerprint, skip the provider call. A failed record with the same fingerprint may be retried. A changed fingerprint is not automatically rewritten in this release because the provider record's identity and update semantics differ; the original successful export remains the exported representation.

The external write and local status update cannot be one atomic transaction. The system therefore provides at-least-once behavior across a process crash: the local ledger prevents ordinary duplicate calls, while a crash after an external write and before `synced` is recorded may require provider-side duplicate cleanup. Do not add health reads solely to hide this edge in this release.

## Local sync ledger

Extend `Store` with provider-neutral health-sync methods:

```ts
type HealthSyncStatus = 'pending' | 'synced' | 'failed';

interface HealthSyncRecord {
  workoutId: string;
  provider: HealthProviderId;
  payloadFingerprint: string;
  status: HealthSyncStatus;
  attemptedAt: string;
  syncedAt?: string;
  lastError?: string;
}
```

Required operations are to read one record by `(workoutId, provider)`, list pending/failed records, and insert/update a record. The native table uses `(workout_id, provider)` as its primary key, a foreign key to `workouts` with `ON DELETE CASCADE`, a status check, and a status index. Add this as SQLite migration 7, preserving the existing transactional migration and failure-injection conventions.

The web adapter must retain contract parity even though the feature is hidden. Upgrade IndexedDB from version 2 to version 3 and add a `health_sync_records` object store keyed by `['workoutId', 'provider']`, with a status index. Existing version-2 stores and records must remain intact.

Delete ledger rows with a deleted local workout. Do not include ledger rows in `DataSnapshot`, backup export, restore, or merge. Restored workouts must not be silently exported as new health records merely because health sync is enabled.

## Platform configuration

Add the provider packages and config plugins in `app.json` after the compatibility spike succeeds.

iOS configuration must include the HealthKit capability/entitlement and a clear write-usage description. Android configuration must include the Health Connect plugin and the minimum health permission needed to write exercise sessions. Keep permissions write-only; do not request read permissions. If the selected Android package requires a compile/target SDK override, make the smallest Expo SDK 57-compatible `expo-build-properties` change and verify the generated native configuration.

The compatibility spike is an explicit gate before broad implementation: install the selected versions with `npx expo install`, run TypeScript and Expo config/prebuild checks for both native platforms where the environment permits, confirm the plugins generate the expected entitlement/manifest entries, and resolve any SDK 57 incompatibility before adding application behavior.

## Settings integration

Extend `SettingsContext` with `healthSyncEnabled` and an async setter. Read the persisted value with a default of false. Enabling performs availability and write authorization through the health service, then persists the preference. On any failure, restore the previous state and notify through the existing dialog mechanism. Persisting the setting itself must use the existing database wrappers so native and web settings behavior stays consistent.

Update `SettingsModal` with the native-only switch and loading/accessibility states consistent with the existing Gym Tracking and Weight Unit controls. The modal should not expose provider package names in shared business logic; user-facing copy may name Apple Health on iOS and Health Connect on Android.

## Backup and privacy

Health export is opt-in and writes only the selected workout-session summary. Lifts must not request health read access or store health data locally. The local ledger contains operational metadata and error text only; it is device-local and excluded from backups. Do not put provider authorization tokens, platform record identifiers, or health-store records in the backup format.

## Testing strategy

Use the repository's existing `node:test`/`tsx` harness and integration store fixtures.

Pure unit coverage:

- valid completed workout maps to the exact minimal shared payload;
- invalid or reversed timestamps are rejected;
- duration is non-negative and derived consistently;
- payload fingerprints are stable regardless of object key ordering;
- synced/same-fingerprint records are skipped;
- failed records retry and changed fingerprints do not create a second automatic export.

Native-store integration coverage:

- migration 6→7 creates the ledger without losing existing data;
- migration failure rolls back and can be retried;
- pending, synced, and failed records round-trip;
- deleting a workout removes its ledger rows;
- snapshots and backup/restore omit ledger rows.

Web-store integration coverage:

- IndexedDB 2→3 preserves all existing records;
- the composite ledger key and status index work;
- web health provider behavior is unavailable/no-op and does not load native modules.

Service/context coverage:

- authorization denial leaves the setting disabled;
- successful local completion resolves even when the provider rejects;
- provider success marks the record synced;
- provider failure marks the record failed and allows a later retry;
- a previously synced same-payload workout does not call the provider again.

Native device validation is a follow-up acceptance step after implementation and is intentionally separate from the automated work: install a custom development build on one iOS device/simulator and one Android device/emulator with the relevant health provider available, grant write access, finish one workout, verify one platform workout record, deny access, and verify local completion still succeeds.

## Acceptance criteria

- The dependency/config compatibility gate passes for the selected Expo SDK 57 native setup.
- The web TypeScript build/export remains successful and contains no native health imports in the web path.
- Health sync is visibly opt-in, defaults off, and is unavailable in web UI.
- A locally completed workout is never lost or reported as failed because health export failed.
- With permission granted, one completed Lifts workout creates one strength workout/session record with correct start and end times.
- Re-running the retry path for an already synced payload does not issue another provider write.
- Native migration 7 and IndexedDB version 3 preserve existing user data.
- Health ledger data is removed with local workouts and is absent from backups.
- No health data is read into Lifts, and no set-level or biometric data is exported.

## References

- [Apple HealthKit documentation](https://developer.apple.com/documentation/healthkit)
- [`@kingstinct/react-native-healthkit` documentation](https://github.com/kingstinct/react-native-healthkit)
- [Android Health Connect documentation](https://developer.android.com/health-and-fitness/health-connect)
- [`react-native-health-connect` documentation](https://github.com/matinzd/react-native-health-connect)
