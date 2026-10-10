# Changelog

All notable changes to Lifts are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Each `## [X.Y.Z]` section becomes the
GitHub Release notes for tag `vX.Y.Z`.

## [Unreleased]

### Added
- Optional Android backups after each completed workout, saved to a chosen folder with a manual backup action, status display, and retention of the newest 10 copies.
- Settings switch to turn off exercise photos downloaded from GitHub. When off, exercises show the built-in illustrations.

### Changed
- Android builds no longer request the draw-over-other-apps or legacy storage permissions that the Expo template adds.
- Android rests end with a vibration cue instead of a notification: a pulse at 3, 2 and 1 seconds left and a harder buzz at 0. It plays on time with the phone locked or the app closed. Lifts no longer asks for notification permission on Android.
- On the first rest, Android 14 and later ask once to allow alarms, which keeps the cue on time.

### Fixed
- The Android rest countdown buzz no longer depends on the app being on screen or on the system touch-vibration setting, which made it unreliable and silent on the lock screen.
- Adding or subtracting time during a rest keeps the progress bar in place.

## [1.0.5]

### Changed
- Release APKs are now shrunk and optimized with R8, as F-Droid asked, so they are smaller. The app's features are unchanged.

## [1.0.4]

### Fixed
- Release APKs no longer contain the IP address of the machine that built them. React Native stores it for development builds; in release builds it only made the APK differ between builders, so F-Droid could not reproduce 1.0.3. The app itself is unchanged.

## [1.0.3]

### Changed
- Every native module is now compiled with React Native's Android NDK, so a build needs a single NDK. This makes F-Droid builds more reliable; the app itself is unchanged.

## [1.0.2]

### Changed
- Android APKs are now reproducible: the GitHub Release APKs are built in F-Droid's build environment and match F-Droid's own builds byte for byte, so both carry the Lifts signature and you can switch between them without reinstalling.
- Android releases now ship one APK per CPU architecture (`arm64-v8a` for most phones, `armeabi-v7a` for older 32-bit phones, `x86_64` for emulators and Chromebooks), each about a third of the size (34 MB instead of 91 MB for `arm64-v8a`), plus a universal APK. Android version codes are now `base × 10 + architecture`, so 1.0.2 installs over 1.0.1.

## [1.0.1]

The first release built for F-Droid. The app itself is unchanged from 1.0.0.

### Changed
- Every Expo native module is now compiled from source instead of using prebuilt libraries, as F-Droid requires.
- Added F-Droid store listing metadata (description, icon, and changelog).

## [1.0.0]

The first public release of Lifts: a free, open-source, offline-first gym tracker
with no paywalls, accounts, ads, or tracking.

### Logging workouts
- One-tap set logging that pre-fills weight and reps from the current session or your last completed workout.
- Set types (warmup, normal, drop, failure) and optional RPE.
- Supersets and giant sets with grouped, alternating set navigation.
- Warmup ramp calculator with plate rounding and presets.
- Rest timer with a precision wheel, presets, a 3-2-1 haptic countdown, and an alert when rest is over, even with the phone locked. On Android 14 and later, allow "Alarms & reminders" from Settings so alerts arrive exactly on time.
- Wall-clock workout and rest timers that stay accurate when the phone is locked or the app is backgrounded.
- Draft autosave every 3 seconds with crash recovery, a floating mini-bar while browsing, and screen keep-awake.
- Edit finished workouts, including their duration.

### Routines and exercises
- Unlimited routines and folders, with duplication, reordering, in-place exercise swapping, and batch adding.
- Rep targets as fixed numbers, ranges (`8-12`), per-set lists (`10, 8, 6`), or `AMRAP`.
- 876 bundled exercises with instructions, primary and secondary muscles, two-frame movement visuals, and form references.
- Smart search that understands gym abbreviations (`ohp`, `rdl`, `db`, …), plus custom exercises.
- Multi-gym tracking that keeps machine and cable history separate per gym.

### Progress
- Personal records with in-workout celebrations and a records overview.
- Per-exercise history, and strength, volume, and estimated 1RM progression curves.
- Weekly volume, muscle frequency and balance, rep-range distribution, and consistency views.
- Plate calculator and 1RM calculator (Epley and Brzycki), in kg or lb.

### Your data
- Everything is stored on your device (SQLite on Android and iOS, IndexedDB on web). The Android app contains no Firebase or Google Play Services libraries.
- Full JSON backup and atomic restore, and CSV import from Hevy, Strong, Lyfta, FitNotes, and generic CSV.
- Optional export of completed workout sessions to Health Connect (Android) and Apple Health (iOS). Lifts never reads health data.
