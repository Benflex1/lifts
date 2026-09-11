import * as SQLite from 'expo-sqlite';
import { DualExerciseStats, Exercise, PreviousSetSuggestion, Routine, Workout, WorkoutHistorySummary } from '../types';
import { createNativeStore, SqliteDriver } from './nativeStore';
import { Store, WorkoutDraft, DataSnapshot } from './contract';

let storeInstance: Store | null = null;
let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getStore(): Promise<Store> {
  if (!storeInstance) {
    if (!dbInstance) {
      dbInstance = await SQLite.openDatabaseAsync('lifts.db');
    }
    storeInstance = createNativeStore(dbInstance as unknown as SqliteDriver);
  }
  return storeInstance;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase | null> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('lifts.db');
  }
  return dbInstance;
}

export async function initDatabase(): Promise<void> {
  const store = await getStore();
  await store.init();
}

export async function readSnapshot(): Promise<DataSnapshot> {
  const store = await getStore();
  return store.readSnapshot();
}

export async function mergeSnapshot(snapshot: DataSnapshot): Promise<void> {
  const store = await getStore();
  return store.mergeSnapshot(snapshot);
}

export async function getRoutines(): Promise<Routine[]> {
  const store = await getStore();
  return store.getRoutines();
}

export async function saveRoutine(
  name: string,
  folderName: string,
  exercises: { exerciseId: string; targetSets: number; targetReps: string; restTimerSeconds: number }[],
  notes?: string,
  existingId?: string
): Promise<string> {
  const store = await getStore();
  return store.saveRoutine(name, folderName, exercises, notes, existingId);
}

export async function deleteRoutine(id: string): Promise<void> {
  const store = await getStore();
  return store.deleteRoutine(id);
}

export async function duplicateRoutine(routineId: string): Promise<string> {
  const store = await getStore();
  return store.duplicateRoutine(routineId);
}

export async function getRoutineById(id: string): Promise<Routine | null> {
  const store = await getStore();
  return store.getRoutineById(id);
}

export async function saveCompletedWorkout(workout: Workout): Promise<void> {
  const store = await getStore();
  return store.saveCompletedWorkout(workout);
}

export async function getWorkoutHistory(): Promise<WorkoutHistorySummary[]> {
  const store = await getStore();
  return store.getWorkoutHistory();
}

export async function getWorkoutDetail(workoutId: string): Promise<Workout | null> {
  const store = await getStore();
  return store.getWorkoutDetail(workoutId);
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const store = await getStore();
  return store.deleteWorkout(workoutId);
}

export async function getPreviousSetsForExercise(
  exerciseId: string,
  occurrenceIndex: number = 0,
  currentGymId?: string,
): Promise<PreviousSetSuggestion[]> {
  const store = await getStore();
  return store.getPreviousSetsForExercise(exerciseId, occurrenceIndex, currentGymId);
}

export async function getCompletedWorkoutsForExercise(exerciseId: string): Promise<Workout[]> {
  const store = await getStore();
  return store.getCompletedWorkoutsForExercise(exerciseId);
}

export async function getExerciseStats(exerciseId: string, currentGymId?: string): Promise<DualExerciseStats> {
  const store = await getStore();
  return store.getExerciseStats(exerciseId, currentGymId);
}

export async function getGyms() { return (await getStore()).getGyms(); }
export async function getDefaultGym() { return (await getStore()).getDefaultGym(); }
export async function createGym(name: string, color?: string) { return (await getStore()).createGym(name, color); }
export async function updateGym(id: string, updates: { name?: string; color?: string }) { return (await getStore()).updateGym(id, updates); }
export async function setDefaultGym(id: string) { return (await getStore()).setDefaultGym(id); }
export async function deleteGym(id: string, replacementGymId: string, activeWorkoutGymId?: string | null) { return (await getStore()).deleteGym(id, replacementGymId, activeWorkoutGymId); }
export async function getExerciseGymScopes() { return (await getStore()).getExerciseGymScopes(); }
export async function getExerciseGymScope(exerciseId: string) { return (await getStore()).getExerciseGymScope(exerciseId); }
export async function saveExerciseGymScope(scope: import('../types').ExerciseGymScope) { return (await getStore()).saveExerciseGymScope(scope); }
export async function deleteExerciseGymScope(exerciseId: string) { return (await getStore()).deleteExerciseGymScope(exerciseId); }

export async function getAllExercises(): Promise<Exercise[]> {
  const store = await getStore();
  return store.getAllExercises();
}

export async function searchExercises(query: string = '', muscle: string = 'All', equipment: string = 'All'): Promise<Exercise[]> {
  const store = await getStore();
  return store.searchExercises(query, muscle, equipment);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const store = await getStore();
  return store.getExerciseById(id);
}

export async function createCustomExercise(exercise: Omit<Exercise, 'id' | 'isCustom'>): Promise<Exercise> {
  const store = await getStore();
  return store.createCustomExercise(exercise);
}

export async function updateCustomExercise(
  id: string,
  updates: {
    name?: string;
    category?: string;
    equipment?: string;
    primaryMuscles?: string[];
    secondaryMuscles?: string[];
    instructions?: string[];
  }
): Promise<Exercise> {
  const store = await getStore();
  return store.updateCustomExercise(id, updates);
}

export async function getSetting(key: string): Promise<string | null> {
  const store = await getStore();
  return store.getSetting(key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  const store = await getStore();
  return store.setSetting(key, value);
}

export async function renameFolder(oldName: string, newName: string): Promise<void> {
  const store = await getStore();
  return store.renameFolder(oldName, newName);
}

export async function deleteFolder(name: string): Promise<void> {
  const store = await getStore();
  return store.deleteFolder(name);
}

export async function saveWorkoutDraft(workout: Workout, restTimer?: { endsAt: number; totalSeconds: number } | null): Promise<void> {
  const store = await getStore();
  const draft: WorkoutDraft = {
    version: 1,
    workout,
    savedAt: new Date().toISOString(),
    revision: Date.now(),
    restTimer: restTimer || null,
  };
  return store.saveDraft(draft);
}

export async function getWorkoutDraft(): Promise<Workout | null> {
  const store = await getStore();
  const draft = await store.getWorkoutDraft();
  return draft ? draft.workout : null;
}

export async function getWorkoutDrafts(): Promise<WorkoutDraft[]> {
  const store = await getStore();
  return store.getWorkoutDrafts();
}

export async function discardWorkoutDraft(id: string): Promise<void> {
  const store = await getStore();
  return store.discardDraft(id);
}
