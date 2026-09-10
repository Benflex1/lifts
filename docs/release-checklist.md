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
- **Android SDK**: Build-Tools 35.0.0, Platform SDK 35 (Android 15)
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
| **REL-10** | Backup Export & Restore | Export JSON v2 from web; restore to native | Full workout exercises, sets, routines, settings imported | Verified |
| **REL-11** | Restore Collision Safety | Restore backup containing conflicting workout ID | Aborts transaction cleanly with user notification; no partial writes | Verified |
| **REL-12** | Destructive Confirmations| Confirm and cancel routine/workout deletions | Cancellation changes nothing; confirmation commits delete | Verified |
| **REL-13** | Completion Modal | Finish workout | Summary modal displays total volume, sets, and duration | Verified |
| **REL-14** | Android Back Button | Press hardware back while in workout | Minimizes session to floating bar; does not drop workout | Verified |
| **REL-15** | Exercise Dataset Licensing | Verify upstream rights for bundled exercise descriptions | Explicit redistribution permission is recorded or the dataset is replaced | **Verified** — Unlicense/public-domain provenance and transformation hashes recorded in `docs/data-provenance.md`; upstream images are not bundled |

## 4. Multi-Gym Release Gate

The automated test suite and web export do not replace native or live-device acceptance. The following checks must be recorded before a multi-gym release; pending means the check has not been performed in this release cycle.

| Check ID | Verification Area | Test Procedure | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **REL-16** | Native migration 4→5 | Upgrade native databases at schema 4 on Android and iOS, including active workout/draft fixtures | Migration is atomic, idempotent, backfills valid gym IDs, and rolls back cleanly on failure | **Pending — native device acceptance not performed** |
| **REL-17** | Web IndexedDB 1→2 | Open a version-1 fixture with every existing object store and record | Upgrade preserves all v1 data and lease behavior, creates gym/scope stores, and is repeat-safe | **Pending — browser acceptance not performed** |
| **REL-18** | Default-gym backfill | Open legacy workouts and drafts without a gym ID | Every canonical workout/draft receives `gym-default`; exactly one valid default gym remains | **Pending — manual acceptance not performed** |
| **REL-19** | Gym delete/reassignment | Delete a gym with workouts, drafts, linked scopes, and default status; select a replacement | References are reassigned atomically, linked scopes remain valid, and no dangling references or zero gyms occur | **Pending — manual acceptance not performed** |
| **REL-20** | Linked scopes | Configure global, gym-specific, and linked-gym scopes, including invalid/unknown IDs | Valid scopes select the intended records; invalid scopes are rejected without partial writes | **Pending — manual acceptance not performed** |
| **REL-21** | v2→v3 restore | Import a Schema v2 backup into native and web, then export Schema v3 and restore cross-platform | v2 imports to the default gym; v3 round-trips gyms, scopes, workouts, drafts, and raw weights without collisions or partial writes | **Pending — cross-platform acceptance not performed** |
| **REL-22** | Cross-gym ghost labels | Use a gym-specific exercise with only a completed source set from another gym | Fallback suggestion is labeled with the source gym only while gym tracking is enabled; global suggestions are never mislabeled | **Pending — device UI acceptance not performed** |
| **REL-23** | Feature-toggle persistence | Disable and re-enable Gym Tracking, restart the app/browser, and inspect active workout/history/settings | Toggle persists; UI controls and labels hide/show as specified; stored gym IDs and isolation remain intact | **Pending — device/browser acceptance not performed** |
| **REL-24** | Manual platform acceptance | Run the multi-gym flow on Android, iOS, and Web: create/switch gyms, log, resume, filter, reassign, restore, and toggle tracking | All platform flows pass and results are recorded with build/device/browser details | **Pending — Android, iOS, and Web manual acceptance not performed** |
