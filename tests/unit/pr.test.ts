import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  evaluateRank,
  insertSortedDistinct,
  evaluateWorkoutPRs,
  formatPRBadgeLabel,
  formatPRDescription,
} from '../../src/workout/pr';
import { Exercise, Gym, Workout } from '../../src/types';

describe('PR Calculation Engine & Multi-Gym Rules', () => {
  it('insertSortedDistinct maintains descending order without duplicates', () => {
    const list = [100, 90, 80];
    insertSortedDistinct(list, 95);
    assert.deepEqual(list, [100, 95, 90, 80]);

    insertSortedDistinct(list, 110);
    assert.deepEqual(list, [110, 100, 95, 90, 80]);

    insertSortedDistinct(list, 70);
    assert.deepEqual(list, [110, 100, 95, 90, 80, 70]);

    // Duplicate does not insert
    insertSortedDistinct(list, 100);
    assert.deepEqual(list, [110, 100, 95, 90, 80, 70]);

    // Non-positive does not insert
    insertSortedDistinct(list, 0);
    insertSortedDistinct(list, -5);
    assert.deepEqual(list, [110, 100, 95, 90, 80, 70]);
  });

  it('evaluateRank correctly assigns Gold (1st), Silver (2nd), and Bronze (3rd)', () => {
    // 1. Empty history
    assert.deepEqual(evaluateRank(100, []), { rank: 1 });

    // 2. Full top 3 history: [100, 90, 80]
    const history = [100, 90, 80];
    assert.deepEqual(evaluateRank(105, history), { rank: 1, previousRecord: 100 });
    assert.deepEqual(evaluateRank(95, history), { rank: 2, previousRecord: 90 });
    assert.deepEqual(evaluateRank(85, history), { rank: 3, previousRecord: 80 });
    assert.equal(evaluateRank(75, history), null); // Below 3rd
    assert.equal(evaluateRank(100, history), null); // Tie 1st
    assert.equal(evaluateRank(90, history), null); // Tie 2nd
    assert.equal(evaluateRank(80, history), null); // Tie 3rd

    // 3. Only 2 historical records: [100, 90]
    const twoHistory = [100, 90];
    assert.deepEqual(evaluateRank(105, twoHistory), { rank: 1, previousRecord: 100 });
    assert.deepEqual(evaluateRank(95, twoHistory), { rank: 2, previousRecord: 90 });
    // 85 is < 90, but >= 0.8 * 90 (72) -> Bronze (3rd)
    assert.deepEqual(evaluateRank(85, twoHistory), { rank: 3 });
    // 50 is < 72 -> No medal (filters out trivial warmup)
    assert.equal(evaluateRank(50, twoHistory), null);

    // 4. Only 1 historical record: [100]
    const oneHistory = [100];
    assert.deepEqual(evaluateRank(105, oneHistory), { rank: 1, previousRecord: 100 });
    // 90 is < 100, but >= 0.8 * 100 (80) -> Silver (2nd)
    assert.deepEqual(evaluateRank(90, oneHistory), { rank: 2 });
    // 60 is < 80 -> No medal
    assert.equal(evaluateRank(60, oneHistory), null);
  });

  const barbellBench: Exercise = {
    id: 'bench',
    name: 'Barbell Bench Press',
    category: 'chest',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
  };

  const legPressMachine: Exercise = {
    id: 'leg_press',
    name: 'Leg Press Machine',
    category: 'legs',
    equipment: 'machine',
    primaryMuscles: ['quadriceps'],
  };

  const pullUps: Exercise = {
    id: 'pull_ups',
    name: 'Pull Up',
    category: 'back',
    equipment: 'bodyweight',
    primaryMuscles: ['lats'],
  };

  const gymA: Gym = { id: 'gym-a', name: 'Gold Gym', isDefault: true, color: '#F59E0B', createdAt: '2026-01-01' };
  const gymB: Gym = { id: 'gym-b', name: 'FitX', isDefault: false, color: '#3B82F6', createdAt: '2026-01-01' };
  const allGyms = [gymA, gymB];

  it('evaluates global barbell exercise with Gold, Silver, and Bronze PRs across workouts', () => {
    // Workout 1: Baseline bench press: 100 kg x 5 and 90 kg x 5
    const workout1: Workout = {
      id: 'w1',
      name: 'Chest Day 1',
      gymId: gymA.id,
      startTime: '2026-08-01T10:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 1500,
      exercises: [
        {
          id: 'ae1',
          exerciseId: barbellBench.id,
          exercise: barbellBench,
          restTimerSeconds: 90,
          sets: [
            { id: 'w1-s1', setNumber: 1, type: 'warmup', weightKg: 60, reps: 10, isCompleted: true },
            { id: 'w1-s2', setNumber: 2, type: 'normal', weightKg: 90, reps: 5, isCompleted: true },
            { id: 'w1-s3', setNumber: 3, type: 'normal', weightKg: 100, reps: 5, isCompleted: true },
          ],
        },
      ],
    };

    // First workout evaluation
    const summary1 = evaluateWorkoutPRs(workout1, {}, allGyms, true);
    // Warmup is excluded
    assert.equal(summary1.setPRs.get('w1-s1'), undefined);
    // Set 2 gets Gold (initial record)
    assert.equal(summary1.setPRs.get('w1-s2')?.primary?.rank, 1);
    // Set 3 improves to 100 kg, gets Gold
    assert.equal(summary1.setPRs.get('w1-s3')?.primary?.rank, 1);
    assert.equal(summary1.setPRs.get('w1-s3')?.primary?.metric, 'weight');

    // Workout 2: Silver PR session (top lift is 95 kg, which beats 90 kg to become 2nd best ever)
    const workout2: Workout = {
      id: 'w2',
      name: 'Chest Day 2',
      gymId: gymB.id,
      startTime: '2026-08-15T10:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 1800,
      exercises: [
        {
          id: 'ae2',
          exerciseId: barbellBench.id,
          exercise: barbellBench,
          restTimerSeconds: 90,
          sets: [
            { id: 'w2-s1', setNumber: 1, type: 'normal', weightKg: 95, reps: 5, isCompleted: true },
            { id: 'w2-s2', setNumber: 2, type: 'normal', weightKg: 80, reps: 5, isCompleted: true },
          ],
        },
      ],
    };

    const summary2 = evaluateWorkoutPRs(
      workout2,
      { [barbellBench.id]: [workout1] },
      allGyms,
      true
    );
    // 95 kg is 2nd best ever (Silver 🥈)
    assert.equal(summary2.setPRs.get('w2-s1')?.primary?.rank, 2);
    assert.equal(summary2.setPRs.get('w2-s1')?.primary?.previousRecord, 90);

    // Workout 3: Gold PR session (top lift 105 kg, breaks all-time 100 kg)
    const workout3: Workout = {
      id: 'w3',
      name: 'Chest Day 3',
      gymId: gymA.id,
      startTime: '2026-09-01T10:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 2000,
      exercises: [
        {
          id: 'ae3',
          exerciseId: barbellBench.id,
          exercise: barbellBench,
          restTimerSeconds: 90,
          sets: [
            { id: 'w3-s1', setNumber: 1, type: 'normal', weightKg: 105, reps: 5, isCompleted: true },
            { id: 'w3-s2', setNumber: 2, type: 'normal', weightKg: 100, reps: 5, isCompleted: true },
          ],
        },
      ],
    };

    const summary3 = evaluateWorkoutPRs(
      workout3,
      { [barbellBench.id]: [workout1, workout2] },
      allGyms,
      true
    );
    assert.equal(summary3.setPRs.get('w3-s1')?.primary?.rank, 1); // Gold 🥇
    assert.equal(summary3.setPRs.get('w3-s1')?.primary?.previousRecord, 100);
    // Back-off set 100 kg does not earn another medal
    assert.equal(summary3.setPRs.get('w3-s2'), undefined);
  });

  it('evaluates machine exercise with Multi-Gym isolation', () => {
    // Workout at Gym A (Gold Gym): Leg press 200 kg
    const gymAWorkout: Workout = {
      id: 'w-gymA',
      name: 'Legs at Gold Gym',
      gymId: gymA.id,
      startTime: '2026-08-01T10:00:00.000Z',
      durationSeconds: 3000,
      totalVolumeKg: 2000,
      exercises: [
        {
          id: 'ae-lp-a',
          exerciseId: legPressMachine.id,
          exercise: legPressMachine,
          restTimerSeconds: 90,
          sets: [
            { id: 's-ga-1', setNumber: 1, type: 'normal', weightKg: 200, reps: 10, isCompleted: true },
          ],
        },
      ],
    };

    // Workout at Gym B (FitX):
    // First time doing Leg Press at FitX!
    // Set 1: 180 kg x 10.
    // 180 kg is less than 200 kg (so NOT an all-time global PR).
    // But this is user's 1st time on FitX's leg press machine -> Gym B Gold PR!
    const gymBWorkout: Workout = {
      id: 'w-gymB',
      name: 'Legs at FitX',
      gymId: gymB.id,
      startTime: '2026-09-01T10:00:00.000Z',
      durationSeconds: 3000,
      totalVolumeKg: 1800,
      exercises: [
        {
          id: 'ae-lp-b',
          exerciseId: legPressMachine.id,
          exercise: legPressMachine,
          restTimerSeconds: 90,
          sets: [
            { id: 's-gb-1', setNumber: 1, type: 'normal', weightKg: 180, reps: 10, isCompleted: true },
          ],
        },
      ],
    };

    const summaryB = evaluateWorkoutPRs(
      gymBWorkout,
      { [legPressMachine.id]: [gymAWorkout] },
      allGyms,
      true // gym tracking enabled
    );

    const prSet = summaryB.setPRs.get('s-gb-1');
    assert.ok(prSet);
    assert.ok(prSet.primary);
    assert.equal(prSet.primary.rank, 1);
    assert.equal(prSet.primary.scope, 'gym'); // Gym PR!
    assert.equal(prSet.primary.gymName, 'FitX');

    const label = formatPRBadgeLabel(prSet.primary, true);
    assert.equal(label, '🥇 FitX PR');

    // If gym tracking is disabled, 180 kg is compared against global 200 kg (no Gold)
    const summaryDisabled = evaluateWorkoutPRs(
      gymBWorkout,
      { [legPressMachine.id]: [gymAWorkout] },
      allGyms,
      false // gym tracking disabled
    );
    // 180 < 200, so it's 2nd best all-time (Silver) rather than Gold Gym PR
    assert.equal(summaryDisabled.setPRs.get('s-gb-1')?.primary?.rank, 2);
    assert.equal(summaryDisabled.setPRs.get('s-gb-1')?.primary?.scope, 'global');
  });

  it('evaluates bodyweight exercises on reps', () => {
    const workout: Workout = {
      id: 'w-bw',
      name: 'Calisthenics',
      gymId: gymA.id,
      startTime: '2026-09-10T10:00:00.000Z',
      durationSeconds: 1200,
      totalVolumeKg: 0,
      exercises: [
        {
          id: 'ae-pullups',
          exerciseId: pullUps.id,
          exercise: pullUps,
          restTimerSeconds: 60,
          sets: [
            { id: 's-pu-1', setNumber: 1, type: 'normal', weightKg: 0, reps: 12, isCompleted: true },
            { id: 's-pu-2', setNumber: 2, type: 'normal', weightKg: 0, reps: 15, isCompleted: true },
            { id: 's-pu-3', setNumber: 3, type: 'normal', weightKg: 0, reps: 10, isCompleted: true },
          ],
        },
      ],
    };

    const summary = evaluateWorkoutPRs(workout, {}, allGyms, true);
    assert.equal(summary.setPRs.get('s-pu-1')?.primary?.rank, 1);
    assert.equal(summary.setPRs.get('s-pu-1')?.primary?.metric, 'reps');

    // Set 2 hit 15 reps (beats 12) -> Gold Reps PR
    assert.equal(summary.setPRs.get('s-pu-2')?.primary?.rank, 1);
    assert.equal(summary.setPRs.get('s-pu-2')?.primary?.metric, 'reps');

    // Set 3 hit 10 reps (less than 15) -> No medal
    assert.equal(summary.setPRs.get('s-pu-3'), undefined);
  });
});
