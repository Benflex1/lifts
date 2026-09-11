import { DataSnapshot } from '../../database/contract';
import { validateSnapshotForMerge } from '../../database/snapshot-validation';
import { ActiveExercise, Exercise, Workout, WorkoutSet } from '../../types';
import { createScopedId } from '../ids';
import { parseWorkoutCsv } from './csv-parser';
import { CsvImportOptions, CsvImportPreview } from './types';

export function computeCsvImportPlan(
  csvText: string,
  existingSnapshot: DataSnapshot,
  options: CsvImportOptions
): CsvImportPreview {
  const { sessions, detectedFormat, formatLabel, mapper, warnings } = parseWorkoutCsv(
    csvText,
    existingSnapshot.exercises,
    options
  );

  const targetGymId = options.targetGymId || existingSnapshot.gyms.find(g => g.isDefault)?.id || 'gym-default';
  const skipExisting = options.skipExistingWorkouts !== false;

  // Build existing start-time index to detect duplicate workouts
  const existingStartTimeSet = new Set(
    existingSnapshot.workouts.map(w => w.startTime)
  );

  const workoutsToInsert: Workout[] = [];
  let duplicateWorkoutsCount = 0;
  let totalSetsCount = 0;
  let earliestDate: number | null = null;
  let latestDate: number | null = null;

  for (const session of sessions) {
    const sessionTimeMs = Date.parse(session.startTime);
    if (!Number.isNaN(sessionTimeMs)) {
      if (earliestDate === null || sessionTimeMs < earliestDate) earliestDate = sessionTimeMs;
      if (latestDate === null || sessionTimeMs > latestDate) latestDate = sessionTimeMs;
    }

    // Check duplicate
    const isDuplicate = existingStartTimeSet.has(session.startTime);
    if (isDuplicate) {
      duplicateWorkoutsCount++;
      if (skipExisting) {
        continue;
      }
    }
    existingStartTimeSet.add(session.startTime);

    const workoutId = createScopedId('w');
    let workoutVolumeKg = 0;

    const activeExercises: ActiveExercise[] = [];
    for (const group of session.exerciseGroups) {
      const activeExerciseId = createScopedId('we');
      const sets: WorkoutSet[] = [];

      for (let sIdx = 0; sIdx < group.sets.length; sIdx++) {
        const pSet = group.sets[sIdx];
        const setId = createScopedId('set');
        totalSetsCount++;
        workoutVolumeKg += pSet.weightKg * pSet.reps;

        sets.push({
          id: setId,
          setNumber: pSet.setNumber || sIdx + 1,
          type: pSet.type,
          weightKg: pSet.weightKg,
          reps: pSet.reps,
          rpe: pSet.rpe,
          isCompleted: true,
          completedAt: session.startTime,
        });
      }

      activeExercises.push({
        id: activeExerciseId,
        exerciseId: group.matchedExercise.id,
        exercise: group.matchedExercise,
        sets,
        restTimerSeconds: 0,
        notes: group.notes,
      });
    }

    workoutsToInsert.push({
      id: workoutId,
      name: session.name,
      gymId: targetGymId,
      startTime: session.startTime,
      endTime: session.endTime,
      durationSeconds: session.durationSeconds,
      totalVolumeKg: Math.round(workoutVolumeKg * 100) / 100,
      exercises: activeExercises,
      notes: session.notes,
    });
  }

  const exerciseAssignments = mapper.getExerciseAssignments();
  const newCustomExercises = mapper.getNewlyCreatedExercises().filter(
    ce => !existingSnapshot.exercises.some(ee => ee.id === ce.id)
  );

  const snapshotToMerge: DataSnapshot = {
    workouts: workoutsToInsert,
    routines: [],
    exercises: newCustomExercises,
    drafts: [],
    settings: {},
    gyms: [],
    exerciseGymScopes: [],
  };

  // Validate structural integrity and schema constraints
  validateSnapshotForMerge(snapshotToMerge, existingSnapshot);

  // Build sample preview of up to 5 workouts
  const sampleWorkouts = workoutsToInsert.slice(0, 5).map(w => ({
    name: w.name,
    date: w.startTime.slice(0, 10),
    exerciseCount: w.exercises.length,
    setCount: w.exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
    volumeKg: w.totalVolumeKg,
  }));

  const dateRange =
    earliestDate !== null && latestDate !== null
      ? {
          start: new Date(earliestDate).toISOString().slice(0, 10),
          end: new Date(latestDate).toISOString().slice(0, 10),
        }
      : null;

  const matchedExercisesCount = exerciseAssignments.filter(ea => !ea.isCustom).length;
  const newCustomExercisesCount = exerciseAssignments.filter(ea => ea.isCustom).length;

  return {
    detectedFormat,
    formatLabel,
    totalWorkouts: sessions.length,
    totalSets: totalSetsCount,
    newWorkoutsCount: workoutsToInsert.length,
    duplicateWorkoutsCount,
    matchedExercisesCount,
    newCustomExercisesCount,
    exerciseAssignments,
    dateRange,
    sampleWorkouts,
    snapshotToMerge,
    warnings,
  };
}
