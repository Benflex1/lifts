import {
  DualExerciseStats,
  Exercise,
  ExerciseGymScope,
  Gym,
  PreviousSetSuggestion,
  Routine,
  Workout,
  WorkoutHistorySummary,
} from '../types';

export interface WorkoutDraft {
  version: 1;
  workout: Workout;
  savedAt: string;
  revision: number;
  restTimer: { endsAt: number; totalSeconds: number } | null;
}

export interface DataSnapshot {
  workouts: Workout[];
  routines: Routine[];
  exercises: Exercise[];
  drafts: WorkoutDraft[];
  settings: Record<string, string>;
  gyms: Gym[];
  exerciseGymScopes: ExerciseGymScope[];
}

export interface Store {
  init(): Promise<void>;
  isReadOnly?(): boolean;
  tryAcquireLease?(): Promise<boolean>;
  onReadOnlyChange?(listener: (isReadOnly: boolean) => void): () => void;
  readSnapshot(): Promise<DataSnapshot>;
  saveDraft(draft: WorkoutDraft): Promise<void>;
  getWorkoutDrafts(): Promise<WorkoutDraft[]>;
  getWorkoutDraft(id?: string): Promise<WorkoutDraft | null>;
  finishWorkout(workout: Workout): Promise<void>;
  discardDraft(id: string): Promise<void>;
  mergeSnapshot(snapshot: DataSnapshot): Promise<void>;

  getRoutines(): Promise<Routine[]>;
  saveRoutine(
    name: string,
    folderName: string,
    exercises: { exerciseId: string; targetSets: number; targetReps: string; restTimerSeconds: number }[],
    notes?: string,
    existingId?: string
  ): Promise<string>;
  deleteRoutine(id: string): Promise<void>;
  duplicateRoutine(id: string): Promise<string>;
  getRoutineById(id: string): Promise<Routine | null>;

  saveCompletedWorkout(workout: Workout): Promise<void>;
  getWorkoutHistory(): Promise<WorkoutHistorySummary[]>;
  getWorkoutDetail(workoutId: string): Promise<Workout | null>;
  deleteWorkout(workoutId: string): Promise<void>;
  getGyms(): Promise<Gym[]>;
  getDefaultGym(): Promise<Gym>;
  createGym(name: string, color?: string): Promise<Gym>;
  updateGym(id: string, updates: { name?: string; color?: string }): Promise<Gym>;
  setDefaultGym(id: string): Promise<void>;
  deleteGym(id: string, replacementGymId: string, activeWorkoutGymId?: string | null): Promise<void>;
  getExerciseGymScopes(): Promise<ExerciseGymScope[]>;
  getExerciseGymScope(exerciseId: string): Promise<ExerciseGymScope | null>;
  saveExerciseGymScope(scope: ExerciseGymScope): Promise<void>;
  deleteExerciseGymScope(exerciseId: string): Promise<void>;
  getPreviousSetsForExercise(
    exerciseId: string,
    occurrenceIndex?: number,
    currentGymId?: string,
  ): Promise<PreviousSetSuggestion[]>;
  getCompletedWorkoutsForExercise(exerciseId: string): Promise<Workout[]>;
  getExerciseStats(exerciseId: string, currentGymId?: string): Promise<DualExerciseStats>;

  getAllExercises(): Promise<Exercise[]>;
  searchExercises(query?: string, muscle?: string, equipment?: string): Promise<Exercise[]>;
  getExerciseById(id: string): Promise<Exercise | null>;
  createCustomExercise(exercise: Omit<Exercise, 'id' | 'isCustom'>): Promise<Exercise>;
  updateCustomExercise(
    id: string,
    updates: {
      name?: string;
      category?: string;
      equipment?: string;
      primaryMuscles?: string[];
      secondaryMuscles?: string[];
      instructions?: string[];
    }
  ): Promise<Exercise>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  renameFolder(oldName: string, newName: string): Promise<void>;
  deleteFolder(name: string): Promise<void>;

}
