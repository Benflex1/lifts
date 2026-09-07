import { Exercise, Routine } from '../types';

export const DEFAULT_EXERCISES: Exercise[] = require('./defaultExercises.json');

const exerciseMap = new Map<string, Exercise>();
for (const ex of DEFAULT_EXERCISES) {
  exerciseMap.set(ex.id, ex);
}

export function getBundledExercise(id: string): Exercise {
  const found = exerciseMap.get(id);
  if (!found) {
    throw new Error(`Bundled exercise with id "${id}" not found`);
  }
  return found;
}

export interface SeedRoutineDef {
  id: string;
  name: string;
  folderName: string;
  notes: string;
  exerciseIds: string[];
  targetSets: number;
  targetReps: string;
  restTimerSeconds: number;
}

export const SEED_ROUTINE_DEFS: SeedRoutineDef[] = [
  {
    id: 'routine-push-template',
    name: 'Push Day (Chest/Shoulders/Triceps)',
    folderName: 'PPL Split',
    notes: 'Classic push workout focusing on chest, anterior delts, and triceps.',
    exerciseIds: [
      'Barbell_Bench_Press_-_Medium_Grip',
      'Incline_Dumbbell_Press',
      'Standing_Military_Press',
      'Triceps_Pushdown',
    ],
    targetSets: 3,
    targetReps: '8-12',
    restTimerSeconds: 90,
  },
  {
    id: 'routine-pull-template',
    name: 'Pull Day (Back/Biceps)',
    folderName: 'PPL Split',
    notes: 'Focus on vertical and horizontal pulls with arm isolation.',
    exerciseIds: [
      'Barbell_Deadlift',
      'Wide-Grip_Lat_Pulldown',
      'Bent_Over_Barbell_Row',
      'Dumbbell_Bicep_Curl',
    ],
    targetSets: 3,
    targetReps: '8-12',
    restTimerSeconds: 90,
  },
  {
    id: 'routine-legs-template',
    name: 'Leg Day (Quads/Hamstrings/Calves)',
    folderName: 'PPL Split',
    notes: 'Complete lower body development.',
    exerciseIds: [
      'Barbell_Full_Squat',
      'Leg_Press',
      'Lying_Leg_Curls',
      'Standing_Calf_Raises',
    ],
    targetSets: 3,
    targetReps: '8-12',
    restTimerSeconds: 90,
  },
];

export function buildDefaultRoutines(): Routine[] {
  return SEED_ROUTINE_DEFS.map(def => ({
    id: def.id,
    name: def.name,
    folderName: def.folderName,
    notes: def.notes,
    createdAt: '2026-09-01T00:00:00.000Z',
    exercises: def.exerciseIds.map((exId, idx) => ({
      id: `re-${def.id}-${idx}`,
      exerciseId: exId,
      exercise: getBundledExercise(exId),
      orderIndex: idx,
      targetSets: def.targetSets,
      targetReps: def.targetReps,
      restTimerSeconds: def.restTimerSeconds,
    })),
  }));
}
