# Lifts Parity Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Lifts workout tracker to production-quality parity with Lyfta's core UX by fixing the timer/input bugs, finishing the half-implemented features (export, RPE, folders, repeat, drafts, kg/lb), and making the README/ROADMAP truthful — in one sequenced plan.

**Architecture:** Work is sequenced by blast radius: foundational trust-blocker fixes first (timers, error handling, input), then schema-touching features (settings/units, RPE, folders), then feature completion (export, repeat, drafts), then hygiene. Every logic-heavy change has a pure-function core tested with `node --test` + `tsx`. Data stays canonical kg in SQLite; unit conversion happens only at display/input boundaries via `SettingsContext`. Draft persistence reuses the existing `workouts`/`workout_exercises`/`exercise_sets` tables with a new `in_progress` flag.

**Tech Stack:** React Native 0.86 / Expo SDK 57 / TypeScript 6 / expo-sqlite / lucide-react-native. Test runner: `node --test` via `tsx`. New runtime deps: `expo-file-system`, `expo-sharing`. New dev deps: `tsx`.

## Global Constraints

- Typecheck (`npx tsc --noEmit`) MUST stay clean after every task.
- Tests MUST exist and pass for every new pure function (units, timer math, export shaping).
- Database schema changes MUST be idempotent — existing installs must migrate without data loss.
- kg/lb toggle preserves canonical kg storage in the DB; conversion only at boundaries.
- Web build (db.web.ts) MUST keep compiling — mirror every new DB export signature with an in-memory implementation.
- No silent failures — all mutations that can fail MUST try/catch into user-facing `Alert`.
- `PRAGMA foreign_keys = ON` must be set on every SQLite connection.
- README/ROADMAP claims MUST match code (no vaporware checkboxes).

## File Structure

```
src/
├── types/index.ts                    # (modify) remove dead RoutineFolder/folderId/sortOrder
├── context/
│   ├── WorkoutContext.tsx            # (modify) wall-clock timers, pure updaters, draft autosave
│   └── SettingsContext.tsx           # (create) unit preference + load/save
├── database/
│   ├── db.ts                         # (keep) re-export
│   ├── db.native.ts                  # (modify) fk pragma, settings, getAllExercises, draft fns, ghost SQL, row mappers, hygiene
│   └── db.web.ts                     # (modify) mirror signatures for new exports
├── utils/
│   ├── calculator.ts                 # (modify) add lb plate sets
│   ├── search.ts                     # (modify) case-insensitive equipment match
│   ├── timer.ts                      # (create) computeElapsedSeconds, computeRemaining, rebaseStartTime
│   ├── units.ts                      # (create) WeightUnit, kgToDisplay, displayToKg, formatWeight
│   └── export.ts                     # (create) shapeBackup, buildBackupJson, exportBackup
├── components/
│   ├── WeightInput.tsx               # (create) decimal-safe weight input
│   ├── FolderManageModal.tsx         # (create) rename/delete folders
│   ├── DraftResumeBanner.tsx         # (create) resume/discard draft card
│   ├── ExercisePickerModal.tsx       # (modify) label fix, equipment case fix
│   ├── PlateCalculatorModal.tsx      # (modify) lb mode, reset-on-open, unit-aware display
│   └── ...                           # (unchanged)
├── screens/
│   ├── ActiveWorkoutScreen.tsx       # (modify) WeightInput, RPE badge, unit-aware labels, ghost fix
│   ├── HistoryScreen.tsx             # (modify) unit-aware, RPE pill, repeat logic, try/catch
│   ├── WorkoutScreen.tsx             # (modify) folder manage, try/catch, remove no-op prop
│   ├── AnalyticsScreen.tsx           # (modify) real export, unit-aware, try/catch
│   └── ExercisesScreen.tsx           # (modify) unit-aware stats modal
└── ...
App.tsx                               # (modify) SettingsProvider, DraftResumeBanner
tests/
└── unit/
    ├── timer.test.ts                 # (create)
    ├── units.test.ts                 # (create)
    └── export.test.ts                # (create)
docs/superpowers/plans/              # (keep) this file
docs/superpowers/specs/               # (keep) design spec
```

---

### Task 1: Test Harness + Timer Utilities

**Files:**
- Create: `tests/unit/timer.test.ts`
- Create: `src/utils/timer.ts`
- Modify: `package.json` (add `tsx` devDep + `test` script)
- Modify: `tsconfig.json` (exclude `tests` from RN build)

**Interfaces:**
- Produces: `computeElapsedSeconds(startTimeIso: string, now: number): number`
- Produces: `computeRemaining(endsAt: number, now: number): number`
- Produces: `rebaseStartTime(now: number, durationSeconds: number): string`

- [ ] **Step 1: Install test runner**

```bash
npm install --save-dev tsx
```

Expected: `package.json` gains `"tsx"` under `devDependencies`.

- [ ] **Step 2: Add test script to package.json**

Add to the `"scripts"` block:

```json
"test": "tsx --test tests/unit/*.test.ts"
```

- [ ] **Step 3: Exclude tests from TypeScript RN build**

In `tsconfig.json`, change the `exclude` line:

```json
"exclude": ["node_modules", "dist", "tests"]
```

- [ ] **Step 4: Write the failing timer tests**

Create `tests/unit/timer.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeElapsedSeconds, computeRemaining, rebaseStartTime } from '../../src/utils/timer';

describe('computeElapsedSeconds', () => {
  it('returns 0 when now equals startTime', () => {
    const start = new Date('2026-09-07T10:00:00Z').getTime();
    assert.equal(computeElapsedSeconds(new Date(start).toISOString(), start), 0);
  });

  it('computes integer seconds from wall clock', () => {
    const start = new Date('2026-09-07T10:00:00Z').getTime();
    const now = start + 45_000;
    assert.equal(computeElapsedSeconds(new Date(start).toISOString(), now), 45);
  });

  it('does not undercount under frequent re-renders (wall-clock based)', () => {
    const start = new Date('2026-09-07T10:00:00Z').getTime();
    const now = start + 127_000;
    assert.equal(computeElapsedSeconds(new Date(start).toISOString(), now), 127);
  });

  it('clamps negative drift to 0', () => {
    const start = new Date('2026-09-07T10:00:00Z').getTime();
    assert.equal(computeElapsedSeconds(new Date(start).toISOString(), start - 5_000), 0);
  });
});

describe('computeRemaining', () => {
  it('returns positive remainder before endsAt', () => {
    const now = Date.now();
    const endsAt = now + 90_000;
    assert.equal(computeRemaining(endsAt, now), 90);
  });

  it('returns 0 at or past endsAt', () => {
    const now = Date.now();
    assert.equal(computeRemaining(now, now), 0);
    assert.equal(computeRemaining(now - 1000, now), 0);
  });
});

describe('rebaseStartTime', () => {
  it('returns ISO string that is durationSeconds before now', () => {
    const now = new Date('2026-09-07T10:05:00Z').getTime();
    const rebased = rebaseStartTime(now, 300);
    assert.equal(new Date(rebased).getTime(), now - 300_000);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/utils/timer'`.

- [ ] **Step 6: Implement timer utilities**

Create `src/utils/timer.ts`:

```typescript
export function computeElapsedSeconds(startTimeIso: string, now: number): number {
  const start = new Date(startTimeIso).getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function computeRemaining(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function rebaseStartTime(now: number, durationSeconds: number): string {
  return new Date(now - durationSeconds * 1000).toISOString();
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test
```

Expected: all 7 tests PASS.

- [ ] **Step 8: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add tests/unit/timer.test.ts src/utils/timer.ts package.json package-lock.json tsconfig.json
git commit -m "chore: add test harness (tsx + node --test) and timer utilities"
```

---

### Task 2: Wall-Clock Workout Timer

**Files:**
- Modify: `src/context/WorkoutContext.tsx:42-69` (elapsed state + timer effect)
- Modify: `src/context/WorkoutContext.tsx:157-167` (startWorkout sets startTimeRef)
- Modify: `src/context/WorkoutContext.tsx:352-382` (finishWorkout uses wall-clock duration)

**Interfaces:**
- Consumes: `computeElapsedSeconds`, `rebaseStartTime` from Task 1
- Produces: `elapsedSeconds` — still exposed as `number` (unchanged public interface)
- Produces: `startTimeRef: MutableRefObject<string | null>` — internal ref, not exposed

- [ ] **Step 1: Write the failing test (behavioral — typecheck only)**

No new pure function here; the change is inside `WorkoutContext`. Verify the test harness still passes after refactoring.

```bash
npm test
```

Expected: existing tests still PASS.

- [ ] **Step 2: Add startTimeRef and rework the timer effect**

In `src/context/WorkoutContext.tsx`, add the import at the top:

```typescript
import { computeElapsedSeconds } from '../utils/timer';
```

After the existing `restTimerRef` (line 51), add:

```typescript
const startTimeRef = useRef<string | null>(null);
```

Replace the workout duration effect (lines 57–69) with:

```typescript
useEffect(() => {
  if (activeWorkout) {
    if (!startTimeRef.current) {
      startTimeRef.current = activeWorkout.startTime;
    }
    workoutTimerRef.current = setInterval(() => {
      setElapsedSeconds(computeElapsedSeconds(startTimeRef.current!, Date.now()));
    }, 1000);
  } else {
    startTimeRef.current = null;
    if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
    setElapsedSeconds(0);
  }
  return () => {
    if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
  };
}, [activeWorkout !== null]);
```

The key fix: the effect dependency is the boolean `activeWorkout !== null`, not the object. Keystrokes and set edits no longer tear down and restart the interval.

- [ ] **Step 3: Fix startWorkout to not reset startTimeRef on routine**

In `startWorkout` (line 157), the `startTime` is set to `new Date().toISOString()`. That value feeds the timer. No change needed to the state assignment — `startTimeRef` gets populated by the effect on first render. But clear `elapsedSeconds` to 0 at start (already done at line 166).

Verify the `startTime` is assigned before `setActiveWorkout`:

```typescript
const startTime = new Date().toISOString();
// ... exercises setup ...
setActiveWorkout({
  id: workoutId,
  name,
  routineId: routine ? routine.id : undefined,
  startTime,
  durationSeconds: 0,
  totalVolumeKg: 0,
  exercises,
});
```

Extract `startTime` to a local if not already done.

- [ ] **Step 4: Fix finishWorkout to use wall-clock duration**

Replace the `durationSeconds: elapsedSeconds` in `finishWorkout` (line 367) with:

```typescript
durationSeconds: startTimeRef.current
  ? Math.floor((Date.now() - new Date(startTimeRef.current).getTime()) / 1000)
  : elapsedSeconds,
```

- [ ] **Step 5: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 6: Manual verify on device**

Start a workout, type in weight inputs rapidly, verify elapsed timer keeps incrementing at 1s intervals and does not reset. Pocket the phone for 30s, bring it back, verify elapsed catches up. Finish workout, verify duration in history matches real elapsed time.

- [ ] **Step 7: Commit**

```bash
git add src/context/WorkoutContext.tsx
git commit -m "fix: wall-clock workout timer prevents drift under re-renders and backgrounding"
```

---

### Task 3: Wall-Clock Rest Timer + Pure Set Completion

**Files:**
- Modify: `src/context/WorkoutContext.tsx:8-12` (RestTimerState adds endsAt)
- Modify: `src/context/WorkoutContext.tsx:72-119` (rest timer effects + start/adjust/stop)
- Modify: `src/context/WorkoutContext.tsx:293-350` (toggleSetComplete — pure updater, haptics out)

**Interfaces:**
- Consumes: `computeRemaining` from Task 1
- Produces: `RestTimerState` — now includes `endsAt: number | null` (internal)
- Public interface unchanged: `restTimer.remainingSeconds`, `restTimer.totalSeconds`, `restTimer.isActive`

- [ ] **Step 1: Update RestTimerState type**

In `WorkoutContext.tsx`, change the interface (line 8–12):

```typescript
interface RestTimerState {
  isActive: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  endsAt: number | null;
}
```

Update the initial state (line 44):

```typescript
const [restTimer, setRestTimer] = useState<RestTimerState>({
  isActive: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  endsAt: null,
});
```

- [ ] **Step 2: Rewrite the rest timer effect to use wall-clock endsAt**

Replace the rest timer useEffect (lines 72–92) with:

```typescript
useEffect(() => {
  if (restTimer.isActive && restTimer.endsAt !== null) {
    const tick = () => {
      const now = Date.now();
      const remaining = computeRemaining(restTimer.endsAt!, now);
      if (remaining <= 0) {
        setRestTimer(prev => ({ ...prev, isActive: false, remainingSeconds: 0, endsAt: null }));
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        setRestTimer(prev => {
          if (prev.remainingSeconds === remaining) return prev;
          return { ...prev, remainingSeconds: remaining };
        });
      }
    };
    restTimerRef.current = setInterval(tick, 250);
    tick();
  } else {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
  }
  return () => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
  };
}, [restTimer.isActive, restTimer.endsAt]);
```

Key fix: effect depends on `endsAt` (stable per timer session), not `remainingSeconds`. Timer recomputes remaining from wall clock each 250ms tick. Haptic fires in the effect body, not inside a setState updater.

- [ ] **Step 3: Update startRestTimer, adjustRestTimer, stopRestTimer**

Replace `startRestTimer` (line 94):

```typescript
const startRestTimer = (seconds: number) => {
  if (seconds <= 0) return;
  setRestTimer({
    isActive: true,
    remainingSeconds: seconds,
    totalSeconds: seconds,
    endsAt: Date.now() + seconds * 1000,
  });
};
```

Replace `adjustRestTimer` (line 102):

```typescript
const adjustRestTimer = (deltaSeconds: number) => {
  setRestTimer(prev => {
    if (!prev.endsAt) return prev;
    const newEndsAt = prev.endsAt + deltaSeconds * 1000;
    const remaining = computeRemaining(newEndsAt, Date.now());
    return {
      ...prev,
      endsAt: newEndsAt,
      remainingSeconds: remaining,
      isActive: remaining > 0,
    };
  });
};
```

Replace `stopRestTimer` (line 113):

```typescript
const stopRestTimer = () => {
  setRestTimer({
    isActive: false,
    remainingSeconds: 0,
    totalSeconds: 0,
    endsAt: null,
  });
};
```

- [ ] **Step 4: Refactor toggleSetComplete to be a pure updater**

Replace `toggleSetComplete` (lines 293–350) with:

```typescript
const toggleSetComplete = (activeExerciseId: string, setId: string) => {
  const currentExercise = activeWorkout?.exercises.find(e => e.id === activeExerciseId);
  if (!currentExercise) return;

  const currentSet = currentExercise.sets.find(s => s.id === setId);
  if (!currentSet) return;

  const willBeCompleted = !currentSet.isCompleted;

  if (willBeCompleted) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if ((currentExercise.restTimerSeconds ?? 0) > 0) {
      startRestTimer(currentExercise.restTimerSeconds);
    }
  }

  const prevSetInSession = currentExercise.sets.length > 0
    ? (() => {
        const idx = currentExercise.sets.findIndex(s => s.id === setId);
        return idx > 0 ? currentExercise.sets[idx - 1] : null;
      })()
    : null;

  const finalWeight =
    currentSet.weightKg > 0
      ? currentSet.weightKg
      : (prevSetInSession?.weightKg || currentSet.previousWeightKg || 20);

  const finalReps =
    currentSet.reps > 0
      ? currentSet.reps
      : (prevSetInSession?.reps || currentSet.previousReps || 10);

  setActiveWorkout(prev => {
    if (!prev) return null;
    return {
      ...prev,
      exercises: prev.exercises.map(e => {
        if (e.id !== activeExerciseId) return e;
        return {
          ...e,
          sets: e.sets.map(s => {
            if (s.id !== setId) return s;
            return {
              ...s,
              weightKg: willBeCompleted ? finalWeight : s.weightKg,
              reps: willBeCompleted ? finalReps : s.reps,
              isCompleted: willBeCompleted,
              completedAt: willBeCompleted ? new Date().toISOString() : undefined,
            };
          }),
        };
      }),
    };
  });
};
```

Key fix: haptics and rest timer start happen OUTSIDE the setState updater. The updater itself is pure — reads all data from closure, writes only state. No side effects inside the updater function.

- [ ] **Step 5: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 6: Manual verify on device**

Complete a set — verify haptic fires exactly once. Verify rest timer countdown is smooth and accurate. Background the phone for the rest timer duration, bring it back — verify timer shows correct remaining or has already finished. Adjust rest timer by ±30s, verify remaining updates correctly.

- [ ] **Step 7: Commit**

```bash
git add src/context/WorkoutContext.tsx
git commit -m "fix: wall-clock rest timer with pure set completion updater"
```

---

### Task 4: Error-Safe Data Layer

**Files:**
- Modify: `src/database/db.native.ts:35-37` (add PRAGMA foreign_keys)
- Modify: `src/database/db.native.ts:679-694` (simplify deleteWorkout)
- Modify: `src/context/WorkoutContext.tsx:121-167` (startWorkout try/catch)
- Modify: `src/context/WorkoutContext.tsx:352-382` (finishWorkout try/catch)
- Modify: `src/screens/WorkoutScreen.tsx:45-62` (try/catch + Alert)
- Modify: `src/screens/HistoryScreen.tsx:74-96` (try/catch + Alert)

**Interfaces:**
- Consumes: existing db functions
- Produces: no new exports — wraps existing calls in error handling

- [ ] **Step 1: Enable foreign keys in db.native.ts**

In `initDatabase`, inside the `execAsync` call (line 35), add `PRAGMA foreign_keys = ON;` after the WAL line:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

- [ ] **Step 2: Simplify deleteWorkout (FK CASCADE now handles children)**

Replace `deleteWorkout` (lines 679–694) with:

```typescript
export async function deleteWorkout(workoutId: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync('DELETE FROM workouts WHERE id = ?', workoutId);
}
```

The CASCADE constraints on `workout_exercises` and `exercise_sets` handle child cleanup automatically.

- [ ] **Step 3: Add try/catch + Alert to WorkoutContext**

Add `Alert` to the react-native import at the top of `WorkoutContext.tsx`:

```typescript
import { Platform, Alert } from 'react-native';
```

Wrap `startWorkout` body in try/catch:

```typescript
const startWorkout = async (routine?: Routine, customName?: string) => {
  try {
    // ... existing body ...
  } catch (e) {
    Alert.alert('Error', 'Failed to start workout. Please try again.');
  }
};
```

Wrap `finishWorkout` body in try/catch — on error return `null`:

```typescript
const finishWorkout = async (): Promise<Workout | null> => {
  try {
    // ... existing body (with wall-clock duration from Task 2) ...
  } catch (e) {
    Alert.alert('Error', 'Failed to save workout. Your data may not have been saved.');
    return null;
  }
};
```

- [ ] **Step 4: Add try/catch + Alert to WorkoutScreen handlers**

In `WorkoutScreen.tsx`, wrap `handleStartEmpty`:

```typescript
const handleStartEmpty = async () => {
  try {
    await startWorkout(undefined, 'Empty Workout');
  } catch (e) {
    Alert.alert('Error', 'Failed to start workout.');
  }
};
```

Wrap `handleStartRoutine`:

```typescript
const handleStartRoutine = async (routine: Routine) => {
  try {
    await startWorkout(routine);
  } catch (e) {
    Alert.alert('Error', `Failed to start "${routine.name}".`);
  }
};
```

Wrap `handleDuplicateRoutine`:

```typescript
const handleDuplicateRoutine = async (routine: Routine) => {
  try {
    await duplicateRoutine(routine.id);
    loadRoutines();
  } catch (e) {
    Alert.alert('Error', 'Failed to duplicate routine.');
  }
};
```

Wrap the delete confirm callback:

```typescript
onPress: async () => {
  try {
    await deleteRoutine(routine.id);
    loadRoutines();
  } catch (e) {
    Alert.alert('Error', 'Failed to delete routine.');
  }
},
```

- [ ] **Step 5: Add try/catch + Alert to HistoryScreen handlers**

Wrap `handlePerformAgain`:

```typescript
const handlePerformAgain = async (item: WorkoutHistorySummary) => {
  try {
    await startWorkout(undefined, item.name);
  } catch (e) {
    Alert.alert('Error', 'Failed to start workout.');
  }
};
```

Wrap the delete confirm callback:

```typescript
onPress: async () => {
  try {
    await deleteWorkout(item.id);
    setExpandedId(null);
    loadHistory();
  } catch (e) {
    Alert.alert('Error', 'Failed to delete workout.');
  }
},
```

- [ ] **Step 6: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/database/db.native.ts src/context/WorkoutContext.tsx src/screens/WorkoutScreen.tsx src/screens/HistoryScreen.tsx
git commit -m "fix: enable foreign keys and add try/catch error handling across all mutations"
```

---

### Task 5: Units + Settings Table + SettingsContext

**Files:**
- Create: `src/utils/units.ts`
- Create: `src/context/SettingsContext.tsx`
- Create: `tests/unit/units.test.ts`
- Modify: `src/database/db.native.ts` (add `settings` table + `getSetting`/`setSetting`)
- Modify: `src/database/db.web.ts` (mirror `getSetting`/`setSetting` with in-memory map)

**Interfaces:**
- Produces: `WeightUnit = 'kg' | 'lb'`
- Produces: `KG_PER_LB = 0.453592`
- Produces: `kgToDisplay(weightKg: number, unit: WeightUnit): number`
- Produces: `displayToKg(displayValue: number, unit: WeightUnit): number`
- Produces: `formatWeight(weightKg: number, unit: WeightUnit): string` (e.g. "100 kg" or "220.5 lb")
- Produces: `getSetting(key: string): Promise<string | null>`
- Produces: `setSetting(key: string, value: string): Promise<void>`
- Produces: `SettingsContext` with `unit`, `setUnit`, `loading`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/units.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kgToDisplay, displayToKg, formatWeight, KG_PER_LB } from '../../src/utils/units';

describe('kgToDisplay', () => {
  it('returns kg unchanged', () => {
    assert.equal(kgToDisplay(100, 'kg'), 100);
    assert.equal(kgToDisplay(2.5, 'kg'), 2.5);
  });

  it('converts kg to lb', () => {
    assert.equal(kgToDisplay(100, 'lb'), Math.round(100 / KG_PER_LB * 10) / 10);
  });
});

describe('displayToKg', () => {
  it('returns kg unchanged', () => {
    assert.equal(displayToKg(100, 'kg'), 100);
  });

  it('converts lb to kg', () => {
    const result = displayToKg(220, 'lb');
    assert.ok(Math.abs(result - 99.79) < 0.1);
  });

  it('round-trips kg -> lb -> kg within 0.1', () => {
    const original = 80;
    const lb = kgToDisplay(original, 'lb');
    const back = displayToKg(lb, 'lb');
    assert.ok(Math.abs(back - original) < 0.1);
  });
});

describe('formatWeight', () => {
  it('formats kg', () => {
    assert.equal(formatWeight(100, 'kg'), '100 kg');
    assert.equal(formatWeight(2.5, 'kg'), '2.5 kg');
  });

  it('formats lb', () => {
    assert.equal(formatWeight(100, 'lb'), '220.5 lb');
  });

  it('formats zero', () => {
    assert.equal(formatWeight(0, 'kg'), '0 kg');
    assert.equal(formatWeight(0, 'lb'), '0 lb');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/utils/units'`.

- [ ] **Step 3: Implement units.ts**

Create `src/utils/units.ts`:

```typescript
export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.453592;

export function kgToDisplay(weightKg: number, unit: WeightUnit): number {
  if (unit === 'lb') {
    return Math.round((weightKg / KG_PER_LB) * 10) / 10;
  }
  return weightKg;
}

export function displayToKg(displayValue: number, unit: WeightUnit): number {
  if (unit === 'lb') {
    return Math.round(displayValue * KG_PER_LB * 100) / 100;
  }
  return displayValue;
}

export function formatWeight(weightKg: number, unit: WeightUnit): string {
  const display = kgToDisplay(weightKg, unit);
  const trimmed = Number.isInteger(display) ? display.toString() : display.toFixed(1).replace(/\.0$/, '');
  return `${trimmed} ${unit}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all unit tests PASS.

- [ ] **Step 5: Add settings table to db.native.ts**

In `initDatabase` `execAsync`, add after the `app_meta` table:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Add exports at the bottom of `db.native.ts`:

```typescript
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  if (!db) return null;
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    key,
    value
  );
}
```

- [ ] **Step 6: Mirror settings in db.web.ts**

Add at the top of `db.web.ts` after `webStorage`:

```typescript
const webSettings = new Map<string, string>();
```

Add exports at the bottom:

```typescript
export async function getSetting(key: string): Promise<string | null> {
  return webSettings.get(key) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  webSettings.set(key, value);
}
```

- [ ] **Step 7: Create SettingsContext**

Create `src/context/SettingsContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { WeightUnit } from '../utils/units';
import { getSetting, setSetting } from '../database/db';

interface SettingsContextType {
  unit: WeightUnit;
  setUnit: (unit: WeightUnit) => void;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  unit: 'kg',
  setUnit: () => {},
  loading: true,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unit, setUnitState] = useState<WeightUnit>('kg');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getSetting('unit');
      if (stored === 'kg' || stored === 'lb') {
        setUnitState(stored);
      }
      setLoading(false);
    })();
  }, []);

  const setUnit = useCallback((u: WeightUnit) => {
    setUnitState(u);
    setSetting('unit', u);
  }, []);

  return (
    <SettingsContext.Provider value={{ unit, setUnit, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
```

- [ ] **Step 8: Wire SettingsProvider into App.tsx**

In `App.tsx`, add import:

```typescript
import { SettingsProvider } from './src/context/SettingsContext';
```

Wrap `SettingsProvider` inside `WorkoutProvider` (line 167):

```tsx
<SettingsProvider>
  <WorkoutProvider>
    <MainAppContent />
  </WorkoutProvider>
</SettingsProvider>
```

- [ ] **Step 9: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/utils/units.ts src/context/SettingsContext.tsx src/database/db.native.ts src/database/db.web.ts App.tsx tests/unit/units.test.ts
git commit -m "feat: add kg/lb units infrastructure, settings table, and SettingsContext"
```

---

### Task 6: WeightInput Component + Decimal Fix + Plate Modal Reset

**Files:**
- Create: `src/components/WeightInput.tsx`
- Modify: `src/screens/ActiveWorkoutScreen.tsx:302-318` (replace weight TextInput with WeightInput)
- Modify: `src/components/PlateCalculatorModal.tsx:27-31` (reset state on open)

**Interfaces:**
- Consumes: `useSettings` from Task 5
- Produces: `WeightInput` component: `{ value: number, onCommit: (v: number) => void, placeholder?: string, completed?: boolean, style?: StyleProp<TextStyle> }`

- [ ] **Step 1: Create WeightInput component**

Create `src/components/WeightInput.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { TextInput, StyleProp, TextStyle, StyleSheet } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { kgToDisplay, displayToKg, WeightUnit } from '../utils/units';

interface Props {
  value: number;
  onCommit: (weightKg: number) => void;
  placeholder?: string;
  completed?: boolean;
  style?: StyleProp<TextStyle>;
}

export const WeightInput: React.FC<Props> = ({
  value,
  onCommit,
  placeholder,
  completed,
  style,
}) => {
  const { unit } = useSettings();
  const [rawText, setRawText] = useState<string | null>(null);

  const displayValue = value > 0 ? kgToDisplay(value, unit).toString() : '';
  const shownText = rawText !== null ? rawText : displayValue;

  useEffect(() => {
    setRawText(null);
  }, [value, unit]);

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      value={shownText}
      placeholder={placeholder || (unit === 'kg' ? '0' : '0')}
      placeholderTextColor="#6B7280"
      selectTextOnFocus
      onChangeText={setRawText}
      onBlur={() => {
        const parsed = rawText !== null ? (parseFloat(rawText) || 0) : value > 0 ? kgToDisplay(value, unit) : 0;
        onCommit(displayToKg(parsed, unit));
        setRawText(null);
      }}
      onSubmitEditing={() => {
        const parsed = rawText !== null ? (parseFloat(rawText) || 0) : value > 0 ? kgToDisplay(value, unit) : 0;
        onCommit(displayToKg(parsed, unit));
        setRawText(null);
      }}
    />
  );
};
```

- [ ] **Step 2: Replace weight input in ActiveWorkoutScreen**

In `ActiveWorkoutScreen.tsx`, add import:

```typescript
import { WeightInput } from '../components/WeightInput';
```

Replace the weight `TextInput` (lines 304–317) with:

```tsx
<WeightInput
  value={set.weightKg}
  onCommit={(w) => updateSet(activeEx.id, set.id, { weightKg: w })}
  placeholder={
    set.previousWeightKg
      ? kgToDisplay(set.previousWeightKg, unit).toString()
      : '0'
  }
  completed={set.isCompleted}
  style={[styles.cellInput, set.isCompleted && styles.inputCompleted]}
/>
```

Add `useSettings` import and call at the top of the component:

```typescript
import { useSettings } from '../context/SettingsContext';
import { kgToDisplay } from '../utils/units';

// Inside component:
const { unit } = useSettings();
```

- [ ] **Step 3: Fix PlateCalculatorModal stale state**

In `PlateCalculatorModal.tsx`, add a `useEffect` to reset state on open (after line 28):

```typescript
import { useEffect } from 'react';

// Inside component body, after useState declarations:
useEffect(() => {
  if (visible) {
    setTargetWeight(initialWeight.toString());
    setBarWeight(20);
  }
}, [visible, initialWeight]);
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 5: Manual verify on device**

Open active workout. Type "12." in weight field — dot must persist until blur. Type "2.5" — must show "2.5" and commit to 2.5 kg. Type ".5" — must commit to 0.5 kg. Open plate calculator from exercise card, change weight, close, reopen from another exercise — verify it resets to that exercise's weight.

- [ ] **Step 6: Commit**

```bash
git add src/components/WeightInput.tsx src/screens/ActiveWorkoutScreen.tsx src/components/PlateCalculatorModal.tsx
git commit -m "fix: decimal-safe weight input component and plate calculator state reset"
```

---

### Task 7: kg/lb Display Sweep

**Files:**
- Modify: `src/screens/ActiveWorkoutScreen.tsx` (volume, previous cell, header label, celebration)
- Modify: `src/screens/HistoryScreen.tsx` (summary volume, metric volume, set pills)
- Modify: `src/screens/AnalyticsScreen.tsx` (1RM inputs label, result, percentages, standards)
- Modify: `src/screens/ExercisesScreen.tsx` (stats modal weight values)
- Modify: `src/components/ActiveWorkoutMiniBar.tsx` (volume)

**Interfaces:**
- Consumes: `useSettings`, `formatWeight`, `kgToDisplay` from Task 5

- [ ] **Step 1: Add useSettings + formatWeight to ActiveWorkoutScreen**

Add imports (if not already present from Task 6):

```typescript
import { useSettings } from '../context/SettingsContext';
import { formatWeight, kgToDisplay } from '../utils/units';
```

Add at top of component:

```typescript
const { unit } = useSettings();
```

- [ ] **Step 2: Update ActiveWorkoutScreen metrics strip**

Line 184 — volume metric:

```tsx
<Text style={styles.metricValue}>{formatWeight(liveVolume, unit)}</Text>
```

Line 266 — column header "KG" → dynamic:

```tsx
<Text style={[styles.colHeader, { width: 84, textAlign: 'center' }]}>
  {unit.toUpperCase()}
</Text>
```

Line 295 — previous cell ghost text:

```tsx
<Text style={styles.previousText}>
  {kgToDisplay(set.previousWeightKg!, unit)} {unit} × {set.previousReps}
</Text>
```

Line 464 — celebration total volume:

```tsx
<Text style={styles.statBoxValue}>
  {formatWeight(completedSummary?.totalVolumeKg || 0, unit)}
</Text>
```

- [ ] **Step 3: Update HistoryScreen**

Add imports:

```typescript
import { useSettings } from '../context/SettingsContext';
import { formatWeight } from '../utils/units';
```

Add at top of component:

```typescript
const { unit } = useSettings();
```

Line 131 — all-time volume:

```tsx
<Text style={styles.summaryValue}>{formatWeight(totalVolume, unit)}</Text>
```

Line 192 — per-workout volume metric:

```tsx
<Text style={styles.metricText}>{formatWeight(item.totalVolumeKg, unit)}</Text>
```

Line 239 — set pill weight:

```tsx
<Text style={styles.detailSetWeight}>
  {formatWeight(s.weightKg, unit)} × {s.reps}
</Text>
```

- [ ] **Step 4: Update AnalyticsScreen**

Add imports:

```typescript
import { useSettings } from '../context/SettingsContext';
import { formatWeight, displayToKg, kgToDisplay } from '../utils/units';
```

Add at top of component:

```typescript
const { unit } = useSettings();
```

Line 81 — weight input label:

```tsx
<Text style={styles.inputLabel}>LIFTED WEIGHT ({unit.toUpperCase()})</Text>
```

Line 85 — weight input value (convert to display unit):

```tsx
value={unit === 'kg' ? weight : kgToDisplay(parseFloat(weight) || 0, unit).toString()}
```

Line 86 — onChangeText (convert back to kg for calculation):

```tsx
onChangeText={txt => setUnit === 'kg' ? setWeight(txt) : setWeight(displayToKg(parseFloat(txt) || 0, unit).toString())}
```

Actually simpler: keep `weight` state as raw display-unit string, convert to kg at calculation time. Rewrite the weight handling:

```typescript
const numWeight = displayToKg(parseFloat(weight) || 0, unit);
```

Line 106 — 1RM result:

```tsx
<Text style={styles.resultValue}>{formatWeight(oneRM.average, unit)}</Text>
```

Line 108 — formula line:

```tsx
<Text style={styles.resultFormula}>
  Epley: {kgToDisplay(oneRM.epley, unit)} {unit} • Brzycki: {kgToDisplay(oneRM.brzycki, unit)} {unit}
</Text>
```

Line 119 — percentage loads:

```tsx
<Text style={styles.pctValue}>{kgToDisplay(p.load, unit)} {unit}</Text>
```

Lines 156–168 — strength standards (keep kg reference, display both):

```tsx
<Text style={styles.standardValues}>
  Beg: {kgToDisplay(60, unit)} {unit} • Int: {kgToDisplay(100, unit)} {unit} • Adv: {kgToDisplay(135, unit)} {unit}
</Text>
```

Repeat for each standard row (Squat, Deadlift, OHP).

- [ ] **Step 5: Update ExercisesScreen stats modal**

In `ExercisesScreen.tsx`, add imports:

```typescript
import { useSettings } from '../context/SettingsContext';
import { formatWeight } from '../utils/units';
```

Add at top of component:

```typescript
const { unit } = useSettings();
```

Replace line 334 (heaviest lift):

```tsx
<Text style={styles.statBoxValue}>
  {exerciseStats.maxWeightKg > 0 ? formatWeight(exerciseStats.maxWeightKg, unit) : '—'}
</Text>
```

Replace line 340 (estimated 1RM):

```tsx
<Text style={styles.statBoxValue}>
  {exerciseStats.estimated1RM > 0 ? formatWeight(exerciseStats.estimated1RM, unit) : '—'}
</Text>
```

- [ ] **Step 6: Update ActiveWorkoutMiniBar volume**

In `ActiveWorkoutMiniBar.tsx`, add imports:

```typescript
import { useSettings } from '../context/SettingsContext';
import { formatWeight } from '../utils/units';
```

Add at top of component:

```typescript
const { unit } = useSettings();
```

Line 44:

```tsx
<Text style={styles.metricText}>{formatWeight(volume, unit)}</Text>
```

- [ ] **Step 7: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/ActiveWorkoutScreen.tsx src/screens/HistoryScreen.tsx src/screens/AnalyticsScreen.tsx src/screens/ExercisesScreen.tsx src/components/ActiveWorkoutMiniBar.tsx
git commit -m "feat: kg/lb unit display across all screens using SettingsContext"
```

---

### Task 8: Plate Calculator lb Mode

**Files:**
- Modify: `src/utils/calculator.ts` (add lb plate sets)
- Modify: `src/components/PlateCalculatorModal.tsx` (unit toggle, lb bar/plates, unit-aware display)

**Interfaces:**
- Consumes: `useSettings` from Task 5
- Produces: `calculatePlates` gains optional lb plate set

- [ ] **Step 1: Add lb plate sets to calculator.ts**

Add at top of `calculator.ts`:

```typescript
const LB_PLATES = [45, 25, 10, 5, 2.5];
const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
```

Update `calculatePlates` default:

```typescript
export function calculatePlates(
  targetWeight: number,
  barWeight: number = 20,
  availablePlates: number[] = KG_PLATES
): PlateCalculation {
```

- [ ] **Step 2: Add unit toggle to PlateCalculatorModal**

In `PlateCalculatorModal.tsx`, add imports:

```typescript
import { useSettings } from '../context/SettingsContext';
import { kgToDisplay, displayToKg } from '../utils/units';
import { KG_PER_LB } from '../utils/units';
```

Add at top of component:

```typescript
const { unit } = useSettings();
```

Add state for bar selection in the current unit:

```typescript
const KG_BARS = [20, 15, 10];
const LB_BARS = [45, 35, 15];
const bars = unit === 'kg' ? KG_BARS : LB_BARS;
const plates = unit === 'kg' ? KG_PLATES : LB_PLATES;
```

Update bar selector pills (line 86):

```tsx
{bars.map(w => (
```

Update `calculatePlates` call (line 31):

```typescript
const targetInUnit = unit === 'kg' ? numWeight : numWeight;
const barInUnit = barWeight;
const calc = calculatePlates(targetInUnit, barInUnit, plates);
```

Update "KG" label (line 78):

```tsx
<Text style={styles.unitText}>{unit.toUpperCase()}</Text>
```

Update plate color function for lb plates:

```typescript
const getPlateColor = (weight: number) => {
  if (unit === 'lb') {
    switch (weight) {
      case 45: return '#DC2626';
      case 25: return '#2563EB';
      case 10: return '#16A34A';
      case 5: return '#FFFFFF';
      case 2.5: return '#4B5563';
      default: return '#9333EA';
    }
  }
  // existing kg colors
  switch (weight) { ... }
};
```

Update bar weight pill labels to show unit:

```tsx
{w} {unit} {unit === 'kg' && w === 20 ? '(Olympic)' : unit === 'lb' && w === 45 ? '(Olympic)' : ''}
```

- [ ] **Step 3: Update onApply to convert back to kg**

Line 146:

```typescript
onApply(displayToKg(numWeight, unit));
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/calculator.ts src/components/PlateCalculatorModal.tsx
git commit -m "feat: plate calculator supports lb mode with unit-aware bars and plates"
```

---

### Task 9: Folders as Manageable Entities

**Files:**
- Create: `src/components/FolderManageModal.tsx`
- Modify: `src/database/db.native.ts` (add `renameFolder`, `deleteFolder`)
- Modify: `src/database/db.web.ts` (mirror `renameFolder`, `deleteFolder`)
- Modify: `src/screens/WorkoutScreen.tsx` (add manage button + modal)

**Interfaces:**
- Produces: `renameFolder(oldName: string, newName: string): Promise<void>`
- Produces: `deleteFolder(name: string): Promise<void>`
- Produces: `FolderManageModal` component: `{ visible: boolean, folders: string[], onClose: () => void, onFoldersChanged: () => void }`

- [ ] **Step 1: Add folder management functions to db.native.ts**

```typescript
export async function renameFolder(oldName: string, newName: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync('UPDATE routines SET folder_name = ? WHERE folder_name = ?', newName, oldName);
}

export async function deleteFolder(name: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync('UPDATE routines SET folder_name = NULL WHERE folder_name = ?', name);
}
```

- [ ] **Step 2: Mirror in db.web.ts**

```typescript
export async function renameFolder(oldName: string, newName: string): Promise<void> {
  for (const r of webStorage.routines) {
    if (r.folderName === oldName) r.folderName = newName;
  }
}

export async function deleteFolder(name: string): Promise<void> {
  for (const r of webStorage.routines) {
    if (r.folderName === name) r.folderName = undefined;
  }
}
```

- [ ] **Step 3: Create FolderManageModal**

Create `src/components/FolderManageModal.tsx`:

```typescript
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { X, Edit2, Trash2, Check } from 'lucide-react-native';
import { renameFolder, deleteFolder } from '../database/db';

interface Props {
  visible: boolean;
  folders: string[];
  onClose: () => void;
  onFoldersChanged: () => void;
}

export const FolderManageModal: React.FC<Props> = ({
  visible,
  folders,
  onClose,
  onFoldersChanged,
}) => {
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const handleRename = async (oldName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingFolder(null);
      return;
    }
    try {
      await renameFolder(oldName, newName.trim());
      onFoldersChanged();
    } catch (e) {
      Alert.alert('Error', 'Failed to rename folder.');
    }
    setEditingFolder(null);
    setNewName('');
  };

  const handleDelete = (name: string) => {
    Alert.alert(
      'Delete Folder',
      `Delete "${name}"? Routines will move to "No folder".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(name);
              onFoldersChanged();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete folder.');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Manage Folders</Text>
            <TouchableOpacity onPress={onClose}>
              <X color="#9CA3AF" size={22} />
            </TouchableOpacity>
          </View>

          {folders.length === 0 ? (
            <Text style={styles.emptyText}>No folders yet.</Text>
          ) : (
            folders.map(f => (
              <View key={f} style={styles.folderRow}>
                {editingFolder === f ? (
                  <>
                    <TextInput
                      style={styles.renameInput}
                      value={newName}
                      onChangeText={setNewName}
                      autoFocus
                      onSubmitEditing={() => handleRename(f)}
                    />
                    <TouchableOpacity onPress={() => handleRename(f)} style={styles.confirmBtn}>
                      <Check size={18} color="#10B981" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.folderName}>{f}</Text>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingFolder(f);
                          setNewName(f);
                        }}
                        style={styles.iconBtn}
                      >
                        <Edit2 size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(f)}
                        style={styles.iconBtn}
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ))
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  container: { backgroundColor: '#181A20', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#262A34' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  emptyText: { color: '#6B7280', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  folderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#262A34' },
  folderName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8, borderRadius: 8, backgroundColor: '#20242E' },
  renameInput: { flex: 1, backgroundColor: '#262A34', borderRadius: 8, color: '#FFFFFF', fontSize: 15, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  confirmBtn: { padding: 8, borderRadius: 8, backgroundColor: '#132E27' },
});
```

- [ ] **Step 4: Wire FolderManageModal into WorkoutScreen**

Add imports:

```typescript
import { FolderManageModal } from '../components/FolderManageModal';
import { Settings2 } from 'lucide-react-native';
```

Add state:

```typescript
const [showFolderManage, setShowFolderManage] = useState(false);
```

Add a "Manage" button next to the folder chips row (line 144, inside the conditional):

```tsx
<View style={styles.folderChipsHeader}>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderChipsContainer}>
    {folders.map(f => (
      // ... existing chips ...
    ))}
  </ScrollView>
  <TouchableOpacity onPress={() => setShowFolderManage(true)} style={styles.manageBtn}>
    <Settings2 size={16} color="#9CA3AF" />
  </TouchableOpacity>
</View>
```

Add styles:

```typescript
folderChipsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
manageBtn: { padding: 8, borderRadius: 8, backgroundColor: '#20242E', marginLeft: 8 },
```

Render modal at bottom of component (after RoutineEditorModal):

```tsx
<FolderManageModal
  visible={showFolderManage}
  folders={folders.filter(f => f !== 'All')}
  onClose={() => setShowFolderManage(false)}
  onFoldersChanged={() => {
    setShowFolderManage(false);
    loadRoutines();
  }}
/>
```

- [ ] **Step 5: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 6: Manual verify on device**

Create routines in different folders. Tap the manage (gear) icon. Rename a folder — verify all routines in that folder update. Delete a folder — verify routines move to "No folder".

- [ ] **Step 7: Commit**

```bash
git add src/components/FolderManageModal.tsx src/database/db.native.ts src/database/db.web.ts src/screens/WorkoutScreen.tsx
git commit -m "feat: folder rename/delete management in WorkoutScreen"
```

---

### Task 10: RPE UI (Cycle Badge + History Pill)

**Files:**
- Modify: `src/screens/ActiveWorkoutScreen.tsx:271-353` (add RPE cycle column to set row)
- Modify: `src/screens/HistoryScreen.tsx:235-245` (show RPE in detail pill)

**Interfaces:**
- Consumes: `updateSet` from WorkoutContext
- Uses existing: `WorkoutSet.rpe?: number`

- [ ] **Step 1: Add RPE cycle logic to ActiveWorkoutScreen**

Add helper function inside the component (after `getSetBadgeStyle`):

```typescript
const RPE_OPTIONS: (number | null)[] = [null, 5, 6, 7, 8, 9, 10];

const cycleRpe = (activeExerciseId: string, set: WorkoutSet) => {
  const currentIdx = RPE_OPTIONS.indexOf(set.rpe ?? null);
  const nextIdx = (currentIdx + 1) % RPE_OPTIONS.length;
  updateSet(activeExerciseId, set.id, { rpe: RPE_OPTIONS[nextIdx] ?? undefined });
};
```

- [ ] **Step 2: Add RPE column header**

In the table header (line 268), add before the "✓" column:

```tsx
<Text style={[styles.colHeader, { width: 44, textAlign: 'center' }]}>RPE</Text>
```

- [ ] **Step 3: Add RPE cycle badge to set row**

Inside the set row, before the checkmark `TouchableOpacity` (line 337), add:

```tsx
<TouchableOpacity
  style={styles.rpeBadge}
  onPress={() => cycleRpe(activeEx.id, set)}
  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
>
  <Text style={styles.rpeBadgeText}>
    {set.rpe != null ? set.rpe.toString() : '–'}
  </Text>
</TouchableOpacity>
```

- [ ] **Step 4: Add RPE badge styles**

Add to the `styles` object:

```typescript
rpeBadge: {
  width: 38,
  height: 38,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#1E232E',
  borderWidth: 1,
  borderColor: '#374151',
  marginRight: 4,
},
rpeBadgeText: {
  color: '#9CA3AF',
  fontSize: 12,
  fontWeight: '700',
},
```

- [ ] **Step 5: Show RPE in History drill-down**

In `HistoryScreen.tsx`, inside the `detailSetPill` (line 236–243), add after the set type text:

```tsx
{s.rpe != null && (
  <Text style={styles.detailRpe}>RPE {s.rpe}</Text>
)}
```

Add style:

```typescript
detailRpe: {
  color: '#A855F7',
  fontSize: 10,
  fontWeight: '700',
},
```

- [ ] **Step 6: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 7: Manual verify on device**

Log sets, tap RPE badge — cycles through –, 5, 6, 7, 8, 9, 10, –. Finish workout, view in History drill-down — RPE shown in set pills when set.

- [ ] **Step 8: Commit**

```bash
git add src/screens/ActiveWorkoutScreen.tsx src/screens/HistoryScreen.tsx
git commit -m "feat: per-set RPE cycle badge in logger and RPE display in history"
```

---

### Task 11: Ghost Prefill Scoping

**Files:**
- Modify: `src/database/db.native.ts:643-677` (rewrite getPreviousSetsForExercise SQL)
- Modify: `src/database/db.web.ts:205-213` (rewrite web implementation)

**Interfaces:**
- Produces: `getPreviousSetsForExercise(exerciseId: string)` — now returns sets from the most recent completed session containing that exercise, ordered by set_number

- [ ] **Step 1: Rewrite native SQL**

Replace `getPreviousSetsForExercise` in `db.native.ts` (lines 643–677):

```typescript
export async function getPreviousSetsForExercise(exerciseId: string): Promise<WorkoutSet[]> {
  if (Platform.OS === 'web') {
    return getPreviousSetsForExerciseWeb(exerciseId);
  }

  const db = await getDatabase();
  if (!db) return [];

  const rows = await db.getAllAsync<any>(
    `SELECT s.*
     FROM exercise_sets s
     JOIN workout_exercises we ON s.workout_exercise_id = we.id
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.exercise_id = ?
       AND s.is_completed = 1
       AND w.id = (
         SELECT w2.id FROM workouts w2
         JOIN workout_exercises we2 ON we2.workout_id = w2.id
         WHERE we2.exercise_id = ?
         ORDER BY w2.start_time DESC
         LIMIT 1
       )
     ORDER BY s.set_number ASC`,
    exerciseId,
    exerciseId
  );

  return rows.map(r => ({
    id: r.id,
    setNumber: r.set_number,
    type: r.set_type as any,
    weightKg: r.weight_kg,
    reps: r.reps,
    rpe: r.rpe,
    isCompleted: true,
  }));
}
```

- [ ] **Step 2: Rewrite web implementation**

Replace `getPreviousSetsForExercise` in `db.web.ts` (lines 205–213):

```typescript
export async function getPreviousSetsForExercise(exerciseId: string): Promise<WorkoutSet[]> {
  const sorted = [...webStorage.workouts].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
  for (const w of sorted) {
    const found = w.exercises.find(e => e.exerciseId === exerciseId);
    if (found) {
      return found.sets.filter(s => s.isCompleted).sort((a, b) => a.setNumber - b.setNumber);
    }
  }
  return [];
}
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 4: Manual verify on device**

Log a bench press workout with 3 sets at 60/65/70 kg. Log a different workout (squat). Start a new bench press workout — ghost should show 60/65/70 from the first bench session, not sets from the squat session.

- [ ] **Step 5: Commit**

```bash
git add src/database/db.native.ts src/database/db.web.ts
git commit -m "fix: ghost prefill scoped to most recent session containing the exercise"
```

---

### Task 12: Real JSON Export

**Files:**
- Create: `src/utils/export.ts`
- Create: `tests/unit/export.test.ts`
- Modify: `src/database/db.native.ts` (add `getAllExercises`)
- Modify: `src/database/db.web.ts` (mirror `getAllExercises`)
- Modify: `src/screens/AnalyticsScreen.tsx:35-45` (wire real export)
- Modify: `package.json` (add `expo-file-system`, `expo-sharing`)

**Interfaces:**
- Consumes: `getWorkoutHistory`, `getWorkoutDetail`, `getRoutines`, `getAllExercises` from db
- Produces: `shapeBackup(...)` — pure function
- Produces: `buildBackupJson(): Promise<string>` — calls db
- Produces: `exportBackup(): Promise<void>` — writes file + share sheet

- [ ] **Step 1: Install export dependencies**

```bash
npx expo install expo-file-system expo-sharing
```

- [ ] **Step 2: Add getAllExercises to db.native.ts**

```typescript
export async function getAllExercises(): Promise<Exercise[]> {
  const db = await getDatabase();
  if (!db) return [];
  const rows = await db.getAllAsync<any>('SELECT * FROM exercises ORDER BY name ASC');
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    equipment: r.equipment,
    primaryMuscles: JSON.parse(r.primary_muscles || '[]'),
    secondaryMuscles: JSON.parse(r.secondary_muscles || '[]'),
    instructions: JSON.parse(r.instructions || '[]'),
    isCustom: Boolean(r.is_custom),
  }));
}
```

- [ ] **Step 3: Mirror in db.web.ts**

```typescript
export async function getAllExercises(): Promise<Exercise[]> {
  return webStorage.exercises;
}
```

- [ ] **Step 4: Write the failing export test**

Create `tests/unit/export.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shapeBackup } from '../../src/utils/export';

describe('shapeBackup', () => {
  it('produces valid JSON structure', () => {
    const result = shapeBackup(
      [{ id: 'w1', name: 'Push', startTime: '2026-01-01T00:00:00Z', durationSeconds: 3600, totalVolumeKg: 5000, totalSets: 12, exerciseNames: ['Bench'], endTime: '2026-01-01T01:00:00Z' }],
      [],
      [],
      { unit: 'kg' }
    );
    const parsed = JSON.parse(result);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.workouts.length, 1);
    assert.equal(parsed.settings.unit, 'kg');
    assert.ok(parsed.exportedAt);
  });

  it('handles empty data', () => {
    const result = shapeBackup([], [], [], {});
    const parsed = JSON.parse(result);
    assert.equal(parsed.workouts.length, 0);
    assert.equal(parsed.routines.length, 0);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/utils/export'`.

- [ ] **Step 6: Implement export.ts**

Create `src/utils/export.ts`:

```typescript
import { Platform } from 'react-native';
import { WorkoutHistorySummary, Routine, Exercise } from '../types';
import { getWorkoutHistory, getRoutines, getAllExercises, getSetting } from '../database/db';

export interface BackupData {
  version: number;
  exportedAt: string;
  workouts: WorkoutHistorySummary[];
  routines: Routine[];
  exercises: Exercise[];
  settings: Record<string, string>;
}

export function shapeBackup(
  workouts: WorkoutHistorySummary[],
  routines: Routine[],
  exercises: Exercise[],
  settings: Record<string, string>
): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts,
    routines,
    exercises,
    settings,
  }, null, 2);
}

export async function buildBackupJson(): Promise<string> {
  const workouts = await getWorkoutHistory();
  const routines = await getRoutines();
  const exercises = await getAllExercises();
  const unit = await getSetting('unit') || 'kg';
  return shapeBackup(workouts, routines, exercises.filter(e => e.isCustom), { unit });
}

export async function exportBackup(): Promise<void> {
  const json = await buildBackupJson();
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifts-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const uri = FileSystem.documentDirectory + `lifts-backup-${new Date().toISOString().slice(0, 10)}.json`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri);
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test
```

Expected: all export tests PASS.

- [ ] **Step 8: Wire real export into AnalyticsScreen**

Replace `handleExportData` in `AnalyticsScreen.tsx`:

```typescript
import { exportBackup } from '../utils/export';

const handleExportData = async () => {
  try {
    await exportBackup();
    Alert.alert('Export Complete', 'Your workout data has been exported.');
  } catch (e) {
    Alert.alert('Export Error', 'Failed to export data. Please try again.');
  }
};
```

- [ ] **Step 9: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/utils/export.ts tests/unit/export.test.ts src/database/db.native.ts src/database/db.web.ts src/screens/AnalyticsScreen.tsx package.json package-lock.json
git commit -m "feat: real JSON export with file share sheet"
```

---

### Task 13: Functional Repeat Workout

**Files:**
- Modify: `src/database/db.native.ts` (add `getRoutineById`)
- Modify: `src/database/db.web.ts` (mirror `getRoutineById`)
- Modify: `src/screens/HistoryScreen.tsx:93-96` (rewrite handlePerformAgain)

**Interfaces:**
- Consumes: `getWorkoutDetail`, `getRoutineById`, `startWorkout`
- Produces: `getRoutineById(id: string): Promise<Routine | null>`

- [ ] **Step 1: Add getRoutineById to db.native.ts**

```typescript
export async function getRoutineById(id: string): Promise<Routine | null> {
  const db = await getDatabase();
  if (!db) return null;
  const r = await db.getFirstAsync<any>('SELECT * FROM routines WHERE id = ?', id);
  if (!r) return null;
  const reRows = await db.getAllAsync<any>(
    `SELECT re.*, e.name as ex_name, e.category as ex_category, e.equipment as ex_equipment,
            e.primary_muscles as ex_primary, e.secondary_muscles as ex_secondary, e.instructions as ex_inst
     FROM routine_exercises re
     JOIN exercises e ON re.exercise_id = e.id
     WHERE re.routine_id = ?
     ORDER BY re.order_index ASC`,
    r.id
  );
  return {
    id: r.id,
    name: r.name,
    folderName: r.folder_name,
    notes: r.notes,
    createdAt: r.created_at,
    lastPerformedAt: r.last_performed_at,
    exercises: reRows.map(row => ({
      id: row.id,
      exerciseId: row.exercise_id,
      exercise: {
        id: row.exercise_id,
        name: row.ex_name,
        category: row.ex_category,
        equipment: row.ex_equipment,
        primaryMuscles: JSON.parse(row.ex_primary || '[]'),
        secondaryMuscles: JSON.parse(row.ex_secondary || '[]'),
        instructions: JSON.parse(row.ex_inst || '[]'),
      },
      orderIndex: row.order_index,
      targetSets: row.target_sets,
      targetReps: row.target_reps,
      restTimerSeconds: row.rest_timer_seconds,
    })),
  };
}
```

- [ ] **Step 2: Mirror in db.web.ts**

```typescript
export async function getRoutineById(id: string): Promise<Routine | null> {
  return webStorage.routines.find(r => r.id === id) || null;
}
```

- [ ] **Step 3: Rewrite handlePerformAgain in HistoryScreen**

Add imports:

```typescript
import { getWorkoutDetail, getRoutineById } from '../database/db';
import { Routine, RoutineExercise } from '../types';
```

Replace `handlePerformAgain`:

```typescript
const handlePerformAgain = async (item: WorkoutHistorySummary) => {
  try {
    let routine: Routine | undefined;

    if (item.routineId) {
      const found = await getRoutineById(item.routineId);
      if (found) {
        routine = found;
      }
    }

    if (!routine) {
      const detail = await getWorkoutDetail(item.id);
      if (detail && detail.exercises.length > 0) {
        routine = {
          id: '',
          name: item.name,
          createdAt: new Date().toISOString(),
          exercises: detail.exercises.map((ex, idx) => ({
            id: `synth-${idx}`,
            exerciseId: ex.exerciseId,
            exercise: ex.exercise,
            orderIndex: idx,
            targetSets: ex.sets.length || 3,
            targetReps: String(ex.sets[0]?.reps || 10),
            restTimerSeconds: ex.restTimerSeconds ?? 90,
          })),
        };
      }
    }

    await startWorkout(routine, item.name);
  } catch (e) {
    Alert.alert('Error', 'Failed to start workout.');
  }
};
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 5: Manual verify on device**

Log a workout from a routine. Go to History, tap "Repeat" — verify the new session starts with all exercises, target sets, and rest timers from the routine. Delete the routine, repeat again — verify it starts with the logged exercises from the history entry.

- [ ] **Step 6: Commit**

```bash
git add src/database/db.native.ts src/database/db.web.ts src/screens/HistoryScreen.tsx
git commit -m "feat: repeat workout rebuilds from routine or logged exercises"
```

---

### Task 14: Draft Persistence + Resume Banner

**Files:**
- Modify: `src/database/db.native.ts` (add `in_progress` column, `saveWorkoutDraft`, `getWorkoutDraft`, `discardWorkoutDraft`; update `getWorkoutHistory`/`getWorkoutDetail`/ghost query to filter `in_progress = 0`)
- Modify: `src/database/db.web.ts` (mirror draft fns with in-memory tracking)
- Modify: `src/context/WorkoutContext.tsx` (autosave, AppState, resumeDraft, draftAvailable)
- Create: `src/components/DraftResumeBanner.tsx`
- Modify: `App.tsx` (render DraftResumeBanner)

**Interfaces:**
- Produces: `saveWorkoutDraft(workout: Workout): Promise<void>`
- Produces: `getWorkoutDraft(): Promise<Workout | null>`
- Produces: `discardWorkoutDraft(id: string): Promise<void>`
- Produces: `WorkoutContextType.draftAvailable: Workout | null`
- Produces: `WorkoutContextType.resumeDraft(): void`
- Produces: `WorkoutContextType.discardDraft(): void`

- [ ] **Step 1: Add in_progress column migration to db.native.ts**

After the `execAsync` block in `initDatabase`, add schema migration:

```typescript
try {
  await db.execAsync('ALTER TABLE workouts ADD COLUMN in_progress INTEGER DEFAULT 0');
} catch (_) {
  // Column already exists — safe to ignore
}
```

- [ ] **Step 2: Update getWorkoutHistory to exclude drafts**

In the `getWorkoutHistory` SQL (line 617), add `WHERE w.in_progress = 0`:

```sql
SELECT w.*, ...
FROM workouts w
LEFT JOIN workout_exercises we ON w.id = we.workout_id
LEFT JOIN exercises e ON we.exercise_id = e.id
LEFT JOIN exercise_sets s ON we.id = s.workout_exercise_id AND s.is_completed = 1
WHERE w.in_progress = 0
GROUP BY w.id
ORDER BY w.start_time DESC
```

- [ ] **Step 3: Update getWorkoutDetail to exclude drafts**

In `getWorkoutDetail` (line 700), add filter:

```sql
SELECT * FROM workouts WHERE id = ? AND in_progress = 0
```

- [ ] **Step 4: Update ghost query to exclude drafts**

In `getPreviousSetsForExercise` (the subquery from Task 11), add `AND w2.in_progress = 0`:

```sql
SELECT w2.id FROM workouts w2
JOIN workout_exercises we2 ON we2.workout_id = w2.id
WHERE we2.exercise_id = ? AND w2.in_progress = 0
ORDER BY w2.start_time DESC
LIMIT 1
```

- [ ] **Step 5: Add draft functions to db.native.ts**

```typescript
export async function saveWorkoutDraft(workout: Workout): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO workouts (id, routine_id, name, start_time, duration_seconds, total_volume_kg, notes, in_progress)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      workout.id,
      workout.routineId || null,
      workout.name,
      workout.startTime,
      workout.durationSeconds,
      workout.totalVolumeKg,
      workout.notes || null
    );

    await db.runAsync('DELETE FROM workout_exercises WHERE workout_id = ?', workout.id);

    let exOrder = 0;
    for (const ex of workout.exercises) {
      const weId = `we-${workout.id}-${exOrder}`;
      await db.runAsync(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, notes, rest_timer_seconds)
         VALUES (?, ?, ?, ?, ?, ?)`,
        weId, workout.id, ex.exerciseId, exOrder, ex.notes || null, ex.restTimerSeconds ?? 0
      );

      for (const s of ex.sets) {
        await db.runAsync(
          `INSERT OR REPLACE INTO exercise_sets (id, workout_exercise_id, set_number, set_type, weight_kg, reps, rpe, is_completed, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          s.id || `set-${weId}-${s.setNumber}`,
          weId, s.setNumber, s.type, s.weightKg, s.reps, s.rpe || null,
          s.isCompleted ? 1 : 0,
          s.completedAt || null
        );
      }
      exOrder++;
    }
  });
}

export async function getWorkoutDraft(): Promise<Workout | null> {
  const db = await getDatabase();
  if (!db) return null;
  const w = await db.getFirstAsync<any>('SELECT * FROM workouts WHERE in_progress = 1 ORDER BY start_time DESC LIMIT 1');
  if (!w) return null;

  const weRows = await db.getAllAsync<any>(
    `SELECT we.*, e.name as ex_name, e.category as ex_cat, e.equipment as ex_equip,
            e.primary_muscles as ex_pm, e.secondary_muscles as ex_sm, e.instructions as ex_inst
     FROM workout_exercises we
     JOIN exercises e ON we.exercise_id = e.id
     WHERE we.workout_id = ?
     ORDER BY we.order_index ASC`,
    w.id
  );

  const exercises: ActiveExercise[] = [];
  for (const we of weRows) {
    const sRows = await db.getAllAsync<any>(
      'SELECT * FROM exercise_sets WHERE workout_exercise_id = ? ORDER BY set_number ASC',
      we.id
    );
    exercises.push({
      id: we.id,
      exerciseId: we.exercise_id,
      notes: we.notes,
      restTimerSeconds: we.rest_timer_seconds ?? 0,
      exercise: {
        id: we.exercise_id,
        name: we.ex_name,
        category: we.ex_cat,
        equipment: we.ex_equip,
        primaryMuscles: JSON.parse(we.ex_pm || '[]'),
        secondaryMuscles: JSON.parse(we.ex_sm || '[]'),
        instructions: JSON.parse(we.ex_inst || '[]'),
      },
      sets: sRows.map(s => ({
        id: s.id,
        setNumber: s.set_number,
        type: s.set_type as any,
        weightKg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe,
        isCompleted: Boolean(s.is_completed),
        completedAt: s.completed_at,
      })),
    });
  }

  return {
    id: w.id,
    name: w.name,
    routineId: w.routine_id,
    startTime: w.start_time,
    durationSeconds: w.duration_seconds || 0,
    totalVolumeKg: w.total_volume_kg || 0,
    exercises,
    notes: w.notes,
  };
}

export async function discardWorkoutDraft(id: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync('DELETE FROM workouts WHERE id = ?', id);
}
```

- [ ] **Step 6: Mirror draft functions in db.web.ts**

```typescript
let webDraft: Workout | null = null;

export async function saveWorkoutDraft(workout: Workout): Promise<void> {
  webDraft = workout;
}

export async function getWorkoutDraft(): Promise<Workout | null> {
  return webDraft;
}

export async function discardWorkoutDraft(id: string): Promise<void> {
  if (webDraft?.id === id) webDraft = null;
}
```

- [ ] **Step 7: Add draft state and autosave to WorkoutContext**

Add imports:

```typescript
import { AppState, AppStateStatus } from 'react-native';
import { rebaseStartTime } from '../utils/timer';
import { saveWorkoutDraft, getWorkoutDraft, discardWorkoutDraft, saveCompletedWorkout } from '../database/db';
```

Add state after existing state declarations:

```typescript
const [draftAvailable, setDraftAvailable] = useState<Workout | null>(null);
const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add draft load effect:

```typescript
useEffect(() => {
  (async () => {
    const draft = await getWorkoutDraft();
    setDraftAvailable(draft);
  })();
}, []);
```

Add autosave effect (saves activeWorkout to draft on change, debounced 3s):

```typescript
useEffect(() => {
  if (activeWorkout) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveWorkoutDraft(activeWorkout);
      } catch (e) {
        console.error('Draft autosave failed:', e);
      }
    }, 3000);
  }
  return () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  };
}, [activeWorkout]);
```

Add AppState listener for immediate draft save on background:

```typescript
useEffect(() => {
  const handler = (state: AppStateStatus) => {
    if (state === 'background' && activeWorkout) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveWorkoutDraft(activeWorkout).catch(console.error);
    }
  };
  const sub = AppState.addEventListener('change', handler);
  return () => sub.remove();
}, [activeWorkout]);
```

Add resumeDraft and discardDraft:

```typescript
const resumeDraft = () => {
  if (!draftAvailable) return;
  const now = Date.now();
  const rebased = {
    ...draftAvailable,
    startTime: rebaseStartTime(now, draftAvailable.durationSeconds),
  };
  startTimeRef.current = rebased.startTime;
  setActiveWorkout(rebased);
  setElapsedSeconds(draftAvailable.durationSeconds);
  setDraftAvailable(null);
};

const discardDraft = async () => {
  if (!draftAvailable) return;
  try {
    await discardWorkoutDraft(draftAvailable.id);
  } catch (e) {
    console.error('Draft discard failed:', e);
  }
  setDraftAvailable(null);
};
```

Update `finishWorkout` to clear pending save and remove draft flag:

```typescript
if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// ... existing saveCompletedWorkout call replaces the draft row (same id, in_progress=0) ...
setDraftAvailable(null);
```

Update `cancelWorkout` to delete draft:

```typescript
const cancelWorkout = () => {
  if (activeWorkout) {
    discardWorkoutDraft(activeWorkout.id).catch(console.error);
  }
  setActiveWorkout(null);
  setIsMinimized(false);
  stopRestTimer();
};
```

Add to context value:

```typescript
draftAvailable,
resumeDraft,
discardDraft,
```

Add to `WorkoutContextType` interface:

```typescript
draftAvailable: Workout | null;
resumeDraft: () => void;
discardDraft: () => void;
```

- [ ] **Step 8: Create DraftResumeBanner component**

Create `src/components/DraftResumeBanner.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Play, Trash2 } from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { formatDuration } from '../utils/calculator';

export const DraftResumeBanner: React.FC = () => {
  const { draftAvailable, resumeDraft, discardDraft, isWorkingOut } = useWorkout();

  if (!draftAvailable || isWorkingOut) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.bannerInfo}>
        <Text style={styles.bannerTitle}>Unfinished Workout</Text>
        <Text style={styles.bannerSub}>
          {draftAvailable.name} • {formatDuration(draftAvailable.durationSeconds)}
        </Text>
      </View>
      <View style={styles.bannerActions}>
        <TouchableOpacity style={styles.discardBtn} onPress={discardDraft}>
          <Trash2 size={14} color="#EF4444" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.resumeBtn} onPress={resumeDraft}>
          <Play size={14} color="#000" fill="#000" />
          <Text style={styles.resumeBtnText}>Resume</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E232E',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D3442',
  },
  bannerInfo: { flex: 1, marginRight: 12 },
  bannerTitle: { color: '#F59E0B', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  bannerSub: { color: '#9CA3AF', fontSize: 12 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discardBtn: { padding: 8, borderRadius: 8, backgroundColor: '#2A171B' },
  resumeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  resumeBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 9: Render banner in App.tsx**

Add import:

```typescript
import { DraftResumeBanner } from './src/components/DraftResumeBanner';
```

Render inside `screenContent` View (line 43), before the tab renders:

```tsx
<DraftResumeBanner />
```

- [ ] **Step 10: Run typecheck and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 11: Manual verify on device**

Start a workout, log 2 sets, force-close the app (swipe away). Reopen — verify "Unfinished Workout" banner appears. Tap Resume — verify exercises, sets, and elapsed time are restored. Tap Discard — verify banner disappears. Start a new workout, finish normally — verify no draft banner on next launch.

- [ ] **Step 12: Commit**

```bash
git add src/database/db.native.ts src/database/db.web.ts src/context/WorkoutContext.tsx src/components/DraftResumeBanner.tsx App.tsx
git commit -m "feat: active workout draft persistence with resume/discard on launch"
```

---

### Task 15: Hygiene + Final Verification

**Files:**
- Modify: `src/database/db.native.ts` (remove dead Platform.OS web branches, webStorage, initWebStorage, dedupe row mappers)
- Modify: `src/types/index.ts` (remove dead RoutineFolder/folderId/sortOrder)
- Modify: `src/screens/WorkoutScreen.tsx` (remove unused `onStartActiveWorkout` prop)
- Modify: `src/screens/HistoryScreen.tsx` (remove unused `onStartActiveWorkout` prop)
- Modify: `App.tsx` (remove `onStartActiveWorkout={() => {}}` props)
- Modify: `src/components/ExercisePickerModal.tsx:40-47,337` (fix "Body Only" case, neutralize label)
- Modify: `src/utils/search.ts` (case-insensitive equipment match)
- Modify: `README.md` (truthfulness pass)
- Modify: `ROADMAP.md` (mark completed items, fix lies)

**Interfaces:**
- No new exports — cleanup only

- [ ] **Step 1: Remove dead Platform.OS web branches from db.native.ts**

Delete the `webStorage` object (lines 10–14), the `initWebStorage` function (lines 249–303), and every `if (Platform.OS === 'web')` block throughout the file. Remove the `Platform` import if no longer needed (keep it if `saveWorkoutDraft` or export uses it).

After removal, every function should follow the pattern:

```typescript
const db = await getDatabase();
if (!db) return /* default */;
// ... native logic ...
```

Also remove the `Platform` import at the top if unused.

- [ ] **Step 2: Dedupe row mappers in db.native.ts**

Add helper functions near the top (after imports):

```typescript
function mapExerciseRow(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    equipment: r.equipment,
    primaryMuscles: JSON.parse(r.primary_muscles || '[]'),
    secondaryMuscles: JSON.parse(r.secondary_muscles || '[]'),
    instructions: JSON.parse(r.instructions || '[]'),
    isCustom: Boolean(r.is_custom),
  };
}

function mapSetRow(s: any): WorkoutSet {
  return {
    id: s.id,
    setNumber: s.set_number,
    type: s.set_type as any,
    weightKg: s.weight_kg,
    reps: s.reps,
    rpe: s.rpe,
    isCompleted: Boolean(s.is_completed),
    completedAt: s.completed_at,
  };
}
```

Replace inline mapping objects in `searchExercises`, `getExerciseById`, `getRoutines`, `getWorkoutDetail`, `getWorkoutDraft`, `getPreviousSetsForExercise`, `getAllExercises` with calls to these helpers.

- [ ] **Step 3: Remove dead types from types/index.ts**

Delete the `RoutineFolder` interface (lines 69–73). Remove `folderId` from `Routine` (line 61). Keep `folderName` (still used).

- [ ] **Step 4: Remove unused onStartActiveWorkout prop**

In `WorkoutScreen.tsx`, remove `onStartActiveWorkout` from the component props type and destructuring. In `HistoryScreen.tsx`, same. In `App.tsx`, remove `onStartActiveWorkout={() => {}}` from both component usages.

- [ ] **Step 5: Fix ExercisePickerModal equipment case + label**

Line 46 — change `'Body Only'` to `'Body Only'` but make search case-insensitive. In `src/utils/search.ts`, find the equipment filter comparison and make it case-insensitive:

```typescript
if (equipment && equipment !== 'All') {
  filtered = filtered.filter(e =>
    e.equipment.toLowerCase() === equipment.toLowerCase()
  );
}
```

Line 337 — change the batch add button label from:

```tsx
Add {selectedExercises.size} Exercise{selectedExercises.size > 1 ? 's' : ''} to Routine
```

to:

```tsx
Add {selectedExercises.size} Exercise{selectedExercises.size > 1 ? 's' : ''}
```

- [ ] **Step 6: README truthfulness pass**

In `README.md`:
- Line 55: "Data Ownership: Export all workout logs and routines to JSON anytime." — keep (now true after Task 12).
- Line 54: "RPE notes" in workout log — keep (now true after Task 9).
- Verify all other claims match implemented features.

- [ ] **Step 7: ROADMAP truthfulness pass**

In `ROADMAP.md`:
- Mark Phase 1 and Phase 2 items as ✅ (already done).
- Update Phase 3 backlog: note which items this parity pass addressed (draft persistence, RPE, kg/lb, export, repeat, folders).
- Remove any claims that contradict code.

- [ ] **Step 8: Final typecheck + tests**

```bash
npx tsc --noEmit && npm test
```

Expected: typecheck clean, all tests PASS.

- [ ] **Step 9: Full manual regression test on device**

1. Start workout from routine — verify ghosts, set types, RPE, rest timer, minimize/resume.
2. Complete workout — verify duration matches wall clock, volume correct, RPE saved.
3. History — verify repeat rebuilds exercises, drill-down shows RPE.
4. Export — verify file generates and share sheet opens.
5. Force-close mid-workout — verify resume banner, correct elapsed.
6. kg/lb toggle — verify all displays update.
7. Folder rename/delete — verify routines update.
8. Plate calculator — verify kg and lb modes.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: hygiene pass — dead code removal, truthfulness, type cleanup"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-07-parity-pass.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
