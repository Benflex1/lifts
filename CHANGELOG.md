# Changelog

All notable changes to Lifts are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Each `## [X.Y.Z]` section becomes the
GitHub Release notes for tag `vX.Y.Z`.

## [Unreleased]

## [1.0.0]

The first public release of Lifts: a free, open-source, offline-first gym tracker
with no paywalls, accounts, ads, or tracking.

### Logging workouts
- One-tap set logging that pre-fills weight and reps from the current session or your last completed workout.
- Set types (warmup, normal, drop, failure) and optional RPE.
- Supersets and giant sets with grouped, alternating set navigation.
- Warmup ramp calculator with plate rounding and presets.
- Rest timer with a precision wheel, presets, background notifications, and a 3-2-1 haptic countdown.
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
- Everything is stored on your device (SQLite on Android and iOS, IndexedDB on web).
- Full JSON backup and atomic restore, and CSV import from Hevy, Strong, Lyfta, FitNotes, and generic CSV.
- Optional export of completed workout sessions to Health Connect (Android) and Apple Health (iOS). Lifts never reads health data.
