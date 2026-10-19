import { Exercise } from '../types';

/**
 * Shared exercise-catalog filter and custom-exercise option lists. The
 * Exercises screen and the exercise picker render the same filters, so the
 * constants and alias normalization live here to keep them in sync (ARCH-05).
 */
export const MUSCLE_GROUPS = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quadriceps',
  'Hamstrings',
  'Glutes',
  'Abdominals',
  'Calves',
];

export const EQUIPMENT_LIST = ['All', 'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Body Only'];

export const CUSTOM_MUSCLE_OPTIONS = MUSCLE_GROUPS.filter(m => m !== 'All');

export const CUSTOM_EQUIPMENT_OPTIONS = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight'];

export const MUSCLE_ALIAS_MAP: Record<string, string> = {
  lats: 'Back',
  lat: 'Back',
  traps: 'Back',
  trap: 'Back',
  rhomboids: 'Back',
  lower_back: 'Back',
  'lower back': 'Back',
  quads: 'Quadriceps',
  quad: 'Quadriceps',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  hamstring: 'Hamstrings',
  glutes: 'Glutes',
  glute: 'Glutes',
  abs: 'Abdominals',
  core: 'Abdominals',
  abdominals: 'Abdominals',
  calves: 'Calves',
  calf: 'Calves',
  chest: 'Chest',
  pectorals: 'Chest',
  shoulders: 'Shoulders',
  delts: 'Shoulders',
  deltoids: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
};

export const EQUIPMENT_ALIAS_MAP: Record<string, string> = {
  barbell: 'Barbell',
  bb: 'Barbell',
  dumbbell: 'Dumbbell',
  db: 'Dumbbell',
  machine: 'Machine',
  'smith machine': 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  'body weight': 'Bodyweight',
  'body only': 'Bodyweight',
  body: 'Bodyweight',
  kettlebell: 'Dumbbell',
  bands: 'Cable',
  band: 'Cable',
};

/** Maps a stored primary muscle onto one of the custom-exercise pill options. */
export function resolveCustomMuscle(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  return (
    CUSTOM_MUSCLE_OPTIONS.find(m => m.toLowerCase() === normalized) ||
    MUSCLE_ALIAS_MAP[normalized] ||
    'Chest'
  );
}

/** Maps a stored equipment value onto one of the custom-exercise pill options. */
export function resolveCustomEquipment(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  return (
    CUSTOM_EQUIPMENT_OPTIONS.find(eq => eq.toLowerCase() === normalized) ||
    EQUIPMENT_ALIAS_MAP[normalized] ||
    (['kettlebell', 'db'].some(k => normalized.includes(k))
      ? 'Dumbbell'
      : normalized.includes('body')
        ? 'Bodyweight'
        : normalized.includes('cable') || normalized.includes('band')
          ? 'Cable'
          : normalized.includes('smith') || normalized.includes('machine')
            ? 'Machine'
            : 'Barbell')
  );
}

/** Prefills the custom-exercise form from an existing exercise. */
export function customExerciseDefaults(exercise: Exercise | null): {
  name: string;
  muscle: string;
  equipment: string;
} {
  if (!exercise) {
    return { name: '', muscle: 'Chest', equipment: 'Barbell' };
  }
  return {
    name: exercise.name,
    muscle: resolveCustomMuscle(exercise.primaryMuscles?.[0] || ''),
    equipment: resolveCustomEquipment(exercise.equipment || ''),
  };
}
