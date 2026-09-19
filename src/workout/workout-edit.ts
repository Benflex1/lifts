import { ActiveExercise, Workout, WorkoutSet } from '../types';

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
      for (const set of ex.sets) {
        if (set.isCompleted) {
          validateSetEdit(set);
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
        const edit = setEdits.find(item => item.exerciseId === exercise.exerciseId && item.setId === set.id);
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

  const totalVolumeKg = exercises.reduce(
    (workoutVolume, exercise) => workoutVolume + exercise.sets.reduce(
      (exerciseVolume, set) => exerciseVolume + (set.isCompleted ? set.weightKg * set.reps : 0),
      0
    ),
    0
  );

  const nextDuration = edits.durationSeconds !== undefined
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
