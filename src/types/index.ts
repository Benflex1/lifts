export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

// What a set records. Weight × reps unless the user turns on tracking types in Settings.
export type TrackingType =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'weighted_bodyweight' // weightKg is the added load
  | 'assisted_bodyweight' // weightKg is the assistance
  | 'duration'
  | 'distance_duration';

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  instructionUrl?: string;
  instructionUrlType?: 'website' | 'youtube';
  isCustom?: boolean;
}

export interface Gym {
  id: string;
  name: string;
  isDefault: boolean;
  color: string;
  createdAt: string;
}

export type ExerciseScopeType = 'global' | 'gym_specific' | 'linked_group';

export interface ExerciseGymScope {
  exerciseId: string;
  scopeType: ExerciseScopeType;
  linkedGymIds?: string[];
}

export interface PreviousSetSuggestion {
  weightKg: number;
  reps: number;
  durationSeconds?: number;
  distanceM?: number;
  sourceGymId?: string;
  sourceGymName?: string;
}

export interface WorkoutSet {
  id: string;
  setNumber: number;
  type: SetType;
  weightKg: number;
  reps: number;
  durationSeconds?: number;
  distanceM?: number;
  targetReps?: string;
  rpe?: number;
  isCompleted: boolean;
  completedAt?: string;
  previousWeightKg?: number;
  previousReps?: number;
  previousDurationSeconds?: number;
  previousDistanceM?: number;
  previousGymId?: string;
  previousGymName?: string;
  isWeightEdited?: boolean;
}

export interface ActiveExercise {
  id: string; // unique instance id within workout
  exerciseId: string;
  exercise: Exercise;
  sets: WorkoutSet[];
  notes?: string;
  targetReps?: string;
  restTimerSeconds: number;
  supersetId?: string;
  trackingType?: TrackingType; // absent means weight_reps
}

export interface Workout {
  id: string;
  name: string;
  routineId?: string;
  gymId: string;
  startTime: string;
  endTime?: string;
  durationSeconds: number;
  totalVolumeKg: number;
  exercises: ActiveExercise[];
  notes?: string;
}

export interface RoutineExercise {
  id: string;
  exerciseId: string;
  exercise: Exercise;
  orderIndex: number;
  targetSets: number;
  targetReps: string;
  restTimerSeconds: number;
  supersetId?: string;
}

export interface Routine {
  id: string;
  name: string;
  folderName?: string;
  exercises: RoutineExercise[];
  notes?: string;
  lastPerformedAt?: string;
  createdAt: string;
}

export interface WorkoutHistorySummary {
  id: string;
  name: string;
  routineId?: string;
  gymId: string;
  startTime: string;
  endTime?: string;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  exerciseNames: string[];
  notes?: string;
  hasSupersets?: boolean;
}

export interface ExerciseStats {
  maxWeightKg: number;
  maxSetVolumeKg: number;
  maxReps: number;
  estimated1RM: number;
  sessionCount: number;
}

export interface DualExerciseStats {
  global: ExerciseStats;
  gym: ExerciseStats;
}

export interface PlateCalculation {
  barWeight: number;
  targetWeight: number;
  weightPerSide: number;
  plates: { weight: number; count: number }[];
  remainder: number;
}
