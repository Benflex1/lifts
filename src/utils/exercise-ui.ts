import { Exercise } from '../types';
import { ExerciseVisualDescriptor, getExerciseVisual } from './exercise-media';
import { ExerciseInstructionLink, getExerciseInstructionLink } from './exercise-links';

export interface ExerciseRowViewModel {
  visual: ExerciseVisualDescriptor;
  visualAccessibilityLabel: string;
}

export interface ExerciseFormGuideViewModel {
  link: ExerciseInstructionLink;
  label: string;
}

export function getExerciseRowViewModel(exercise: Exercise): ExerciseRowViewModel {
  const visual = getExerciseVisual(exercise);
  return {
    visual,
    visualAccessibilityLabel: visual.alt,
  };
}

export function getExerciseFormGuideViewModel(exercise: Exercise): ExerciseFormGuideViewModel {
  const link = getExerciseInstructionLink(exercise);
  return {
    link,
    label: link.label,
  };
}
