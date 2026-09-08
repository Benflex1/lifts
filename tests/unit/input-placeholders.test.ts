import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { initialReps, validateCompletedSet } from '../../src/workout/sets';
import { kgToDisplay } from '../../src/utils/units';
import { WorkoutSet } from '../../src/types';

describe('Weight & Reps Input Display Logic', () => {
  const getWeightDisplay = (
    value: number,
    completed: boolean,
    isEdited?: boolean,
    unit: 'kg' | 'lb' = 'kg'
  ) => {
    const effectiveEdited = completed || (isEdited !== undefined ? isEdited : value > 0);
    return effectiveEdited ? kgToDisplay(value, unit).toString() : '';
  };

  it('uncompleted untouched set with value 0 returns empty display string for ghost placeholder', () => {
    assert.equal(getWeightDisplay(0, false, false), '');
  });

  it('uncompleted explicitly entered 0 displays 0', () => {
    assert.equal(getWeightDisplay(0, false, true), '0');
  });

  it('completed set with value 0 displays 0', () => {
    assert.equal(getWeightDisplay(0, true), '0');
  });

  it('set with positive weight displays value regardless of completion', () => {
    assert.equal(getWeightDisplay(82.5, false, true), '82.5');
    assert.equal(getWeightDisplay(82.5, true), '82.5');
  });

  it('reps display logic displays empty string for 0 and numeric string for positive', () => {
    const getRepsDisplay = (reps: number) => (reps > 0 ? reps.toString() : '');
    assert.equal(getRepsDisplay(0), '');
    assert.equal(getRepsDisplay(10), '10');
    assert.equal(getRepsDisplay(12), '12');
  });

  it('weight placeholder resolves to previousWeightKg or dash', () => {
    const getPlaceholder = (previousWeightKg: number | undefined, unit: 'kg' | 'lb' = 'kg') =>
      previousWeightKg !== undefined && previousWeightKg > 0
        ? kgToDisplay(previousWeightKg, unit).toString()
        : '-';

    assert.equal(getPlaceholder(undefined), '-');
    assert.equal(getPlaceholder(0), '-');
    assert.equal(getPlaceholder(60, 'kg'), '60');
    assert.equal(getPlaceholder(100, 'lb'), '220.5');
  });
});

describe('Untouched Set Completion Resolution', () => {
  function resolveSetOnComplete(
    targetSet: WorkoutSet,
    targetReps: string | undefined,
    setIndex: number
  ): WorkoutSet {
    let effectiveSet = targetSet;
    const isWeightEdited = targetSet.isWeightEdited ?? (targetSet.weightKg > 0);
    const needsReps = targetSet.reps <= 0;
    const needsWeight = !isWeightEdited && targetSet.weightKg <= 0 && (targetSet.previousWeightKg ?? 0) > 0;

    if (needsReps || needsWeight) {
      const fallbackReps = needsReps
        ? initialReps(targetReps, setIndex, targetSet.previousReps)
        : targetSet.reps;
      const fallbackWeight = needsWeight
        ? (targetSet.previousWeightKg ?? 0)
        : targetSet.weightKg;
      effectiveSet = {
        ...targetSet,
        reps: fallbackReps,
        weightKg: fallbackWeight,
        isWeightEdited: true,
      };
    }

    const error = validateCompletedSet(effectiveSet);
    if (error) {
      throw new Error(`Validation failed: ${error}`);
    }

    return {
      ...effectiveSet,
      isCompleted: true,
      completedAt: new Date().toISOString(),
    };
  }

  it('resolves untouched set with previous weight and target range reps', () => {
    const initialSet: WorkoutSet = {
      id: 's-1',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 0,
      isWeightEdited: false,
      previousWeightKg: 70,
      previousReps: 8,
      isCompleted: false,
    };

    const completed = resolveSetOnComplete(initialSet, '8-12', 0);
    assert.equal(completed.isCompleted, true);
    assert.equal(completed.weightKg, 70);
    assert.equal(completed.reps, 8); // lower bound of 8-12 range
  });

  it('resolves untouched set without previous weight to 0 kg and default 10 reps', () => {
    const initialSet: WorkoutSet = {
      id: 's-2',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 0,
      isWeightEdited: false,
      previousWeightKg: undefined,
      previousReps: undefined,
      isCompleted: false,
    };

    const completed = resolveSetOnComplete(initialSet, undefined, 0);
    assert.equal(completed.isCompleted, true);
    assert.equal(completed.weightKg, 0);
    assert.equal(completed.reps, 10);
  });

  it('preserves user typed weight while auto-filling untouched reps', () => {
    const initialSet: WorkoutSet = {
      id: 's-3',
      setNumber: 1,
      type: 'normal',
      weightKg: 85,
      reps: 0,
      isWeightEdited: true,
      previousWeightKg: 80,
      previousReps: 6,
      isCompleted: false,
    };

    const completed = resolveSetOnComplete(initialSet, '6', 0);
    assert.equal(completed.isCompleted, true);
    assert.equal(completed.weightKg, 85); // user's 85 preserved
    assert.equal(completed.reps, 6);
  });

  it('preserves user typed reps while auto-filling untouched weight from previous', () => {
    const initialSet: WorkoutSet = {
      id: 's-4',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 12,
      isWeightEdited: false,
      previousWeightKg: 65,
      previousReps: 10,
      isCompleted: false,
    };

    const completed = resolveSetOnComplete(initialSet, '10', 0);
    assert.equal(completed.isCompleted, true);
    assert.equal(completed.weightKg, 65); // previous weight auto-filled
    assert.equal(completed.reps, 12); // user's 12 reps preserved
  });

  it('preserves explicit 0 kg weight when completing a set with previous weight history', () => {
    const bodyweightSet: WorkoutSet = {
      id: 's-5',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 10,
      isWeightEdited: true, // explicitly entered 0
      previousWeightKg: 20, // previous session was weighted +20 kg
      previousReps: 8,
      isCompleted: false,
    };

    const completed = resolveSetOnComplete(bodyweightSet, '8-12', 0);
    assert.equal(completed.isCompleted, true);
    assert.equal(completed.weightKg, 0, 'Explicit 0 kg must NOT be overwritten by previousWeightKg');
    assert.equal(completed.reps, 10);
  });

  it('clearing weight input resets isWeightEdited to false and restores previousWeight fallback', () => {
    const clearedSet: WorkoutSet = {
      id: 's-6',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 10,
      isWeightEdited: false, // user backspaced/cleared input
      previousWeightKg: 40,
      previousReps: 10,
      isCompleted: false,
    };

    const completed = resolveSetOnComplete(clearedSet, '10', 0);
    assert.equal(completed.isCompleted, true);
    assert.equal(completed.weightKg, 40, 'Cleared input should fall back to previousWeightKg');
  });
});

describe('Swipe Left to Delete Gesture Logic', () => {
  const SWIPE_THRESHOLD = 90;
  const VELOCITY_THRESHOLD = 0.35;

  function shouldTriggerSwipe(dx: number, dy: number): boolean {
    return Math.abs(dx) > Math.abs(dy) * 1.2 && dx < -12 && Math.abs(dy) < 15;
  }

  function shouldDeleteOnRelease(dx: number, vx: number): boolean {
    return dx < -SWIPE_THRESHOLD || (dx < -40 && vx < -VELOCITY_THRESHOLD);
  }

  it('recognizes deliberate leftward horizontal swipe', () => {
    assert.equal(shouldTriggerSwipe(-30, 5), true);
    assert.equal(shouldTriggerSwipe(-15, 2), true);
  });

  it('rejects vertical scrolling gestures so ScrollView takes precedence', () => {
    assert.equal(shouldTriggerSwipe(-10, 40), false);
    assert.equal(shouldTriggerSwipe(-20, 25), false);
    assert.equal(shouldTriggerSwipe(-15, 18), false);
  });

  it('rejects rightward swipes (only swipe left allowed)', () => {
    assert.equal(shouldTriggerSwipe(30, 0), false);
    assert.equal(shouldTriggerSwipe(10, 2), false);
  });

  it('triggers delete when dragged left past swipe distance threshold', () => {
    assert.equal(shouldDeleteOnRelease(-95, -0.1), true);
    assert.equal(shouldDeleteOnRelease(-150, 0.0), true);
  });

  it('triggers delete on quick leftward flick/velocity past minimum distance', () => {
    assert.equal(shouldDeleteOnRelease(-50, -0.4), true);
  });

  it('cancels delete and snaps back when released before threshold', () => {
    assert.equal(shouldDeleteOnRelease(-70, -0.2), false);
    assert.equal(shouldDeleteOnRelease(-30, -0.1), false);
    assert.equal(shouldDeleteOnRelease(10, 0.1), false);
  });

  it('renumbers remaining sets when a set is deleted', () => {
    const sets: WorkoutSet[] = [
      { id: 's-1', setNumber: 1, type: 'normal', weightKg: 80, reps: 10, isCompleted: true },
      { id: 's-2', setNumber: 2, type: 'normal', weightKg: 80, reps: 10, isCompleted: true },
      { id: 's-3', setNumber: 3, type: 'normal', weightKg: 80, reps: 8, isCompleted: false },
      { id: 's-4', setNumber: 4, type: 'drop', weightKg: 60, reps: 12, isCompleted: false },
    ];

    // Delete set 2
    const remaining = sets
      .filter((s) => s.id !== 's-2')
      .map((s, idx) => ({ ...s, setNumber: idx + 1 }));

    assert.equal(remaining.length, 3);
    assert.equal(remaining[0].id, 's-1');
    assert.equal(remaining[0].setNumber, 1);
    assert.equal(remaining[1].id, 's-3');
    assert.equal(remaining[1].setNumber, 2); // was 3
    assert.equal(remaining[2].id, 's-4');
    assert.equal(remaining[2].setNumber, 3); // was 4
  });
});
