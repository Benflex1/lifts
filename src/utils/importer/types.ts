import { DataSnapshot } from '../../database/contract';
import { Exercise, SetType, Workout } from '../../types';

export type DetectedTrackerFormat = 'hevy' | 'strong' | 'lyfta' | 'fitnotes' | 'generic';

export interface RawCsvSetRow {
  workoutName: string;
  dateStr: string;
  startTimeStr?: string;
  endTimeStr?: string;
  durationStr?: string;
  exerciseName: string;
  category?: string;
  setIndex?: number;
  setType?: string;
  weightStr?: string;
  weightUnit?: string;
  repsStr?: string;
  rpeStr?: string;
  exerciseNotes?: string;
  workoutNotes?: string;
}

export interface ParsedSet {
  setNumber: number;
  type: SetType;
  weightKg: number;
  reps: number;
  rpe?: number;
  isCompleted: boolean;
  notes?: string;
}

export interface ParsedExerciseGroup {
  rawName: string;
  matchedExercise: Exercise;
  notes?: string;
  sets: ParsedSet[];
}

export interface ParsedWorkoutSession {
  name: string;
  startTime: string; // ISO 8601
  endTime?: string;  // ISO 8601
  durationSeconds: number;
  notes?: string;
  exerciseGroups: ParsedExerciseGroup[];
}

export interface ExerciseAssignmentItem {
  rawName: string;
  workoutCount: number;
  setCount: number;
  assignedExercise: Exercise;
  isCustom: boolean;
  isAutoMatched: boolean;
  confidence: 'exact' | 'alias' | 'fuzzy' | 'custom' | 'manual';
}

export interface CsvImportOptions {
  targetGymId: string;
  skipExistingWorkouts?: boolean;
  defaultUnit?: 'kg' | 'lb';
  exerciseOverrides?: Record<string, Exercise>;
}

export interface CsvImportPreview {
  detectedFormat: DetectedTrackerFormat;
  formatLabel: string;
  totalWorkouts: number;
  totalSets: number;
  newWorkoutsCount: number;
  duplicateWorkoutsCount: number;
  matchedExercisesCount: number;
  newCustomExercisesCount: number;
  exerciseAssignments: ExerciseAssignmentItem[];
  dateRange: {
    start: string;
    end: string;
  } | null;
  sampleWorkouts: Array<{
    name: string;
    date: string;
    exerciseCount: number;
    setCount: number;
    volumeKg: number;
  }>;
  snapshotToMerge: DataSnapshot;
  warnings: string[];
}
