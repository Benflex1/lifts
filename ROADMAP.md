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
| **Set Logging & Auto-Fill** | Auto-copies previous set weight/reps | 1-tap straight-set auto-fill | Completed (Session set copy or previous completed workout ghost) |
| **Touch Targets & Sizing** | Large, high-visibility numbers | Large 44–54px gym-first touch targets | Completed (Scaled checkmarks, sets, pills, inputs & icons) |
| **Exercise Library** | ~500 exercises with animations | 876 categorized exercises | Completed (876 movements + smart synonym/slang search) |
| **Exercise History & PRs** | Displays past weight/reps for that lift | Heaviest lift, Est. 1RM, session tally | Completed (Derived strictly from completed workouts) |
| **Workout History Drill-Down** | Detailed set view | Expandable set & rep breakdown | Completed (Detailed set breakdown + safe deletion) |
| **Repeat Workout ("Perform Again")** | Freemium feature | 1-tap recreate workout from history | Completed (Full workout reconstructed with ghost suggestions) |
| **Routine Duplication** | Freemium limit | 1-tap clone any routine | Completed (Clones all exercises, targets, and notes) |
| **Keep-Awake During Workout** | Screen stays on | Native keep-awake lock | Completed (Keeps screen on during active workouts) |
| **Set Types** | Normal, Warmup, Drop, Failure | Normal, Warmup, Drop, Failure | Completed (Interactive badge cycling: W, D, F, 1-2-3) |
| **Rest Timer** | Floating popup with +30s / -30s | Floating countdown overlay + haptics | Completed (Dual-drum wheel + interval presets + haptics) |
| **Plate Calculator** | Visual barbell plate calculator | Olympic kg/lb plate calculator | Completed (Color-coded kg & lb plates, 45lb/20kg bar presets) |
| **Units (kg / lb)** | Locked or buggy conversions | Reachable, persistent kg / lb toggle | Completed (Persisted in storage with rollback guard) |
| **1RM Calculator** | Locked in premium | Unlocked with Epley & Brzycki formulas | Completed (With suggested training loads table) |
| **Data Ownership & Backup** | Locked / proprietary export | Schema v2 import compatibility with current Schema v3 export & restore | Completed (Atomic cross-platform backup and restore; v2 imports, v3 exports) |
| **Crash Recovery & Drafts** | Cloud sync required | Local draft autosave & multi-draft recovery | Completed (3s periodic + background saves + recovery modal) |
| **RPE Tracking** | Premium feature | Interactive RPE cycle badge (5–10) | Completed (Active workout badge + history breakdown) |
| **Supersets & Giant Sets** | Premium feature | Planned Phase 3 | Backlog |
| **Warmup Set Progression** | Premium feature | Planned Phase 3 | Backlog |
| **Progress Charts & Graphs** | Premium feature | Weekly volume and muscle-frequency views; strength/1RM trend charts remain planned | Partial — volume/frequency delivered |
| **Exercise Demonstration Videos**| Premium feature | Planned Phase 4 | Backlog |
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
- [x] Backup Schema v2: full export of workouts, routines, custom exercises, settings, and collision-resistant atomic restore.
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

### Phase 3: Advanced Training Features [Planned]
- [ ] **Supersets & Giant Sets**: Visual grouping brackets connecting two or more exercises with combined rest intervals.
- [ ] **Warmup Progression Calculator**: Automatic warmup ramp generator (e.g. 50% x 10, 70% x 5, 85% x 2).
- [x] **Weekly Volume & Muscle-Frequency Charts**: Delivered weekly completed-set volume and primary-muscle workout-frequency views.
- [ ] **Strength / 1RM Progression Charts**: Interactive strength and estimated-1RM trend views per exercise or muscle group.
- [ ] **Personal Record (PR) Badges**: Visual indicators when completing a set that sets a new weight or volume record.
- [ ] **CSV / Strong / Hevy Data Import**: Import tools for existing workout history files from third-party trackers.

### Phase 4: Ecosystem & Platform Integrations [Planned]
- [ ] **Health Connect (Android) & Apple Health (iOS)**: Sync completed workouts and exercise duration with platform health services.
- [ ] **Exercise Demonstration Guides**: Offline illustrations or guides for exercise movement technique.
- [ ] **F-Droid & App Store Publishing**: Packaged releases with compliant data licensing and production signing identities.
