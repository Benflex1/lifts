import { ActiveExercise, Exercise, PreviousSetSuggestion, WorkoutSet } from '../types';

export type ExerciseMoveDirection = -1 | 1;

export interface ExerciseLayout {
  y: number;
  height: number;
}

export function moveActiveExerciseToIndex(
  exercises: ActiveExercise[],
  activeExerciseId: string,
  targetIndex: number
): ActiveExercise[] {
  const currentIndex = exercises.findIndex(exercise => exercise.id === activeExerciseId);

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= exercises.length ||
    currentIndex === targetIndex
  ) {
    return exercises;
  }

  const updated = [...exercises];
  const [moved] = updated.splice(currentIndex, 1);
  updated.splice(targetIndex, 0, moved);
  return updated;
}

export function moveActiveExercise(
  exercises: ActiveExercise[],
  activeExerciseId: string,
  direction: ExerciseMoveDirection
): ActiveExercise[] {
  const currentIndex = exercises.findIndex(exercise => exercise.id === activeExerciseId);
  const targetIndex = currentIndex + direction;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= exercises.length) {
    return exercises;
  }

  return moveActiveExerciseToIndex(exercises, activeExerciseId, targetIndex);
}

export function getExerciseDropIndex(
  exerciseIds: string[],
  layouts: Record<string, ExerciseLayout>,
  activeExerciseId: string,
  deltaY: number
): number {
  const currentIndex = exerciseIds.indexOf(activeExerciseId);
  const currentLayout = layouts[activeExerciseId];

  if (currentIndex < 0 || !currentLayout) {
    return currentIndex;
  }

  const draggedCenter = currentLayout.y + currentLayout.height / 2 + deltaY;
  let targetIndex = currentIndex;

  if (deltaY > 0) {
    for (let index = currentIndex + 1; index < exerciseIds.length; index++) {
      const layout = layouts[exerciseIds[index]];
      if (layout && draggedCenter > layout.y + layout.height / 2) {
        targetIndex = index;
      }
    }
  } else if (deltaY < 0) {
    for (let index = currentIndex - 1; index >= 0; index--) {
      const layout = layouts[exerciseIds[index]];
      if (layout && draggedCenter < layout.y + layout.height / 2) {
        targetIndex = index;
      }
    }
  }

  return targetIndex;
}

export function replaceActiveExercise(
  exercises: ActiveExercise[],
  activeExerciseId: string,
  replacement: Exercise,
  suggestions?: PreviousSetSuggestion[],
  currentGymId?: string,
): ActiveExercise[] {
  return exercises.map(exercise => {
    if (exercise.id !== activeExerciseId) return exercise;

    if (!suggestions) {
      return { ...exercise, exerciseId: replacement.id, exercise: replacement };
    }

    const updatedSets: WorkoutSet[] = exercise.sets.map((set, idx) => {
      if (set.isCompleted) return set;
      const ghost = suggestions[idx] ?? (suggestions.length > 0 ? suggestions[suggestions.length - 1] : undefined);
      const isSameGym = Boolean(currentGymId && ghost?.sourceGymId === currentGymId);
      return {
        ...set,
        weightKg: 0,
        reps: 0,
        isWeightEdited: false,
        previousWeightKg: ghost ? ghost.weightKg : undefined,
        previousReps: ghost ? ghost.reps : undefined,
        previousGymId: isSameGym ? undefined : ghost?.sourceGymId,
        previousGymName: isSameGym ? undefined : ghost?.sourceGymName,
      };
    });

    return {
      ...exercise,
      exerciseId: replacement.id,
      exercise: replacement,
      sets: updatedSets,
    };
  });
}

