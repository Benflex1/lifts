# Lifts — Free & Open-Source Gym Workout Tracker

> **A fast, clean, and 100% free and open-source gym workout tracker for Android, iOS, and Web.**  
> *Zero paywalls. Zero subscriptions. Zero ads. Unlimited workouts, routines, and analytics — forever.*

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2057-blue.svg)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB.svg)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 💡 Why Lifts?

Most modern fitness apps start out great, only to lock your workouts behind expensive recurring subscriptions, restrict free users to 3–4 routines, or require active internet connections in basement gyms with zero cellular reception.

**Lifts** is built by lifters, for lifters:
- 🔓 **No Paywalls Ever**: Unlimited routines, folders, exercise history, 1RM calculators, and plate math completely free.
- 📶 **Local-First & 100% Offline**: All workout logs, routines, and exercises are stored directly on your device via native SQLite. Zero accounts required, zero tracking, works with zero phone signal.
- 🏋️ **Gym-Floor Ergonomics**: High-contrast dark theme, generous 44–54px touch targets for shaky hands, haptic feedback, 1-tap straight-set auto-filling, and non-blocking background rest timers.

---

## ✨ Features

### 🏋️ Gym Floor Workout Logger
- **One-Tap Set Logging**: Automatically pre-fills the next set with weight and reps from the current session or previous workout ghosts (scoped to the most recent session).
- **Set Types & RPE**: Tag sets as Warmup (`W`), Normal (`1, 2, 3...`), Drop Set (`D`), or Failure (`F`), and track Rate of Perceived Exertion (RPE 5–10) with an interactive cycle badge.
- **Wall-Clock Timers**: Workout duration and rest timers compute against true device wall-clock timestamps (`startTime`, `endsAt`), eliminating timer freeze or drift when backgrounding or locking your device.
- **Draft Autosave & Crash Recovery**: Active sessions autosave to native SQLite every 3 seconds and on backgrounding. A resume banner lets you seamlessly recover your workout if interrupted.
- **Floating Mini-Workout Bar**: Minimize the active session Spotify-style to browse history, build routines, or calculate plates without interrupting your workout.
- **Precision Rest Timer**: Scrollable dual-drum wheel for minutes and seconds, quick interval presets, physical haptics (`expo-haptics`), and an enlarged non-blocking floating countdown.
- **Screen Wake Lock**: Keeps the screen active during workouts so your phone won't sleep between sets (`expo-keep-awake`).
- **Hardware Back Navigation**: Android hardware/gesture back press minimizes the workout cleanly instead of dropping your session.

### 📋 Intuitive Routine Creator
- **Unlimited Folders & Routines**: Organize splits (Push/Pull/Legs, Upper/Lower, Arnold Split, Full Body, etc.) with full folder creation, renaming, and deletion.
- **In-Place Exercise Swapping**: Swap any exercise (`⇄`) with one tap while preserving set targets.
- **Multi-Select Batch Adding**: Pick multiple exercises in the browser and add them all at once.
- **Exercise Duplication & Reordering**: Duplicate movements (`⎘`) or reorder via up/down controls or compact list view.
- **Custom-First Reps & Dropdown Presets**: Direct text entry for custom rep ranges (`8-12`, `5`, `AMRAP`, `10, 8, 6`) with a clean presets dropdown modal.
- **Customizable Rest Timers**: Default timer is off (`0`), or configure exact rest durations per exercise.

### 🔍 870+ Exercise Database & Smart Search
- **Comprehensive Public-Domain Library**: Over 870 movements categorized by primary/secondary muscle groups and equipment (Barbell, Dumbbell, Cable, Machine, Bodyweight, etc.).
- **Smart Slang Search**: Instantly resolves common gym abbreviations (`bench`, `ohp`, `rdl`, `db`, `bb`, `tri`, `bi`, `lat`, etc.).
- **Custom Exercises**: Create your own exercises with target muscle groups and equipment categories.

### 🧮 Built-in Lifter Utilities
- **kg / lb Units Switcher**: Toggle between metric and imperial weight units across the entire app with persistent settings.
- **Olympic Barbell Plate Calculator**: Visual color-coded plates for both kg (20, 15, 10, 5, 2.5, 1.25) and lb (45, 35, 25, 10, 5, 2.5) with corresponding barbell options (20kg/45lb, 15kg/35lb, 10kg/25lb).
- **1-Rep Max (1RM) Calculator**: Epley and Brzycki formula calculators with an instant training percentage breakdown table (95% down to 50% 1RM).

### 📊 Progress & History
- **Exercise PRs & Stats**: Tap any exercise to view your heaviest lift, estimated 1RM, and full session history.
- **Expandable Workout Log**: Drill down into every past workout to inspect completed weights, reps, and RPE pills.
- **Perform Again**: 1-tap restart of past completed workouts from History.
- **Data Ownership & JSON Export**: Export your complete workout history and routines to a standard JSON backup file via the native share sheet.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo Go](https://expo.dev/client) app installed on your iOS or Android device

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Benflex1/lifts.git
   cd lifts
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Run on a physical phone via Tunnel** (recommended for local testing):
   ```bash
   npm run tunnel
   ```
   Scan the generated QR code using the **Camera app** (iOS) or the **Expo Go app** (Android).

---

## 🛠️ Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) with [Expo SDK 57](https://docs.expo.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) (Native SQLite on iOS & Android)
- **Icons**: [lucide-react-native](https://lucide.dev/)
- **Device Utilities**: `expo-haptics`, `expo-keep-awake`, `expo-crypto`

---

## 🗺️ Roadmap

See [ROADMAP.md](ROADMAP.md) for our feature progression plan, including upcoming support for supersets/drop set linking, warmup calculators, and Health Connect / Apple Health synchronization.

---

## 🤝 Contributing

Contributions, feature requests, and bug reports are welcome! Feel free to check out the [issues page](https://github.com/Benflex1/lifts/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
