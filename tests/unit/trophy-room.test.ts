import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildTrophyRoomSummary } from '../../src/workout/trophy-room';
import { Exercise, Gym, Workout } from '../../src/types';

describe('Trophy Room Aggregation Engine', () => {
  const bench: Exercise = {
    id: 'bench',
    name: 'Barbell Bench Press',
    category: 'chest',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
  };

  const squat: Exercise = {
    id: 'squat',
    name: 'Barbell Back Squat',
    category: 'legs',
    equipment: 'barbell',
    primaryMuscles: ['quadriceps'],
  };

  const deadlift: Exercise = {
    id: 'deadlift',
    name: 'Barbell Deadlift',
    category: 'back',
    equipment: 'barbell',
    primaryMuscles: ['lower_back'],
  };

  const pullUps: Exercise = {
    id: 'pull_ups',
    name: 'Pull Up',
    category: 'back',
    equipment: 'bodyweight',
    primaryMuscles: ['lats'],
  };

  const allExercises = [bench, squat, deadlift, pullUps];

  const gymA: Gym = { id: 'gym-a', name: 'Gold Gym', isDefault: true, color: '#F59E0B', createdAt: '2026-01-01' };
  const allGyms = [gymA];

  it('aggregates total medals, best lifts, and computes SBD total', () => {
    const w1: Workout = {
      id: 'w1',
      name: 'Power Day 1',
      gymId: gymA.id,
      startTime: '2026-08-01T10:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 3000,
      exercises: [
        {
          id: 'ae1',
          exerciseId: bench.id,
          exercise: bench,
          sets: [
            { id: 's1', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true },
          ],
        },
        {
          id: 'ae2',
          exerciseId: squat.id,
          exercise: squat,
          sets: [
            { id: 's2', setNumber: 1, type: 'normal', weightKg: 140, reps: 5, isCompleted: true },
          ],
        },
        {
          id: 'ae3',
          exerciseId: deadlift.id,
          exercise: deadlift,
          sets: [
            { id: 's3', setNumber: 1, type: 'normal', weightKg: 180, reps: 5, isCompleted: true },
          ],
        },
      ],
    };

    const w2: Workout = {
      id: 'w2',
      name: 'Power Day 2',
      gymId: gymA.id,
      startTime: '2026-08-15T10:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 3500,
      exercises: [
        {
          id: 'ae4',
          exerciseId: bench.id,
          exercise: bench,
          sets: [
            { id: 's4', setNumber: 1, type: 'normal', weightKg: 110, reps: 5, isCompleted: true }, // Gold
          ],
        },
        {
          id: 'ae5',
          exerciseId: pullUps.id,
          exercise: pullUps,
          sets: [
            { id: 's5', setNumber: 1, type: 'normal', weightKg: 0, reps: 15, isCompleted: true },
          ],
        },
      ],
    };

    const summary = buildTrophyRoomSummary([w1, w2], allExercises, allGyms, true);

    // Podium mantle evaluation across the 4 distinct exercises:
    // - Bench: 110 kg (Gold), 100 kg (Silver)
    // - Squat: 140 kg (Gold)
    // - Deadlift: 180 kg (Gold)
    // - PullUps: 15 reps (Gold)
    assert.equal(summary.totalGold, 4);
    assert.equal(summary.totalSilver, 1);
    assert.equal(summary.totalBronze, 0);
    assert.equal(summary.totalRecords, 5);

    // Bench best is 110 kg x 5 -> ~128 kg 1RM
    // Squat best is 140 kg x 5 -> ~163 kg 1RM
    // Deadlift best is 180 kg x 5 -> ~210 kg 1RM
    assert.ok(summary.sbdBreakdown.bench);
    assert.equal(summary.sbdBreakdown.bench.weightKg, 110);
    assert.ok(summary.sbdBreakdown.squat);
    assert.equal(summary.sbdBreakdown.squat.weightKg, 140);
    assert.ok(summary.sbdBreakdown.deadlift);
    assert.equal(summary.sbdBreakdown.deadlift.weightKg, 180);

    const expectedSBD =
      summary.sbdBreakdown.bench.oneRMKg +
      summary.sbdBreakdown.squat.oneRMKg +
      summary.sbdBreakdown.deadlift.oneRMKg;
    assert.equal(summary.sbdTotalKg, expectedSBD);

    // Bodyweight pullups record
    const pullupRecord = summary.records.find((r) => r.exerciseId === pullUps.id);
    assert.ok(pullupRecord);
    assert.equal(pullupRecord.bestReps?.value, 15);
  });

  it('filters by category and muscle groups matching defaultExercises schema', () => {
    // Standard library schema: category is 'strength', primaryMuscles identifies muscle group
    const barbellBenchStandard: Exercise = {
      id: 'ex-bench',
      name: 'Barbell Bench Press - Medium Grip',
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
    };

    const barbellSquatStandard: Exercise = {
      id: 'ex-squat',
      name: 'Barbell Full Squat',
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['quadriceps'],
    };

    const barbellDeadliftStandard: Exercise = {
      id: 'ex-deadlift',
      name: 'Barbell Deadlift',
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['lower back'],
    };

    const standardExercises = [barbellBenchStandard, barbellSquatStandard, barbellDeadliftStandard];

    const w: Workout = {
      id: 'w-std',
      name: 'Full Body Test',
      gymId: gymA.id,
      startTime: '2026-08-01T10:00:00.000Z',
      durationSeconds: 3600,
      totalVolumeKg: 3000,
      exercises: [
        {
          id: 'ae1',
          exerciseId: barbellBenchStandard.id,
          exercise: barbellBenchStandard,
          sets: [{ id: 's1', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true }],
        },
        {
          id: 'ae2',
          exerciseId: barbellSquatStandard.id,
          exercise: barbellSquatStandard,
          sets: [{ id: 's2', setNumber: 1, type: 'normal', weightKg: 140, reps: 5, isCompleted: true }],
        },
        {
          id: 'ae3',
          exerciseId: barbellDeadliftStandard.id,
          exercise: barbellDeadliftStandard,
          sets: [{ id: 's3', setNumber: 1, type: 'normal', weightKg: 180, reps: 5, isCompleted: true }],
        },
      ],
    };

    // 1. CHEST filter matches bench (primaryMuscles = ['chest'])
    const chestResult = buildTrophyRoomSummary([w], standardExercises, allGyms, true, undefined, {
      categoryFilter: 'chest',
    });
    assert.equal(chestResult.records.length, 1);
    assert.equal(chestResult.records[0].exerciseId, barbellBenchStandard.id);
    assert.equal(chestResult.totalGold, 1);
    assert.equal(chestResult.totalRecords, 1);

    // 2. LEGS filter matches squat (primaryMuscles = ['quadriceps'])
    const legsResult = buildTrophyRoomSummary([w], standardExercises, allGyms, true, undefined, {
      categoryFilter: 'legs',
    });
    assert.equal(legsResult.records.length, 1);
    assert.equal(legsResult.records[0].exerciseId, barbellSquatStandard.id);
    assert.equal(legsResult.totalGold, 1);

    // 3. BACK filter matches deadlift (primaryMuscles = ['lower back'])
    const backResult = buildTrophyRoomSummary([w], standardExercises, allGyms, true, undefined, {
      categoryFilter: 'back',
    });
    assert.equal(backResult.records.length, 1);
    assert.equal(backResult.records[0].exerciseId, barbellDeadliftStandard.id);
    assert.equal(backResult.totalGold, 1);

    // 4. Search query
    const searchSquat = buildTrophyRoomSummary([w], standardExercises, allGyms, true, undefined, {
      searchQuery: 'squat',
    });
    assert.equal(searchSquat.records.length, 1);
    assert.equal(searchSquat.records[0].exerciseId, barbellSquatStandard.id);
  });
});
