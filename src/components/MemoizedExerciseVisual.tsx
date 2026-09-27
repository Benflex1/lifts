import React from 'react';
import { Exercise } from '../types';
import { ExerciseVisual as BaseExerciseVisual, ExerciseVisualProps } from './ExerciseVisual';

// Only the fields that influence the drawing; list rows often receive fresh-but-equal objects.
function sameVisualExercise(a: Exercise, b: Exercise): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.name === b.name &&
      a.category === b.category &&
      a.equipment === b.equipment &&
      a.primaryMuscles.join('|') === b.primaryMuscles.join('|') &&
      (a.secondaryMuscles || []).join('|') === (b.secondaryMuscles || []).join('|'))
  );
}

/**
 * Memoized exercise figure. The figure is the most expensive part of an exercise row and only
 * changes with the exercise or display options, not when a set in the same card is edited.
 * Screens import this; ExerciseVisual itself stays a plain component.
 */
export const ExerciseVisual = React.memo(
  BaseExerciseVisual,
  (prev: ExerciseVisualProps, next: ExerciseVisualProps) =>
    sameVisualExercise(prev.exercise, next.exercise) &&
    prev.size === next.size &&
    prev.accessibilityLabel === next.accessibilityLabel &&
    prev.animated === next.animated &&
    prev.frameIndex === next.frameIndex &&
    prev.onFrameChange === next.onFrameChange &&
    prev.intervalMs === next.intervalMs,
);
