import { ActiveExercise, Exercise } from '../types';

export type ExerciseMoveDirection = -1 | 1;

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

  const updated = [...exercises];
  [updated[currentIndex], updated[targetIndex]] = [updated[targetIndex], updated[currentIndex]];
  return updated;
}

export function replaceActiveExercise(
  exercises: ActiveExercise[],
  activeExerciseId: string,
  replacement: Exercise
): ActiveExercise[] {
  return exercises.map(exercise => (
    exercise.id === activeExerciseId
      ? { ...exercise, exerciseId: replacement.id, exercise: replacement }
      : exercise
  ));
}
