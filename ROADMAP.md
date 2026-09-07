# Lifts — Product Roadmap

> **The 100% Free & Open-Source Gym Workout Tracker.**  
> *Zero paywalls. Unlimited workouts, routines, folders, and analytics. Forever.*

---

## 🎯 Vision & Core Philosophy

1. **No Paywalls Ever**: Most proprietary gym trackers restrict free users to 3–4 custom workouts and lock analytics behind monthly subscriptions. **Lifts** will always provide unlimited routines, folders, history, 1RM analytics, and plate calculations completely free.
2. **Local-First & Offline**: Gyms frequently have poor cellular reception in basements. All workout data, routine templates, and exercise instructions live locally on the device via native SQLite.
3. **Gym-Floor Ergonomics**: High-contrast dark theme, large touch targets (minimum 44×44 pt), haptic feedback, 1-tap straight-set auto-filling, and non-blocking background rest timers.

---

## 🔍 Feature Breakdown: Proprietary Trackers vs. Lifts

| Feature | Proprietary Trackers (Freemium) | Lifts (Open Source / Free) | Current Status & Planned Enhancement |
| :--- | :--- | :--- | :--- |
| **Workout Creation Limit** | 🔒 Capped at 4 routines on free tier | 🔓 **Unlimited routines & folders** | ✅ Completed |
| **Active Session Minimization** | Minimizes to bottom bar while browsing | ✅ **Spotify-style floating mini-bar** | ✅ Completed with Android BackHandler support |
| **Set Logging & Auto-Fill** | Auto-copies previous set weight/reps | ✅ **1-tap straight-set auto-fill** | ✅ Enhanced: copies session set or previous workout ghost |
| **Touch Targets & Sizing** | Large, high-visibility numbers | Large 44–54px gym-first touch targets | ✅ Scaled checkmarks, sets, pills, inputs & icons |
| **Exercise Library** | ~500 exercises with animations | 876 public-domain exercises | ✅ 876 movements + smart synonym/slang search |
| **Exercise History & PRs** | Displays past weight/reps for that lift | Heaviest lift, Est. 1RM, session tally | ✅ Detailed PRs & stats inside exercise modal |
| **Workout History Drill-Down** | Detailed set view | Expandable set & rep breakdown | ✅ 1-tap toggle per workout + delete option |
| **Routine Duplication** | Freemium limit | 1-tap clone any routine | ✅ Unlocked duplicate button on all routines |
| **Keep-Awake During Workout** | Screen stays on | Native keep-awake lock | ✅ Screen stays on during active workouts |
| **Set Types** | Normal, Warmup, Drop, Failure | Normal, Warmup, Drop, Failure | ✅ Interactive badge cycling (W, D, F, 1-2-3) |
| **Rest Timer** | Floating popup with +30s / -30s | Floating countdown overlay + haptics | ✅ Completed (+30s / -30s enlarged controls) |
| **Plate Calculator** | Visual barbell plate calculator | Olympic 20kg/15kg/10kg plate calc | ✅ Completed (Color-coded Olympic bumper plates) |
| **1RM Calculator** | Locked in premium | Unlocked with Epley & Brzycki formulas | ✅ Completed with suggested training loads table |
| **Data Ownership & Export** | Locked / proprietary export | Local JSON backup and export | ✅ Completed (JSON data export in Analytics) |
| **Supersets & Giant Sets** | Premium feature | Planned Phase 3 | 📋 Backlog |
| **Apple Health / Health Connect** | Premium feature | Planned Phase 4 | 📋 Backlog |

---

## 🗺️ Detailed Phase Roadmap

### Phase 1: Core Foundation (Alpha) ✅
- [x] React Native + Expo SDK 57 + TypeScript architecture.
- [x] Offline SQLite schema with default 876-exercise database.
- [x] Workout state machine with live timer, volume, and completed sets tally.
- [x] Unlimited custom routines and folders with template seeding (PPL, Upper/Lower).
- [x] Epley & Brzycki 1RM calculator with training loads table.
- [x] Visual Olympic barbell plate calculator modal.
- [x] Ngrok tunneling script for physical device testing.

### Phase 2: UI/UX & Gym Floor Usability (Completed) ✅
- [x] **Workout Minimization**: Floating mini-bar to freely navigate tabs during training.
- [x] **Hardware Back Handling**: Android hardware/gesture back press minimizes session instead of trapping or exiting.
- [x] **Smart Search Engine**: Slang & abbreviation resolution (`bench`, `ohp`, `rdl`, `db`, `bb`, `tri`, `bi`).
- [x] **Revamped Routine Creator**: 1-tap in-place Exercise Swapping (`⇄`), Multi-Select Batch Adding (`Add 3 Exercises`), Compact Reorder vs Detailed view toggle, 1-tap Set Presets (`2, 3, 4, 5, 6`), Direct Custom Reps Input, Rest timer presets (`Off, 30s, 60s, 90s, 2m, 3m, 5m`), and 1-tap Exercise Duplication (`⎘`).
- [x] **Gym-First Touch Targets**: Upgrade table cell inputs, set number badges, checkmark buttons, and action icons to generous 44–54px touch targets.
- [x] **Detailed Exercise History Modal**: Show past sessions, max weight, and estimated 1RM when tapping an exercise.
- [x] **Workout History Drill-Down**: Expand past workout cards to review completed sets, weights, and reps.
- [x] **Delete Past Workout**: Allow lifters to delete erroneous or test workouts from History.
- [x] **Exercise Notes & RPE**: Optional note field per exercise card (e.g., "Seat notch 4", "felt sharp").
- [x] **Routine Cloning / Duplication**: 1-tap duplicate any routine with all configured exercises, target sets, reps, and rest timers.
- [x] **Screen Wake Lock**: Keep screen active during gym sessions via `expo-keep-awake`.

### Phase 3: Advanced Gym Progression (Beta) 📋
- [ ] **Supersets & Drop Set Linking**: Visual grouping bracket connecting two or more exercises.
- [ ] **Warmup Set Calculator**: Automatically generate warmup progression (e.g. 50% × 10, 70% × 5, 85% × 2).
- [ ] **Personal Record (PR) Badges**: Instant gold trophy badge when a new max weight or volume record is set.
- [ ] **CSV / Strong / Hevy Data Import**: Import existing workout histories from other trackers.

### Phase 4: Release & Ecosystem (Production) 🚀
- [ ] **Health Connect (Android) & Apple Health (iOS)**: Sync burned calories and workout time.
- [ ] **Standalone APK / AAB & iOS IPA Build**: GitHub Actions CI/CD pipelines via EAS.
- [ ] **F-Droid & Play Store Distribution**: Open-source release on F-Droid and Google Play.
