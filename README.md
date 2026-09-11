# Lifts — Free & Open-Source Gym Workout Tracker

> **A fast, clean, and 100% free and open-source gym workout tracker for Android, iOS, and Web.**  
> *Zero paywalls. Zero subscriptions. Zero ads. Unlimited workouts, routines, and analytics — forever.*

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2057-blue.svg)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB.svg)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Why Lifts?

Most modern fitness apps start out great, only to lock your workouts behind expensive recurring subscriptions, restrict free users to 3–4 routines, or require active internet connections in basement gyms with zero cellular reception.

**Lifts** is built by lifters, for lifters:
- **No Paywalls Ever**: Unlimited routines, folders, exercise history, 1RM calculators, and plate math completely free.
- **Local-First & Offline**: All workout logs, routines, and exercises are stored directly on your device via native SQLite (iOS & Android) and IndexedDB (Web). Zero accounts required, zero tracking, works with zero phone signal.
- **Gym-Floor Ergonomics**: High-contrast dark theme, generous 44–54px touch targets for shaky hands, haptic feedback, 1-tap straight-set auto-filling, and non-blocking background rest timers.

---

## Features

### Gym Floor Workout Logger
- **One-Tap Set Logging**: Automatically pre-fills the next set with weight and reps from the current session or previous workout ghosts (scoped to the most recent completed session).
- **Set Types & RPE**: Tag sets as Warmup (`W`), Normal (`1, 2, 3...`), Drop Set (`D`), or Failure (`F`), and track Rate of Perceived Exertion (RPE 5–10) with an interactive cycle badge.
- **Wall-Clock Timers**: Workout duration and rest timers compute against true device wall-clock timestamps (`startTime`, `endsAt`), eliminating timer freeze or drift when backgrounding or locking your device.
- **Draft Autosave & Crash Recovery**: Active sessions autosave to native SQLite every 3 seconds and on backgrounding. An interactive recovery modal allows selecting and resuming saved drafts if interrupted.
- **Floating Mini-Workout Bar**: Minimize the active session to browse history, build routines, or calculate plates without interrupting your workout.
- **Precision Rest Timer**: Scrollable dual-drum wheel for minutes and seconds, quick interval presets, physical haptics (`expo-haptics`), and an enlarged non-blocking floating countdown.
- **Screen Wake Lock**: Keeps the screen active during workouts so your phone will not sleep between sets (`expo-keep-awake`).
- **Hardware Back Navigation**: Android hardware/gesture back press minimizes the workout cleanly instead of dropping your session.

### Intuitive Routine Creator
- **Unlimited Folders & Routines**: Organize splits (Push/Pull/Legs, Upper/Lower, Arnold Split, Full Body, etc.) with full folder creation, renaming, and deletion.
- **In-Place Exercise Swapping**: Swap any exercise with one tap while preserving set targets.
- **Multi-Select Batch Adding**: Pick multiple exercises in the browser and add them all at once.
- **Exercise Duplication & Reordering**: Duplicate movements or reorder via up/down controls or compact list view.
- **Custom-First Reps & Dropdown Presets**: Direct text entry for custom rep ranges (`8-12`, `5`, `AMRAP`, `10, 8, 6`) with a clean presets dropdown modal.
- **Customizable Rest Timers**: Default timer is off (`0`), or configure exact rest durations per exercise.

### 870+ Exercise Database & Smart Search
- **Comprehensive Library**: Over 870 movements categorized by primary/secondary muscle groups and equipment (Barbell, Dumbbell, Cable, Machine, Bodyweight, etc.).
- **Smart Slang Search**: Instantly resolves common gym abbreviations (`bench`, `ohp`, `rdl`, `db`, `bb`, `tri`, `bi`, `lat`, etc.).
- **Custom Exercises**: Create your own exercises with target muscle groups and equipment categories.

### Built-in Lifter Utilities
- **Reachable kg / lb Unit Setting**: Toggle between metric and imperial weight units from the Workout screen header with persistent storage and rollback protection.
- **Olympic Barbell Plate Calculator**: Visual color-coded plates for both kg (`25, 20, 15, 10, 5, 2.5, 1.25`) and lb (`45, 35, 25, 10, 5, 2.5`) with corresponding barbell options (20kg/45lb, 15kg/35lb, 10kg/15lb) and unit toggle.
- **1-Rep Max (1RM) Calculator**: Epley and Brzycki formula calculators with an instant training percentage breakdown table (95% down to 50% 1RM).

### Progress, History & Data Ownership
- **Gym Profiles**: Create profiles, choose the active/default gym, and keep completed workouts and drafts assigned to a gym. With one gym, the experience remains zero-friction: the seeded Default Gym is used automatically.
- **Machine & Cable Isolation**: Machine and cable exercise history is gym-specific by default, so raw logged values stay separated between locations. No pulley-ratio, machine-leverage, or plate-increment conversion is performed.
- **Global, Current-Gym & Linked Records**: Global exercises show all-gym records; gym-specific exercises show current-gym records; linked scopes can intentionally share selected gyms. Foreign previous-set suggestions are visibly labeled with their source gym.
- **Exercise PRs & Stats**: Tap any exercise to view your heaviest lift, estimated 1RM, and session count derived strictly from completed workouts.
- **Expandable Workout Log**: Drill down into every past workout to inspect completed weights, reps, and RPE pills.
- **Perform Again**: 1-tap restart of past completed workouts from History, reconstructing all exercises, target sets, reps, and historical weights as suggestions.
- **Atomic Backup & Restore (v3 export, v2 import)**: New exports include gym profiles and exercise scopes. Existing Schema v2 backups remain importable, and restore merges records safely with collision prevention.

---

## Storage & Platform Architecture

Lifts employs a dual-engine local storage architecture:
- **Native (Android & iOS)**: Stored in a durable SQLite database via `expo-sqlite` with write queue serialization and transactional schema migrations (`src/database/nativeStore.ts`).
- **Web**: Stored in client-side IndexedDB with single-writer lease protection (`src/database/webStore.ts`).
  - *Note on Web Limitations*: Data stored in the browser depends on local browser storage policies. Clearing browsing history, using incognito/private mode, or browser storage eviction can remove local data. For permanent and offline training, use the native Android or iOS builds.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [npm](https://www.npmjs.com/) (v9.0.0 or higher)
- [Expo Go](https://expo.dev/client) app installed on your iOS or Android device (for development testing)

### Installation & Local Run

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Benflex1/lifts.git
   cd lifts
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the Expo development server**:
   ```bash
   npm start
   ```

4. **Run on a physical phone via Tunnel**:
   ```bash
   npm run tunnel
   ```
   Scan the generated QR code using the **Camera app** (iOS) or the **Expo Go app** (Android).

---

## Building an Android Debug APK

To build a standalone debug APK locally without relying on cloud services:

1. **Prerequisites**:
   - Java Development Kit (JDK 17)
   - Android SDK and platform tools installed
   - `ANDROID_HOME` environment variable configured

2. **Generate native Android project**:
   ```bash
   npx expo prebuild --platform android
   ```

3. **Build the debug APK using Gradle**:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```

4. **Locate the APK**:
   The output APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) with [Expo SDK 57](https://docs.expo.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Native Storage**: `expo-sqlite` (SQLite 3)
- **Web Storage**: IndexedDB (API-compliant with native store)
- **Icons**: `lucide-react-native`
- **Device Utilities**: `expo-haptics`, `expo-keep-awake`, `expo-crypto`, `expo-sharing`, `expo-document-picker`

---

## Documentation & Provenance

- [Product Roadmap](ROADMAP.md)
- [Multi-Gym Tracking & Machine Isolation Design Spec](docs/superpowers/specs/2026-09-10-multi-gym-tracking-design.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Third-Party Notices](THIRD_PARTY_NOTICES.md)
- [Data & Asset Provenance](docs/data-provenance.md)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
