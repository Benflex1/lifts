# Lifts Parity Pass — Design Spec

- **Date:** 2026-09-07
- **Status:** Approved
- **Goal:** Make the Lifts gym tracker trustworthy as a Lyfta-class workout logger: fix the timer/input bugs, finish the half-implemented features, and make the README/ROADMAP truthful. House cleaned top-to-bottom in one sequenced plan.

## Context

Lifts is an Expo SDK 57 / React Native 0.86 / TypeScript workout tracker (4 tabs: Workout, History, Exercises, Analytics). It aims to be a free, local-first clone of the Lyfta app's core experience: 1-tap set logging with ghost weights, set types (W/D/F), rest timers, mini-bar minimized sessions, generous touch targets, dark theme.

A full codebase audit found the logger core is genuinely good, but there are two classes of problems:

1. **Bugs that break trust mid-gym:** timers are tick-based (drift, stall in background, workout duration undercounts); decimal weight entry (`2.5`, `12.`) is broken by `parseFloat` re-derivation; side effects fire inside `setState` updaters; SQLite failures are unhandled (silent data loss on Finish).
2. **Half-features that lie:** the Analytics tab's Export button exports nothing; RPE exists in the DB schema but has no UI; "Repeat workout" copies zero exercises or sets; folders are raw strings with no rename/delete; web build loses all data on refresh (stays a preview demo — out of scope per user).

## Out of Scope (keeps ROADMAP backlog list)

- Light theme, supersets/giant sets, PR badges, warmup calculator, CSV/Strong/Hevy import, charts/analytics, exercise images/body maps, Health Connect/Apple Health.
- Web persistence — web remains a throwaway preview; it must only keep compiling.
- Lyfta's premium features and account/API model — Lifts stays local-first and free.

## Design

Work is sequenced by blast radius: foundational fixes that everything else depends on, then schema-touching parity features, then feature completion, then hygiene.

### Part 1 — Foundational (trust blockers)

**1.1 Wall-clock timers** (`src/context/WorkoutContext.tsx:57-92`, `:365-370`)
- Elapsed time: compute from `Date.now() - startTime` on a 1-second interval with stable (empty/ref-based) deps — keypresses must not tear down and restart the tick (current behavior undercounts duration).
- Rest timer: store `endsAt` timestamp instead of remaining-seconds state; each tick computes `max(0, endsAt - now)`; on `AppState` foreground, recompute from wall clock (backgrounding no longer stalls).
- `finishWorkout`: persist duration from wall-clock timestamps, never from accumulated ticks.
- Move side effects out of `setActiveWorkout` updaters: `toggleSetComplete` (haptics, `startRestTimer`) and any other impure updater.

**1.2 Error-safe data layer** (`src/database/db.native.ts:36`, `WorkoutScreen.tsx:45-53`, `WorkoutContext.tsx:121-167,352-382`)
- Enable `PRAGMA foreign_keys = ON` on connection open.
- Wrap `startWorkout`, `finishWorkout`, `handleStartRoutine`, `handlePerformAgain` in try/catch → user-facing `Alert` with a plain-language message; no unhandled promise rejections.

**1.3 Decimal weight input** (`src/screens/ActiveWorkoutScreen.tsx:304-317`, `PlateCalculatorModal.tsx:27`)
- Weight inputs hold the raw string in local state while typing; parse to number on blur/submit. `2.5`, `12.`, `.5` all typeable.
- Steppers parse on each step and re-render the formatted value.
- `PlateCalculatorModal`: derive initial weights from the exercise's live set weight on open (e.g. reset state via key/prop effect), not stale module-mount state.

**1.4 Ghost prefill scoping** (`db.native.ts:657-666`)
- `getPreviousSetsForExercise` returns the last 10 sets across *any* sessions; scope it to the most recent session that contained the exercise, then match by set index with in-session fallback.

### Part 2 — Schema-touching parity

**2.1 kg/lb units toggle**
- New `settings` key-value table (`unit` = `kg` | `lb`, default `kg`).
- Canonical storage stays kg; conversion happens only at display/input boundaries (format weight for the selected unit, parse user entry back to kg).
- Plate calculator gains lb mode: 45 lb bar; plates 45/25/10/5/2.5 lb (+ remainder warning like kg mode).
- Exercised everywhere kg strings appear today (logging rows, metrics strip, plate calc, analytics, history).

**2.2 RPE UI** (DB column exists at `db.native.ts:104`; no UI)
- Per-set RPE stepper (1–10, exact values) beside the set-type badge in `ActiveWorkoutScreen`; persists via existing RPE plumbing; rendered in History drill-down.

**2.3 Folders as manageable entities** (`WorkoutScreen.tsx:83-86`, `types/index.ts:61-73`)
- Keep string-based `folderName` but add folder management in WorkoutScreen: rename folder (updates all routines sharing that name), delete folder (renames them to "No folder").
- Remove the dead `RoutineFolder` entity, `folderId`, `sortOrder` types.

### Part 3 — Feature completion

**3.1 Real JSON export** (`AnalyticsScreen.tsx:35-45`)
- Export composes `{ workouts, sets, routines, customExercises, settings, exportedAt, version }`; writes a file via `expo-file-system` and opens the system share sheet via `expo-sharing`. Error alert on failure. (Two new deps: `expo-file-system`, `expo-sharing`.)

**3.2 Functional "Repeat workout"** (`HistoryScreen.tsx:93-96`)
- Repeat rebuilds the workout from its routine template (exercises + target sets + rest timers) when the routine still exists; falls back to copying the logged exercise list if the routine was deleted. Starts the session immediately.

**3.3 Draft persistence** (`WorkoutContext.tsx`)
- Active workout auto-saves its current state (debounced, plus on `AppState` background) into the existing workouts/exercises/sets tables with `in_progress` set to 1 (reuses current insert paths; no duplicated schema).
- All History and Analytics reads filter `in_progress = 0` so drafts never surface as completed workouts.
- On finish, the row's `in_progress` is cleared instead of inserting again.
- On launch, if a draft exists, show "Resume session" — restores exercises/sets/timers with the start time rebased so elapsed stays correct. Force-close no longer loses a session.

### Part 4 — Hygiene

- Delete the dead `Platform.OS === 'web'` branches and `webStorage` inside `db.native.ts`; keep `db.web.ts` as the sole web implementation (compiles, demo-only).
- Dedupe repeated row→object mapping boilerplate (`db.native.ts:314-324, 344-353, 420-436, 725-743`) into shared mappers.
- Remove no-op `onStartActiveWorkout` props (`App.tsx:45,48`).
- Fix picker multi-select bar label ("Add … to Routine" even inside a workout) and the "Body Only" filter chip vs `body only` seed mismatch (`ExercisePickerModal.tsx:40-47`, `:337`).
- README/ROADMAP truthfulness pass: "Export ✅" / "RPE notes" claims must match code; ROADMAP updated to mark this pass's deliverables and keep the rest backlogged.

## Error Handling

- Every DB mutation path used by a screen goes through try/catch → `Alert` with action-specific message; no silent failures.
- Export and draft-restore have explicit failure states.

## Testing

- No test runner exists today (only `tsc --noEmit`). Add a light, out-of-runtime harness: extract pure logic — unit conversion, timer math (endsAt/elapsed), export JSON shaping, plate calculation, search — into `src/utils/*` and cover with `node --test` + `tsx` (dev dep). TDD per change: write the failing test, then the implementation.
- Typecheck (`npx tsc --noEmit`) must stay clean after every change.

## Success Criteria

- A workout's duration equals wall-clock time even with heavy typing, backgrounding, and screen-off.
- `2.5`, `12.`, `.5` typeable in every weight field.
- Export produces a complete, valid JSON backup via the share sheet.
- Repeat workout starts with the routine's exercises.
- Force-close mid-workout → relaunch offers Resume with correct elapsed time.
- RPE per set is set in the logger and visible in History.
- kg/lb toggle flips every display including plate calc; lb plates correct.
- Folders can be renamed/deleted from the UI.
- No README/ROADMAP claim contradicts code.
- `tsc --noEmit` clean; new pure-logic tests green.