# Lifts — Product Roadmap

> **The 100% Free & Open-Source Gym Workout Tracker.**  
> *Zero paywalls. Unlimited workouts, routines, folders, and analytics. Forever.*

---

## Vision & Core Philosophy

1. **No Paywalls Ever**: Most proprietary gym trackers restrict free users to 3–4 custom workouts and lock analytics behind monthly subscriptions. Lifts will always provide unlimited routines, folders, history, 1RM analytics, and plate calculations completely free.
2. **Local-First & Offline**: Gyms frequently have poor cellular reception. All workout data, routine templates, and exercise instructions live locally on the device via native SQLite (iOS & Android) and IndexedDB (Web).
3. **Gym-Floor Ergonomics**: High-contrast dark theme, large touch targets (minimum 44x44 pt), haptic feedback, 1-tap straight-set auto-filling, and non-blocking background rest timers.

---

## Feature Comparison: Proprietary Trackers vs. Lifts

| Feature | Proprietary Trackers (Freemium) | Lifts (Open Source / Free) | Current Implementation Status |
| :--- | :--- | :--- | :--- |
| **Workout Creation Limit** | Capped at 4 routines on free tier | Unlimited routines & folders | Completed (Unlimited routines with folder organization) |
| **Active Session Minimization** | Minimizes to bottom bar while browsing | Floating mini-bar | Completed with Android BackHandler minimization |
| **Set Logging & Auto-Fill** | Auto-copies previous set weight/reps | 1-tap straight-set auto-fill & 1-tap clickable ghost stats | Completed (Straight-set auto-fill & 1-tap ghost stats) |
| **Touch Targets & Sizing** | Large, high-visibility numbers | Large 44–54px gym-first touch targets | Completed (Scaled checkmarks, sets, pills, inputs & icons) |
| **Exercise Library** | ~500 exercises with animations | 876 categorized exercises + rich media | 876 exercises bundled with in-workout form guide & instructions; animations in Phase 4 |
| **Set Check Haptics** | Subtle vibration on check | Tactile haptic ticks on every set completion & PR alerts | Completed (Tactile feedback on every set check + PR alerts) |
| **Exercise History & PRs** | Displays past weight/reps for that lift | Heaviest lift, Est. 1RM, session tally & full chronological log | Partial (Scalar stats completed; deep chronological log in Phase 3) |
| **Workout History Drill-Down** | Detailed set view | Expandable set & rep breakdown | Completed (Detailed set breakdown + safe deletion) |
| **Repeat Workout ("Perform Again")** | Freemium feature | 1-tap recreate workout from history | Completed (Full workout reconstructed with ghost suggestions) |
| **Routine Duplication** | Freemium limit | 1-tap clone any routine | Completed (Clones all exercises, targets, and notes) |
| **Keep-Awake During Workout** | Screen stays on | Native keep-awake lock | Completed (Keeps screen on during active workouts) |
| **Set Types** | Normal, Warmup, Drop, Failure | Normal, Warmup, Drop, Failure | Completed (Interactive badge cycling: W, D, F, 1-2-3) |
| **Rest Timer & Alarms** | Floating popup with +30s / -30s | Floating countdown + background notifications + 3-2-1 buzzer | Completed (Rest wheel, presets, background notifications, and 3-2-1 buzzers) |
| **Plate Calculator** | Visual barbell plate calculator | Olympic kg/lb plate calculator | Completed (Color-coded kg & lb plates, 45lb/20kg bar presets) |
| **Units (kg / lb)** | Locked or buggy conversions | Reachable, persistent kg / lb toggle | Completed (Persisted in storage with rollback guard) |
| **1RM Calculator** | Locked in premium | Unlocked with Epley & Brzycki formulas | Completed (With suggested training loads table) |
| **Data Ownership & Backup** | Locked / proprietary export | Schema v2 import compatibility with current Schema v3 export & restore | Completed (Atomic cross-platform backup and restore; v2 imports, v3 exports) |
| **Crash Recovery & Drafts** | Cloud sync required | Local draft autosave & multi-draft recovery | Completed (3s periodic + background saves + recovery modal) |
| **RPE Tracking** | Premium feature | Interactive RPE cycle badge (optional, None by default) | Completed (Interactive cycle badge with None by default) |
| **Supersets & Giant Sets** | Premium feature | Planned Phase 3 | Backlog |
| **Warmup Set Progression** | Premium feature | Planned Phase 3 | Backlog |
| **Progress Charts & Graphs** | Premium feature | Weekly volume, muscle-frequency & 1RM trend curves | Partial (Volume/frequency delivered; 1RM trend curves in Phase 3) |
| **CSV / Third-Party Import** | Freemium feature | Cross-platform importer for Hevy, Strong, Lyfta, FitNotes & CSV | Completed (Auto-format detection, unit normalization, exercise matching) |
| **Exercise Demonstration Media**| Premium feature | Visual anatomical cues & looped animations | Planned Phase 4 (Text instructions bundled) |
| **Apple Health / Health Connect** | Premium feature | Planned Phase 4 | Backlog |

---

## Detailed Phase Roadmap

### Phase 1: Core Foundation & Storage Remediation [Completed]
- [x] React Native + Expo SDK 57 + TypeScript architecture.
- [x] Durable offline SQLite schema with write serialization and transactional migrations (`src/database/nativeStore.ts`).
- [x] Durable IndexedDB browser storage with single-writer lease protection (`src/database/webStore.ts`).
- [x] Seed data integrity: exactly 876 bundled exercises with strict verification.
- [x] Session controller with serialized lifecycle transitions (idle, active, starting, finishing, discarding).
- [x] Wall-clock accurate duration and rest timers across backgrounding and recovery.
- [x] Strict 0 kg weight preservation and set completion validation.
- [x] Cross-platform accessible confirmation dialogs replacing window.confirm/Alert.alert.
- [x] Backup compatibility and restore: Schema v2 remains import-compatible; current exports use Schema v3 for workouts, routines, custom exercises, settings, gyms, and scopes with collision-resistant atomic restore.
- [x] Reachable kg/lb settings modal in Workout header with durable storage.
- [x] History-derived statistics calculated strictly over completed workouts (`is_completed = 1`).
- [x] "Perform Again" reconstructing full workout order, counts, and historical ghost suggestions.
- [x] Olympic plate calculator with kg and lb modes and unit toggle.

### Phase 2: User Experience & Convenience [Completed]
- [x] Floating mini-workout bar with non-blocking tab navigation during training.
- [x] Android hardware and gesture back navigation minimizing workouts without data loss.
- [x] Smart search engine resolving abbreviations (`bench`, `ohp`, `rdl`, `db`, `bb`, `tri`, `bi`).
- [x] In-place exercise swapping (`⇄`), batch adding, and routine duplication.
- [x] Routine folder creation, renaming, deletion, and auto-reset on folder removal.
- [x] Dual-drum rest time wheel modal and quick presets.
- [x] Expandable workout history cards with set summaries and delete options.
- [x] Screen keep-awake lock during gym sessions.
- [x] **Multi-Gym Tracking & Machine Isolation**: Gym profiles, active-gym workout assignment, machine/cable history isolation, global/current-gym records, linked scopes, and v2 import/v3 export. Implementation is complete; native/manual release acceptance remains pending.

### Phase 2.1: Gym-Floor Ergonomics & Input Polish [Completed]
- [x] **Background Rest Alarms & Notifications**: Schedule local system notifications via `expo-notifications` with sound and vibration so rest timers alert reliably when the screen is locked or the app is backgrounded.
- [x] **Intense 3-2-1 Countdown Warning**: Multi-pulse haptic alerts during the final 3 seconds of rest countdown (3... 2... 1... DONE) to signal impending sets without looking at the screen.
- [x] **1-Tap Clickable Previous Stats**: Make ghost metrics (`100 kg × 8`) clickable touch targets that instantly populate active set weight and reps.
- [x] **Universal Set Completion Haptic**: Crisp tactile feedback immediately on checking off any set, independent of PR or rest timer activation.
- [x] **Default RPE to None**: Remove hardcoded default RPE (`8`) when adding sets, keeping RPE unassigned until intentionally selected.
- [x] **Smooth Numeric Input & Decimal Handling**: Debounce and stabilize `WeightInput` and `RepsInput` to prevent typing lag, comma/dot conversion conflicts, and cursor jumping.
- [x] **Active Workout Keyboard Avoidance**: Implement keyboard-aware scroll handling so soft keyboards never obscure bottom sets or inputs.
- [x] **Accordion State Stability**: Persist collapsed/expanded exercise state across tab switching, workout minimization, and set additions without unprompted re-expansion.
- [x] **In-Workout Exercise Detail Modal**: Tap exercise avatar or title to inspect form instructions, cues, and muscle targets directly from the active workout screen.
- [x] **Previous Stats Accuracy & Fallback**: Fix ghost set lookup inconsistencies across uncompleted set states, set count variations, and gym scoping fallbacks.

### Phase 3: Advanced Training & Deep Analytics [Planned]
- [ ] **Supersets & Giant Sets**: Visual grouping brackets connecting two or more exercises with combined rest intervals.
- [ ] **Warmup Progression Calculator**: Automatic warmup ramp generator (e.g. 50% x 10, 70% x 5, 85% x 2).
- [x] **Weekly Volume & Muscle-Frequency Charts**: Delivered weekly completed-set volume and primary-muscle workout-frequency views.
- [x] **Per-Exercise Chronological History Drill-Down**: Full set-by-set workout logs per exercise with dates, gyms, loads, reps, volume, and session notes.
- [x] **Strength / 1RM Progression Curves**: Interactive strength, volume, and estimated-1RM trend views per exercise or muscle group.
- [x] **Personal Record (PR) Badges & Celebrations**: Visual badges and celebration cues when achieving a new weight, volume, or rep record.
- [x] **Comprehensive Training Analytics**: Muscle balance heatmaps, fatigue & recovery estimates, rep range distributions, and consistency timelines.
- [x] **CSV / Strong / Hevy / Lyfta Data Import**: Cross-platform importer supporting Hevy, Strong, Lyfta, FitNotes, and generic CSV exports with fuzzy exercise matching, synonym expansion, interactive exercise library assignment & custom creation picker, unit normalization, duplicate workout detection, and dry-run preview.

### Phase 4: Ecosystem & Rich Media [Planned]
- [ ] **Health Connect (Android) & Apple Health (iOS)**: Sync completed workouts and exercise duration with platform health services.
- [ ] **Rich Exercise Media & Visual Demonstration Guides**: Offline anatomical vector maps, step-by-step form cues, and looped vector/GIF animations.
- [ ] **Wear OS / Apple Watch Companion**: Companion app for quick set logging and wrist rest countdowns.
- [ ] **F-Droid & App Store Publishing**: Packaged releases with compliant data licensing and production signing identities.
