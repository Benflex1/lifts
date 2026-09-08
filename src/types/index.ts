export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  isCustom?: boolean;
}

export interface WorkoutSet {
  id: string;
  setNumber: number;
  type: SetType;
  weightKg: number;
  reps: number;
  targetReps?: string;
  rpe?: number;
  isCompleted: boolean;
  completedAt?: string;
  previousWeightKg?: number;
  previousReps?: number;
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
}

export interface Workout {
  id: string;
  name: string;
  routineId?: string;
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
  startTime: string;
  endTime?: string;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  exerciseNames: string[];
  notes?: string;
}

export interface PlateCalculation {
  barWeight: number;
  targetWeight: number;
  weightPerSide: number;
  plates: { weight: number; count: number }[];
  remainder: number;
}
