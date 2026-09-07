import { Exercise, Routine, Workout, WorkoutHistorySummary, WorkoutSet } from '../types';

const defaultExercisesData: Exercise[] = require('./defaultExercises.json');

const webStorage = {
  exercises: [] as Exercise[],
  routines: [] as Routine[],
  workouts: [] as Workout[],
};

const webSettings = new Map<string, string>();

export async function initDatabase(): Promise<void> {
  // Load initial 300 exercises for snappy web preview
  webStorage.exercises = (defaultExercisesData as Exercise[]).slice(0, 300);

  // Default initial routines
  webStorage.routines = [
    {
      id: 'routine-push',
      name: 'Push Day (Chest / Shoulders / Triceps)',
      folderName: 'Push Pull Legs',
      notes: 'Focus on progressive overload on bench press.',
      createdAt: new Date().toISOString(),
      exercises: [
        {
          id: 're-1',
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          exercise: webStorage.exercises.find(e => e.name.toLowerCase().includes('bench')) || webStorage.exercises[0],
          orderIndex: 0,
          targetSets: 4,
          targetReps: '6-8',
          restTimerSeconds: 120,
        },
        {
          id: 're-2',
          exerciseId: 'Incline_Dumbbell_Press',
          exercise: webStorage.exercises.find(e => e.name.toLowerCase().includes('incline dumbbell')) || webStorage.exercises[1],
          orderIndex: 1,
          targetSets: 3,
          targetReps: '8-10',
          restTimerSeconds: 90,
        },
        {
          id: 're-3',
          exerciseId: 'Standing_Military_Press',
          exercise: webStorage.exercises.find(e => e.name.toLowerCase().includes('military press')) || webStorage.exercises[2],
          orderIndex: 2,
          targetSets: 3,
          targetReps: '8-10',
          restTimerSeconds: 120,
        },
      ],
    },
    {
      id: 'routine-pull',
      name: 'Pull Day (Back & Biceps)',
      folderName: 'Push Pull Legs',
      notes: 'Focus on controlled back contraction.',
      createdAt: new Date().toISOString(),
      exercises: [
        {
          id: 're-4',
          exerciseId: 'Barbell_Deadlift',
          exercise: webStorage.exercises.find(e => e.name.toLowerCase().includes('deadlift')) || webStorage.exercises[3],
          orderIndex: 0,
          targetSets: 3,
          targetReps: '5',
          restTimerSeconds: 180,
        },
        {
          id: 're-5',
          exerciseId: 'Pullups',
          exercise: webStorage.exercises.find(e => e.name.toLowerCase().includes('pullup')) || webStorage.exercises[4],
          orderIndex: 1,
          targetSets: 3,
          targetReps: '8-10',
          restTimerSeconds: 90,
        },
      ],
    },
    {
      id: 'routine-legs',
      name: 'Leg Day (Quads, Hamstrings & Calves)',
      folderName: 'Push Pull Legs',
      notes: 'Keep core braced throughout squats.',
      createdAt: new Date().toISOString(),
      exercises: [
        {
          id: 're-6',
          exerciseId: 'Barbell_Full_Squat',
          exercise: webStorage.exercises.find(e => e.name.toLowerCase().includes('squat')) || webStorage.exercises[5],
          orderIndex: 0,
          targetSets: 4,
          targetReps: '6-8',
          restTimerSeconds: 150,
        },
      ],
    },
    {
      id: 'routine-upper',
      name: 'Upper Body Power',
      folderName: 'Upper / Lower',
      notes: 'Heavy compounds for upper torso.',
      createdAt: new Date().toISOString(),
      exercises: [],
    },
    {
      id: 'routine-lower',
      name: 'Lower Body Strength',
      folderName: 'Upper / Lower',
      notes: 'Squats and hip hinges.',
      createdAt: new Date().toISOString(),
      exercises: [],
    },
  ];
}

import { smartSearchExercises } from '../utils/search';

export async function searchExercises(query: string, muscle?: string, equipment?: string): Promise<Exercise[]> {
  return smartSearchExercises(webStorage.exercises, query, muscle, equipment);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  return webStorage.exercises.find(e => e.id === id) || null;
}

export async function createCustomExercise(exercise: Omit<Exercise, 'id' | 'isCustom'>): Promise<Exercise> {
  const newId = `custom-${Date.now()}`;
  const customExercise: Exercise = {
    ...exercise,
    id: newId,
    isCustom: true,
  };
  webStorage.exercises.unshift(customExercise);
  return customExercise;
}

export async function getRoutines(): Promise<Routine[]> {
  return webStorage.routines;
}

export async function saveRoutine(
  name: string,
  folderName: string,
  exercises: { exerciseId: string; targetSets: number; targetReps: string; restTimerSeconds: number }[],
  notes?: string,
  existingId?: string
): Promise<string> {
  const routineId = existingId || `routine-${Date.now()}`;
  const routine: Routine = {
    id: routineId,
    name,
    folderName,
    notes,
    createdAt: new Date().toISOString(),
    exercises: exercises.map((item, idx) => ({
      id: `re-${routineId}-${idx}`,
      exerciseId: item.exerciseId,
      exercise: webStorage.exercises.find(e => e.id === item.exerciseId) || webStorage.exercises[0],
      orderIndex: idx,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
      restTimerSeconds: item.restTimerSeconds,
    })),
  };

  if (existingId) {
    const idx = webStorage.routines.findIndex(r => r.id === existingId);
    if (idx >= 0) webStorage.routines[idx] = routine;
    else webStorage.routines.unshift(routine);
  } else {
    webStorage.routines.unshift(routine);
  }

  return routineId;
}

export async function deleteRoutine(id: string): Promise<void> {
  webStorage.routines = webStorage.routines.filter(r => r.id !== id);
}

export async function saveCompletedWorkout(workout: Workout): Promise<void> {
  webStorage.workouts.unshift(workout);
  if (workout.routineId) {
    const r = webStorage.routines.find(rt => rt.id === workout.routineId);
    if (r) r.lastPerformedAt = workout.endTime || workout.startTime;
  }
}

export async function getWorkoutHistory(): Promise<WorkoutHistorySummary[]> {
  return webStorage.workouts.map(w => ({
    id: w.id,
    name: w.name,
    routineId: w.routineId,
    startTime: w.startTime,
    endTime: w.endTime,
    durationSeconds: w.durationSeconds,
    totalVolumeKg: w.totalVolumeKg,
    totalSets: w.exercises.reduce((acc, e) => acc + e.sets.filter(s => s.isCompleted).length, 0),
    exerciseNames: w.exercises.map(e => e.exercise.name),
    notes: w.notes,
  }));
}

export async function getPreviousSetsForExercise(exerciseId: string): Promise<WorkoutSet[]> {
  for (const w of webStorage.workouts) {
    const found = w.exercises.find(e => e.exerciseId === exerciseId);
    if (found) {
      return found.sets.filter(s => s.isCompleted);
    }
  }
  return [];
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  webStorage.workouts = webStorage.workouts.filter(w => w.id !== workoutId);
}

export async function getWorkoutDetail(workoutId: string): Promise<Workout | null> {
  return webStorage.workouts.find(w => w.id === workoutId) || null;
}

export async function duplicateRoutine(routineId: string): Promise<string> {
  const original = webStorage.routines.find(r => r.id === routineId);
  if (!original) throw new Error('Routine not found');
  const newId = `routine-${Date.now()}`;
  const duplicated: Routine = {
    ...original,
    id: newId,
    name: `${original.name} (Copy)`,
    createdAt: new Date().toISOString(),
    exercises: original.exercises.map((e, idx) => ({
      ...e,
      id: `re-${newId}-${idx}`,
    })),
  };
  webStorage.routines.unshift(duplicated);
  return newId;
}

export async function getExerciseStats(exerciseId: string): Promise<{
  maxWeightKg: number;
  maxReps: number;
  estimated1RM: number;
  sessionCount: number;
}> {
  let maxWeightKg = 0;
  let maxReps = 0;
  let estimated1RM = 0;
  let sessionCount = 0;

  for (const w of webStorage.workouts) {
    const ex = w.exercises.find(e => e.exerciseId === exerciseId);
    if (ex) {
      sessionCount++;
      for (const s of ex.sets) {
        if (s.isCompleted) {
          if (s.weightKg > maxWeightKg) {
            maxWeightKg = s.weightKg;
          }
          if (s.reps > maxReps) {
            maxReps = s.reps;
          }
          const epley = Math.round(s.weightKg * (1 + s.reps / 30));
          if (epley > estimated1RM) {
            estimated1RM = epley;
          }
        }
      }
    }
  }

  return { maxWeightKg, maxReps, estimated1RM, sessionCount };
}

export async function getSetting(key: string): Promise<string | null> {
  return webSettings.get(key) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  webSettings.set(key, value);
}

export async function renameFolder(oldName: string, newName: string): Promise<void> {
  for (const r of webStorage.routines) {
    if (r.folderName === oldName) r.folderName = newName;
  }
}

export async function deleteFolder(name: string): Promise<void> {
  for (const r of webStorage.routines) {
    if (r.folderName === name) r.folderName = undefined;
  }
}
