import { Store, DataSnapshot, WorkoutDraft } from '../database/contract';
import { parseBackup, BackupV2 } from './backup';
import { Exercise, Routine, Workout } from '../types';

export interface RestorePreview {
  workoutsCount: number;
  routinesCount: number;
  customExercisesCount: number;
  draftsCount: number;
  newSettingsCount: number;
  skippedWorkoutsCount: number;
  skippedRoutinesCount: number;
}

function isIdenticalExercise(a: Exercise, b: Exercise): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.category === b.category &&
    a.equipment === b.equipment &&
    Boolean(a.isCustom) === Boolean(b.isCustom)
  );
}

function isIdenticalRoutine(a: Routine, b: Routine): boolean {
  if (a.id !== b.id || a.name !== b.name || (a.folderName || '') !== (b.folderName || '')) {
    return false;
  }
  const aEx = a.exercises || [];
  const bEx = b.exercises || [];
  if (aEx.length !== bEx.length) return false;
  for (let i = 0; i < aEx.length; i++) {
    if (
      aEx[i].exerciseId !== bEx[i].exerciseId ||
      aEx[i].targetSets !== bEx[i].targetSets ||
      aEx[i].targetReps !== bEx[i].targetReps
    ) {
      return false;
    }
  }
  return true;
}

function isIdenticalWorkout(a: Workout, b: Workout): boolean {
  if (
    a.id !== b.id ||
    a.name !== b.name ||
    a.startTime !== b.startTime ||
    Math.round((a.totalVolumeKg || 0) * 100) !== Math.round((b.totalVolumeKg || 0) * 100)
  ) {
    return false;
  }
  const aEx = a.exercises || [];
  const bEx = b.exercises || [];
  if (aEx.length !== bEx.length) return false;
  for (let i = 0; i < aEx.length; i++) {
    if (aEx[i].exerciseId !== bEx[i].exerciseId) return false;
    const aSets = aEx[i].sets || [];
    const bSets = bEx[i].sets || [];
    if (aSets.length !== bSets.length) return false;
    for (let j = 0; j < aSets.length; j++) {
      if (
        aSets[j].setNumber !== bSets[j].setNumber ||
        aSets[j].type !== bSets[j].type ||
        aSets[j].weightKg !== bSets[j].weightKg ||
        aSets[j].reps !== bSets[j].reps ||
        aSets[j].isCompleted !== bSets[j].isCompleted
      ) {
        return false;
      }
    }
  }
  return true;
}

function isIdenticalDraft(a: WorkoutDraft, b: WorkoutDraft): boolean {
  return a.workout.id === b.workout.id && isIdenticalWorkout(a.workout, b.workout);
}

export async function computeRestorePlan(
  backup: BackupV2,
  store: Store
): Promise<{ snapshotToMerge: DataSnapshot; preview: RestorePreview }> {
  const existing = await store.readSnapshot();

  const existingWorkouts = new Map(existing.workouts.map((w) => [w.id, w]));
  const existingRoutines = new Map(existing.routines.map((r) => [r.id, r]));
  const existingExercises = new Map(existing.exercises.map((e) => [e.id, e]));
  const existingDrafts = new Map(existing.drafts.map((d) => [d.workout.id, d]));

  const workoutsToInsert: Workout[] = [];
  let skippedWorkoutsCount = 0;
  for (const w of backup.workouts) {
    const exW = existingWorkouts.get(w.id);
    if (exW) {
      if (isIdenticalWorkout(w, exW)) {
        skippedWorkoutsCount++;
      } else {
        throw new Error(
          `Conflicting workout ID: ${w.id} ("${w.name}") already exists with different data`
        );
      }
    } else {
      workoutsToInsert.push(w);
    }
  }

  const routinesToInsert: Routine[] = [];
  let skippedRoutinesCount = 0;
  for (const r of backup.routines) {
    const exR = existingRoutines.get(r.id);
    if (exR) {
      if (isIdenticalRoutine(r, exR)) {
        skippedRoutinesCount++;
      } else {
        throw new Error(
          `Conflicting routine ID: ${r.id} ("${r.name}") already exists with different data`
        );
      }
    } else {
      routinesToInsert.push(r);
    }
  }

  const exercisesToInsert: Exercise[] = [];
  for (const ex of backup.exercises) {
    const exE = existingExercises.get(ex.id);
    if (exE) {
      if (!isIdenticalExercise(ex, exE)) {
        throw new Error(
          `Conflicting exercise ID: ${ex.id} ("${ex.name}") already exists with different data`
        );
      }
    } else {
      exercisesToInsert.push(ex);
    }
  }

  const draftsToInsert: WorkoutDraft[] = [];
  for (const d of backup.drafts) {
    const exD = existingDrafts.get(d.workout.id);
    if (exD) {
      if (!isIdenticalDraft(d, exD)) {
        throw new Error(
          `Conflicting draft ID: ${d.workout.id} ("${d.workout.name}") already exists with different data`
        );
      }
    } else {
      draftsToInsert.push(d);
    }
  }

  // Preserve existing settings, import only missing setting keys
  const settingsToInsert: Record<string, string> = {};
  let newSettingsCount = 0;
  for (const [k, v] of Object.entries(backup.settings || {})) {
    if (existing.settings[k] === undefined) {
      settingsToInsert[k] = v;
      newSettingsCount++;
    }
  }

  const snapshotToMerge: DataSnapshot = {
    exercises: exercisesToInsert,
    routines: routinesToInsert,
    workouts: workoutsToInsert,
    drafts: draftsToInsert,
    settings: settingsToInsert,
  };

  const preview: RestorePreview = {
    workoutsCount: workoutsToInsert.length,
    routinesCount: routinesToInsert.length,
    customExercisesCount: exercisesToInsert.filter((e) => e.isCustom).length,
    draftsCount: draftsToInsert.length,
    newSettingsCount,
    skippedWorkoutsCount,
    skippedRoutinesCount,
  };

  return { snapshotToMerge, preview };
}

export async function restoreBackup(json: string, store: Store): Promise<void> {
  const backup = parseBackup(json);
  const { snapshotToMerge } = await computeRestorePlan(backup, store);
  await store.mergeSnapshot(snapshotToMerge);
}
