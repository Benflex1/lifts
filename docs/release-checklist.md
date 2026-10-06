# Release & Verification Checklist

This document details the environment requirements, build procedures, and device acceptance test matrix for validating releases of Lifts.

---

## 1. Local Toolchain & Build Prerequisites

### General
- **Node.js**: v18.0.0 or v20.x LTS
- **npm**: v9.0.0 or higher
- **Expo CLI**: bundled via repository dependencies (`npx expo`)

### Android Local Build Prerequisites
- **JDK**: OpenJDK 17
- **Android SDK**: Build-Tools 36.0.0, Platform SDK 36
- **Environment Variables**:
  - `ANDROID_HOME`: path to Android SDK directory
  - `JAVA_HOME`: path to JDK 17 installation
- **Build Command**:
  ```bash
  # Generate native android project
  npx expo prebuild --platform android --clean

  # Assemble debug APK
  cd android
  ./gradlew assembleDebug
  ```
- **Output Artifact**: `android/app/build/outputs/apk/debug/app-debug.apk`

### iOS Simulator & Device Workflow (macOS)
- **macOS**: Sonoma 14.x or Sequoia 15.x
- **Xcode**: 16.x with iOS 18 SDK and Command Line Tools
- **CocoaPods**: bundled via Expo prebuild
- **Build Command**:
  ```bash
  # Generate native ios project
  npx expo prebuild --platform ios --clean

  # Run on iOS Simulator
  npx expo run:ios
  ```

---

## 2. Dependency Vulnerability Triage

- **Reported Advisory**: `GHSA-w5hq-g745-h8pq` (`uuid` < 11.1.1)
  - **Path**: `xcode` -> `uuid` and `@expo/ngrok` -> `uuid`
  - **Severity**: Moderate
  - **Production Impact**: None. The runtime mobile and web application uses `expo-crypto` (`Crypto.randomUUID()`) and does not invoke `uuid` or byte buffer formatting.
  - **Triage Decision**: Accepted as dev/build tooling artifact. No insecure `--force` downgrades permitted.

---

## 3. Device & Platform Acceptance Matrix

| Check ID | Verification Area | Test Procedure | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **REL-01** | Fresh Install Seeding | Install on fresh device/browser | Database initializes with 876 exercises and 3 default routines | Verified |
| **REL-02** | Schema v1 Upgrade | Load legacy database with `in_progress=1` | Migrates smoothly; workouts preserved and draft extracted | Verified |
| **REL-03** | Offline Native Logging | Disconnect network; start, log, and finish | Full workout recorded in SQLite without network calls | Verified |
| **REL-04** | Background & Lock | Lock device during active set; wait 5 minutes | Timer computes accurate wall-clock elapsed duration on resume | Verified |
| **REL-05** | Force-Stop & Recovery | Force-stop app during active session; relaunch | Recovery modal detects saved draft with original startTime | Verified |
| **REL-06** | 0 kg Set Preservation | Complete set with 0 kg (bodyweight) | Preserved through save, history, export, and restore | Verified |
| **REL-07** | Repeated Exercises | Routine containing same exercise twice | Occurrence indices map deterministically to past ghost sets | Verified |
| **REL-08** | Routine Rep Targets | Start routine with `6-8`, `10, 8, 6`, and `AMRAP` | Inputs prefill with expected initial values and labels | Verified |
| **REL-09** | Unit Switcher | Switch between kg and lb in Settings | Persisted; existing stored weights intact; plate calc adjusts | Verified |
| **REL-10** | Backup v2 import / v3 export | Import a Schema v2 backup, export the restored data as Schema v3, and restore cross-platform | v2 remains import-compatible; current exports contain v3 gyms/scopes and restore without data loss or partial writes | Verified |
| **REL-11** | Restore Collision Safety | Restore backup containing conflicting workout ID | Aborts transaction cleanly with user notification; no partial writes | Verified |
| **REL-12** | Destructive Confirmations| Confirm and cancel routine/workout deletions | Cancellation changes nothing; confirmation commits delete | Verified |
| **REL-13** | Completion Modal | Finish workout | Summary modal displays total volume, sets, and duration | Verified |
| **REL-14** | Android Back Button | Press hardware back while in workout | Minimizes session to floating bar; does not drop workout | Verified |
| **REL-15** | Exercise Dataset Licensing | Verify upstream rights for bundled exercise descriptions | Explicit redistribution permission is recorded or the dataset is replaced | **Verified** — Unlicense/public-domain provenance and transformation hashes recorded in `docs/data-provenance.md`; upstream images are not bundled |

## 4. Multi-Gym Release Gate

| Check ID | Verification Area | Test Procedure | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **REL-16** | Native migration 4→5 | Upgrade native databases at schema 4 on Android and iOS, including active workout/draft fixtures | Migration is atomic, idempotent, backfills valid gym IDs, and rolls back cleanly on failure | Verified |
| **REL-17** | Web IndexedDB 1→2 | Open a version-1 fixture with every existing object store and record | Upgrade preserves all v1 data and lease behavior, creates gym/scope stores, and is repeat-safe | Verified |
| **REL-18** | Default-gym backfill | Open legacy workouts and drafts without a gym ID | Every canonical workout/draft receives `gym-default`; exactly one valid default gym remains | Verified |
| **REL-19** | Gym delete/reassignment | Delete a gym with workouts, drafts, linked scopes, and default status; select a replacement | References are reassigned atomically, linked scopes remain valid, and no dangling references or zero gyms occur | Verified |
| **REL-20** | Linked scopes | Configure global, gym-specific, and linked-gym scopes, including invalid/unknown IDs | Valid scopes select the intended records; invalid scopes are rejected without partial writes | Verified |
| **REL-21** | v2→v3 restore | Import a Schema v2 backup into native and web, then export Schema v3 and restore cross-platform | v2 imports to the default gym; v3 round-trips gyms, scopes, workouts, drafts, and raw weights without collisions or partial writes | Verified |
| **REL-22** | Cross-gym ghost labels | Use a gym-specific exercise with only a completed source set from another gym | Fallback suggestion is labeled with the source gym only while gym tracking is enabled; global suggestions are never mislabeled | Verified |
| **REL-23** | Feature-toggle persistence | Disable and re-enable Gym Tracking, restart the app/browser, and inspect active workout/history/settings | Toggle persists; UI controls and labels hide/show as specified; stored gym IDs and isolation remain intact | Verified |
| **REL-24** | Manual platform acceptance | Run the multi-gym flow on Android, iOS, and Web: create/switch gyms, log, resume, filter, reassign, restore, and toggle tracking | All platform flows pass and results are recorded with build/device/browser details | Verified |

## 5. CSV Importer & Android Filesystem Compatibility

| Check ID | Verification Area | Test Procedure | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **REL-25** | Resilient File Reading | Pick CSV/JSON files on Android from Downloads, Google Drive, or SD card via `DocumentPicker` | Uses multi-strategy fallback (`FileSystem` -> `fetch` -> `File`); does not fail with `Location ... isn't readable` | Verified |
| **REL-26** | Multi-Tracker CSV Import | Import workout exports from Lyfta, Hevy, Strong, FitNotes, and Generic CSV formats | Accurately identifies format, parses sets/reps/weights, matches exercises, detects duplicates, and assigns to selected gym | Verified |
| **REL-27** | Android Backup & Sharing | Tap "Save Backup to Files" and "Share Backup" on Android 11+ | SAF operates with graceful share-sheet fallback; exports write to `cacheDirectory` without FileProvider crashes | Verified |

## 6. Native Health Export Release Gate

Automated acceptance covers the local-first and provider-boundary guarantees. The native provider rows remain unverified until device testing is performed with custom builds.

| Check ID | Verification Area | Test Procedure | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **REL-28** | SQLite migration 6→7 | Run the automated native migration fixture from schema 6, including an injected migration-7 failure | Migration 7 creates the health ledger atomically, preserves the schema-6 database on failure, enforces provider/status constraints, and cascades rows when a workout is deleted | Verified |
| **REL-29** | IndexedDB migration 2→3 | Open the automated IndexedDB version-2 fixture and inspect existing stores plus the new ledger store | Existing records and stores remain intact; `health_sync_records` has the composite workout/provider key and status index | Verified |
| **REL-30** | Backup exclusion | Run the automated snapshot, backup, restore, and workout-delete fixture with local health ledger rows | Snapshots and backups contain no health ledger rows; restore does not overwrite destination ledger state; deleting a workout removes its local ledger rows | Verified |
| **REL-31** | Web no-op | Run the automated web health boundary tests without loading native provider modules | Web health APIs return no provider/no-op results, and the health setting/export path does not require HealthKit or Health Connect | Verified |
| **REL-32** | Local-completion isolation | Run the automated completion lifecycle tests with a provider failure and with local completion failure | A provider failure cannot reject or roll back a locally completed workout; export is enqueued only after local completion succeeds | Verified |
| **REL-33** | Retry deduplication | Run the automated health-sync tests for pending/failed retries and concurrent calls for one workout/provider | Retries use the same payload fingerprint, while concurrent or already-synced calls produce at most one provider write | Verified |
| **REL-34** | iOS HealthKit custom-build device acceptance | On a physical iOS device, build the app with the native HealthKit configuration, authorize write access, complete a workout, retry a failed write, and inspect Apple Health | Only the completed workout session summary is written; no health reads or set-level export occur; local completion remains successful on denial/unavailability/failure | **Unverified — deferred until user performs device testing** |
| **REL-35** | Android Health Connect custom-build device acceptance | On a physical Android device, build the app with the native Health Connect configuration, authorize write access, complete a workout, retry a failed write, and inspect Health Connect | Only the completed workout session summary is written; no health reads or set-level export occur; local completion remains successful on denial/unavailability/failure | **User-verified on the current branch's standalone Android APK; device details not recorded** |

---

## 7. Signing & Publishing Releases

Releases are built by `.github/workflows/release.yml` and signed with the Lifts upload key. The `plugins/withAndroidRelease.js` config plugin wires the key into the generated `android/app/build.gradle` during `expo prebuild`, so no native files are committed.

### Versioning

- `expo.version` in `app.json` is the single source of truth and must be `MAJOR.MINOR.PATCH`.
- The base versionCode is `MAJOR × 1,000,000 + MINOR × 1,000 + PATCH` (`1.0.2` → `1000002`). Keep `android.versionCode` in `app.json` equal to it (F-Droid reads it from there); prebuild fails if it does not match.
- Built APKs use `base × 10 + ABI digit`: universal `0`, `armeabi-v7a` `1`, `arm64-v8a` `2`, `x86_64` `4` (`-PliftsAbi=<abi>` selects a single-ABI build). 1.0.0 and 1.0.1 predate this and used the base code directly; every later code is higher.
- Release tags are `v` + `expo.version` (for example `v1.0.0`). The workflow rejects a tag that does not match `app.json`.

### One-time setup: upload key

1. Generate the key **outside the repository** (`*.jks` is ignored, but keep it out of the working tree anyway). PKCS12 keystores use one password for both the store and the key.
   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore ~/lifts-upload.jks \
     -alias lifts-upload -keyalg RSA -keysize 4096 -validity 10000
   ```
2. **Back up the keystore and its password in at least two places** (for example a password manager plus an offline copy). Android only installs an update signed by the same key. If the key is lost, everyone who installed a GitHub Release APK has to uninstall (losing local data unless they exported a backup) to move to a new key.
3. Store it as repository secrets:
   ```bash
   base64 -w0 ~/lifts-upload.jks | gh secret set LIFTS_UPLOAD_KEYSTORE_BASE64
   gh secret set LIFTS_UPLOAD_STORE_PASSWORD      # prompts for the password
   gh secret set LIFTS_UPLOAD_KEY_PASSWORD        # same password for PKCS12
   gh secret set LIFTS_UPLOAD_KEY_ALIAS --body lifts-upload
   ```
4. Pin the certificate fingerprint so the workflow rejects APKs signed with any other key:
   ```bash
   keytool -list -v -keystore ~/lifts-upload.jks -alias lifts-upload | grep 'SHA256:'
   gh variable set LIFTS_UPLOAD_CERT_SHA256 --body '<the SHA256 value>'
   ```
5. Dry-run the pipeline from `main`: `gh workflow run release.yml`. It builds, verifies the signature, and uploads the signed APK/AAB as workflow artifacts without publishing a release.

### Cutting a release

1. Set `expo.version` and the matching `android.versionCode` in `app.json`. Update the three `.fdroid.yml` build blocks and `CurrentVersion`/`CurrentVersionCode`, and add `fastlane/metadata/android/en-US/changelogs/<code>.txt` for each ABI code (`base × 10 + 1`, `+ 2`, `+ 4`).
2. In `CHANGELOG.md`, move the `[Unreleased]` entries into a new `## [X.Y.Z]` section.
3. Merge to `main`, then tag the merge commit and push the tag:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. The workflow runs typecheck and both test suites, then:
   - builds one unsigned APK per ABI with `fdroid build` in F-Droid's `buildserver-trixie` image from `.fdroid.yml` (the same bytes F-Droid will build), and signs each with the upload key using `apksigner` 34.0.0;
   - builds a universal APK with Gradle and `LIFTS_REQUIRE_RELEASE_SIGNING=true`;
   - rejects the Android debug certificate, checks the pinned fingerprint, and runs `apksigcopier compare` to prove the signature copies onto the unsigned F-Droid build;
   - publishes `lifts-X.Y.Z-{armeabi-v7a,arm64-v8a,x86_64,universal}.apk` plus `SHA256SUMS.txt`;
   - re-runs `fdroid build` in release mode per ABI, which downloads the published APK and performs F-Droid's own signature-copy verification. If this job fails, F-Droid will skip that version: fix the cause and release a new patch version (never move a tag).
   The AAB (for a future Play Store listing) is kept as a workflow artifact only.

### Signed local builds

Export the same variables before building. Without them, release builds keep Expo's debug signing, which is what `build-apk.yml` preview APKs use. Those previews cannot be installed over a signed release, and a signed release cannot be installed over them.

```bash
export LIFTS_UPLOAD_STORE_FILE=~/lifts-upload.jks
export LIFTS_UPLOAD_STORE_PASSWORD=... LIFTS_UPLOAD_KEY_PASSWORD=... LIFTS_UPLOAD_KEY_ALIAS=lifts-upload
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

### Distribution status

| Check ID | Channel | Status |
| :--- | :--- | :--- |
| **REL-36** | GitHub Releases (signed APK) | **Verified**: v1.0.0 published by `release.yml`, signed with the pinned upload key |
| **REL-37** | F-Droid | Recipe in `.fdroid.yml`, built in F-Droid's build-server image by `.github/workflows/fdroid.yml`; see §8. `expo-notifications` is excluded from Android autolinking in favor of `modules/rest-alarm`, and `scripts/check-android-nonfree.sh` guards against Firebase/Play Services. |
| **REL-37b** | IzzyOnDroid | Deferred: its 30 MB per-app limit is below the ~35 MB per-architecture APK. Revisit with per-ABI APKs and/or R8 shrinking. |
| **REL-38** | Google Play | Not started. The AAB artifact is ready to upload, and enrolling in Play App Signing would make this key the resettable upload key. |
| **REL-39** | Apple App Store | Not started; depends on REL-34 and an Apple Developer account. |

### Android rest alarm acceptance

| Check ID | Verification Area | Test Procedure | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **REL-40** | Locked-screen rest alert | Start a 2-minute rest, lock the phone, and leave it untouched | Alert sounds and vibrates on time; tapping it opens Lifts | Unverified |
| **REL-41** | Exact-alarm permission | On Android 14+, fresh install: open Settings, tap "Allow Alarms & Reminders", enable it, return | The Settings row disappears; later rest alerts are exact | Unverified |
| **REL-42** | Timer changes | Skip, extend, and shorten a running rest timer | Only the latest end time alerts; skipping removes the pending and shown alert | Unverified |
| **REL-43** | Upgrade from 1.0.0 | Install over v1.0.0 with notifications allowed | Existing "Rest Timer" channel settings are kept; alerts still arrive | Unverified |

---

## 8. F-Droid

F-Droid builds Lifts from source with the recipe in `.fdroid.yml`, one APK per ABI. Because the build is reproducible, F-Droid then publishes our developer-signed APK from the GitHub Release (`binary:` + `AllowedAPKSigningKeys`) instead of signing with its own key. Store listing text, icon, and changelogs come from `fastlane/metadata/android/en-US/` at the built tag. The changelog file is named after the versionCode (`changelogs/1000001.txt` for 1.0.1).

### Keeping the recipe buildable

- `.github/workflows/fdroid.yml` runs on every PR that touches the recipe, app config, dependencies, plugins, or native modules. For each ABI, inside `registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie`, it runs `fdroid lint`, checks `fdroid rewritemeta` leaves the recipe unchanged, and performs `fdroid build --on-server` with the commit pinned to the PR head (`binary:` lines are dropped because no release exists yet).
- Reproducibility was established by building one commit twice on independent runners: the APKs were byte-identical (1163 entries, same order). Anything that makes builds depend on time, machine, or path (for example a new native dependency) must keep that property; the release workflow's `fdroid-verify` job is the gate.
- If the F-Droid scanner flags a file under `node_modules`, add a `scanignore` entry only after reviewing that the flagged Gradle/binary file is legitimate. **"Removing" in the scanner log means the whole file is deleted.** A deleted `android/build.gradle` silently drops that library from the app: v1.0.2–1.0.4 per-ABI APKs crashed on launch because the scanner deleted `react-native-svg/android/build.gradle` (flagged only for the local `node_modules/react-native/android` Maven path, the same reason `react-native-safe-area-context` is ignored).
- `scripts/android-smoke-test.sh` launches the F-Droid-built x86_64 APK on an emulator in both the F-Droid PR workflow and the release workflow (before publishing). Byte comparisons cannot catch a build that is reproducible but broken.
- Keep `android.versionCode` in `app.json` in step with `expo.version`; F-Droid's update checker reads both from there, and prebuild fails if they disagree.

### Why the recipe looks the way it does

fdroiddata asked for these notes to be kept out of the recipe (no `MaintainerNotes`), so they live here.

Lifts uses Expo/React Native and does not commit android/; the Android project
is generated by `expo prebuild` after checkout. fdroidserver validates subdir
before prebuild, so no subdir is set: output points at the generated APK and
the build step runs Gradle from android/app.

One APK is built per ABI with -PliftsAbi (upstream plugin: abiFilters plus
versionCode = app.json versionCode * 10 + ABI digit; armeabi-v7a 1,
arm64-v8a 2, x86_64 4), matching VercodeOperation below.

Upstream package.json builds every Expo module from source
(expo.autolinking.android.buildFromSource) and excludes expo-notifications from
Android autolinking, so no Firebase stub is needed: rest-timer notifications
use the in-repo modules/rest-alarm module (AlarmManager + platform
notifications). The bundled local-maven-repo AARs are removed before prebuild.

The React Native Gradle plugin declares a Java 17 toolchain; the prebuild
applies the 17-to-21 adjustment from F-Droid's React Native template. The
upstream signing plugin only signs when LIFTS_UPLOAD_* variables are set; the
remaining signingConfig lines are removed so the release APK is unsigned.

Builds are reproducible: upstream builds each release APK with this recipe in
the fdroidserver buildserver-trixie image and signs it with apksigner, and
independent buildserver builds of one commit are byte-identical. The React
Native Gradle plugin writes the build host's IP into react_native_dev_server_ip;
the upstream plugin pins it for release builds, and upstream CI fails if a
built APK contains the builder's IP or hostname.

Gradle's heap and metaspace are raised after prebuild (Expo's generated
gradle.properties caps metaspace at 512 MiB, which the release packaging step can
exceed); this does not change the build output. The generated file has no
trailing newline, so the setting is written with a leading one.

Node.js/npm come from Debian forky. React Native 0.86 pins NDK 27.1.12297006
(r27b); the upstream plugin makes every native module (including expo-sqlite,
which sets no ndkVersion) use it, so no other NDK is needed.

Release builds are shrunk with R8 (`expo-build-properties` → `enableMinifyInReleaseBuilds`), as the F-Droid reviewer requested. Resource shrinking stays off: React Native resolves bundled images by name at runtime, which resource shrinking cannot see.

### First submission (maintainer, needs a GitLab account)

1. Release the version named in `.fdroid.yml` (tag `vX.Y.Z` as usual) and confirm the F-Droid workflow passed for that commit.
2. Fork https://gitlab.com/fdroid/fdroiddata and create a branch named `com.benflex1.lifts`.
3. Copy `.fdroid.yml` to `metadata/com.benflex1.lifts.yml` and replace every `commit: vX.Y.Z` with the tag's full commit hash (`git rev-list -n1 vX.Y.Z`); fdroiddata requires full hashes.
4. Open a merge request with the "App inclusion" template and answer its checklist. The fdroiddata pipeline repeats the lint and build.
5. Respond to reviewer feedback. After merge, the app appears in F-Droid within a few days. Later releases are picked up automatically (`AutoUpdateMode: Version`, `UpdateCheckMode: Tags`).

### Signing

F-Droid ships the GitHub Release APKs signed with the Lifts upload key (`AllowedAPKSigningKeys: 627ae4049be4512f3d32e85335027a7e45407e47a96c1f7f717ca326877f1ba2`), so F-Droid and GitHub installs are interchangeable. This is only possible because the first F-Droid version is already reproducible: an app first published with F-Droid's key cannot switch later.
