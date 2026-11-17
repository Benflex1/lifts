import { ActiveExercise, Workout, WorkoutSet } from '../types';
import {
  DEFAULT_TRACKING_TYPE,
  getTrackingType,
  validateTrackedSet,
  workoutVolumeKg,
} from './tracking';

export interface WorkoutSetEdit {
  exerciseId: string;
  setId: string;
  weightKg: number;
  reps: number;
}

export interface WorkoutEdits {
  name?: string;
  notes?: string;
  gymId?: string;
  durationSeconds?: number;
  startTime?: string;
  endTime?: string;
  exercises?: ActiveExercise[];
  sets?: WorkoutSetEdit[];
}

function validateSetEdit(edit: WorkoutSetEdit | WorkoutSet): void {
  if (!Number.isFinite(edit.weightKg)) {
    throw new Error('Weight must be a valid number');
  }
  if (edit.weightKg < 0) {
    throw new Error('Weight cannot be negative');
  }
  if (!Number.isFinite(edit.reps)) {
    throw new Error('Reps must be a valid number');
  }
  if (!Number.isInteger(edit.reps)) {
    throw new Error('Reps must be a whole number');
  }
  if (edit.reps <= 0) {
    throw new Error('Reps must be greater than 0');
  }
}

export function applyWorkoutEdits(workout: Workout, edits: WorkoutEdits): Workout {
  const nextName = edits.name === undefined ? workout.name : edits.name.trim();
  if (!nextName) {
    throw new Error('Workout name cannot be empty');
  }

  const nextGymId = edits.gymId === undefined ? workout.gymId : edits.gymId.trim();
  if (!nextGymId) {
    throw new Error('Gym ID cannot be empty');
  }

  if (edits.durationSeconds !== undefined) {
    if (!Number.isFinite(edits.durationSeconds) || edits.durationSeconds < 0) {
      throw new Error('Duration must be a positive number');
    }
  }

  if (edits.startTime !== undefined) {
    const time = new Date(edits.startTime).getTime();
    if (!Number.isFinite(time)) {
      throw new Error('Start time must be a valid date');
    }
  }

  if (edits.endTime !== undefined) {
    const time = new Date(edits.endTime).getTime();
    if (!Number.isFinite(time)) {
      throw new Error('End time must be a valid date');
    }
  }

  let exercises: ActiveExercise[];

  if (edits.exercises) {
    for (const ex of edits.exercises) {
      const trackingType = getTrackingType(ex);
      for (const set of ex.sets) {
        if (set.isCompleted) {
          if (trackingType === DEFAULT_TRACKING_TYPE) {
            validateSetEdit(set);
          } else {
            const error = validateTrackedSet(set, trackingType);
            if (error) throw new Error(error);
          }
        } else {
          // Guard incomplete sets against NaN or invalid numbers to protect persistence
          if (!Number.isFinite(set.weightKg) || set.weightKg < 0) {
            set.weightKg = 0;
          }
          if (!Number.isFinite(set.reps) || set.reps < 0 || !Number.isInteger(set.reps)) {
            set.reps = 0;
          }
        }
      }
    }
    exercises = edits.exercises;
  } else {
    const setEdits = edits.sets || [];
    for (const edit of setEdits) {
      validateSetEdit(edit);

      const exercise = workout.exercises.find(item => item.exerciseId === edit.exerciseId);
      if (!exercise) {
        throw new Error(`Exercise ${edit.exerciseId} was not found`);
      }

      const set = exercise.sets.find(item => item.id === edit.setId);
      if (!set) {
        throw new Error(`Set ${edit.exerciseId}/${edit.setId} was not found`);
      }
    }

    exercises = workout.exercises.map(exercise => ({
      ...exercise,
      sets: exercise.sets.map(set => {
        const edit = setEdits.find(
          item => item.exerciseId === exercise.exerciseId && item.setId === set.id,
        );
        if (!edit) return set;

        return {
          ...set,
          weightKg: edit.weightKg,
          reps: edit.reps,
          isWeightEdited: true,
        };
      }),
    }));
  }

  const totalVolumeKg = workoutVolumeKg(exercises);

  const nextDuration =
    edits.durationSeconds !== undefined
      ? Math.max(0, Math.floor(edits.durationSeconds))
      : workout.durationSeconds;

  const nextStartTime = edits.startTime || workout.startTime;
  let nextEndTime = edits.endTime !== undefined ? edits.endTime : workout.endTime;
  if (edits.durationSeconds !== undefined && edits.endTime === undefined && nextStartTime) {
    nextEndTime = new Date(new Date(nextStartTime).getTime() + nextDuration * 1000).toISOString();
  }

  return {
    ...workout,
    name: nextName,
    notes: edits.notes === undefined ? workout.notes : edits.notes.trim() || undefined,
    gymId: nextGymId,
    durationSeconds: nextDuration,
    startTime: nextStartTime,
    endTime: nextEndTime,
    exercises,
    totalVolumeKg,
  };
}

export function reassignWorkoutGym(workout: Workout, gymId: string): Workout {
  return applyWorkoutEdits(workout, {
    gymId,
    sets: [],
  });
}

/** Local calendar date of an ISO timestamp as YYYY-MM-DD. */
export function toLocalDateInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Adds (or subtracts) whole calendar days to a YYYY-MM-DD string. Returns null if invalid. */
export function shiftDateInput(value: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return toLocalDateInput(d.toISOString());
}

/**
 * Moves a workout start time to another local calendar day (YYYY-MM-DD), keeping the time of day.
 * Throws on malformed dates, non-existent dates (e.g. 2026-02-30) and dates in the future.
 */
export function moveStartTimeToDate(
  startTime: string,
  dateInput: string,
  now: Date = new Date(),
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.trim());
  if (!match) throw new Error('Date must be in YYYY-MM-DD format');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const original = new Date(startTime);
  if (!Number.isFinite(original.getTime())) throw new Error('Start time must be a valid date');
  const moved = new Date(
    year,
    month - 1,
    day,
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds(),
  );
  if (moved.getFullYear() !== year || moved.getMonth() !== month - 1 || moved.getDate() !== day) {
    throw new Error('That date does not exist');
  }
  if (moved.getTime() > now.getTime()) throw new Error('Workout date cannot be in the future');
  return moved.toISOString();
}
