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
