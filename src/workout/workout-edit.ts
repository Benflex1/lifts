import { Workout } from '../types';

export interface WorkoutSetEdit {
  exerciseId: string;
  setId: string;
  weightKg: number;
  reps: number;
}

export interface WorkoutEdits {
  name?: string;
  notes?: string;
  sets: WorkoutSetEdit[];
}

function validateSetEdit(edit: WorkoutSetEdit): void {
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

  for (const edit of edits.sets) {
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

  const exercises = workout.exercises.map(exercise => ({
    ...exercise,
    sets: exercise.sets.map(set => {
      const edit = edits.sets.find(item => item.exerciseId === exercise.exerciseId && item.setId === set.id);
      if (!edit) return set;

      return {
        ...set,
        weightKg: edit.weightKg,
        reps: edit.reps,
        isWeightEdited: true,
      };
    }),
  }));

  const totalVolumeKg = exercises.reduce(
    (workoutVolume, exercise) => workoutVolume + exercise.sets.reduce(
      (exerciseVolume, set) => exerciseVolume + (set.isCompleted ? set.weightKg * set.reps : 0),
      0
    ),
    0
  );

  return {
    ...workout,
    name: nextName,
    notes: edits.notes === undefined ? workout.notes : edits.notes.trim() || undefined,
    exercises,
    totalVolumeKg,
  };
}
