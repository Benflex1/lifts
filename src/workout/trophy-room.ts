import { Exercise, ExerciseGymScope, Gym, Workout } from '../types';
import { calculate1RM } from '../utils/calculator';
import { getAllowedGymIds, resolveExerciseScope } from './gym-scope';
import { extractExercisePodium } from './pr';

export const MUSCLE_GROUP_MAP: Record<string, string[]> = {
  chest: ['chest', 'pectorals', 'pecs'],
  back: [
    'back',
    'lats',
    'lat',
    'middle back',
    'lower back',
    'traps',
    'trap',
    'rhomboids',
    'spine',
  ],
  legs: [
    'legs',
    'quadriceps',
    'quads',
    'quad',
    'hamstrings',
    'hamstring',
    'glutes',
    'glute',
    'calves',
    'calf',
    'adductors',
    'abductors',
    'thighs',
  ],
  shoulders: ['shoulders', 'delts', 'deltoids'],
  arms: ['arms', 'biceps', 'bicep', 'triceps', 'tricep', 'forearms', 'forearm'],
  core: ['core', 'abdominals', 'abs', 'obliques', 'waist'],
};

export function matchesCategory(
  record: { category: string; primaryMuscles: string[]; exerciseName: string },
  categoryFilter: string
): boolean {
  if (!categoryFilter || categoryFilter === 'all') return true;
  const filterLower = categoryFilter.toLowerCase();
  const targetMuscles = MUSCLE_GROUP_MAP[filterLower] || [filterLower];

  // 1. Check primaryMuscles array
  if (record.primaryMuscles && record.primaryMuscles.length > 0) {
    const hasMuscleMatch = record.primaryMuscles.some((m) => {
      const mLower = m.toLowerCase();
      return targetMuscles.some((t) => mLower.includes(t) || t.includes(mLower));
    });
    if (hasMuscleMatch) return true;
  }

  // 2. Check category field
  const catLower = (record.category || '').toLowerCase();
  if (targetMuscles.some((t) => catLower.includes(t) || t.includes(catLower))) {
    return true;
  }

  // 3. Fallback check on exercise name
  const nameLower = record.exerciseName.toLowerCase();
  if (targetMuscles.some((t) => nameLower.includes(t))) {
    return true;
  }

  return false;
}

export interface ExerciseRecordSummary {
  exerciseId: string;
  exerciseName: string;
  category: string;
  equipment: string;
  primaryMuscles: string[];
  bestWeight?: {
    value: number;
    reps: number;
    date: string;
    gymName?: string;
  };
  best1RM?: {
    value: number;
    date: string;
    gymName?: string;
  };
  bestVolume?: {
    value: number;
    weightKg: number;
    reps: number;
    date: string;
    gymName?: string;
  };
  bestReps?: {
    value: number;
    date: string;
    gymName?: string;
  };
}

export interface LiftHighlight {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  oneRMKg: number;
  date: string;
  gymName?: string;
}

export interface TrophyRoomSummary {
  totalGold: number;
  totalSilver: number;
  totalBronze: number;
  totalRecords: number;
  sbdTotalKg: number;
  sbdBreakdown: {
    squat?: LiftHighlight;
    bench?: LiftHighlight;
    deadlift?: LiftHighlight;
    overheadPress?: LiftHighlight;
  };
  records: ExerciseRecordSummary[];
}

export interface TrophyRoomOptions {
  selectedGymId?: string | null;
  categoryFilter?: string | null;
  searchQuery?: string;
}

/**
 * Builds all-time PR leaderboard data, medal counts, and SBD totals from workout history.
 */
export function buildTrophyRoomSummary(
  workouts: Workout[],
  allExercises: Exercise[],
  gyms: Gym[],
  gymTrackingEnabled: boolean,
  scopesByExercise?: Record<string, ExerciseGymScope | undefined>,
  options?: TrophyRoomOptions
): TrophyRoomSummary {
  const gymMap = new Map(gyms.map((g) => [g.id, g.name]));
  const exerciseMap = new Map(allExercises.map((e) => [e.id, e]));

  // 1. Build exercise-level records
  const recordsByExerciseId = new Map<string, ExerciseRecordSummary>();

  for (const w of workouts) {
    const gymName = gymMap.get(w.gymId);

    for (const ex of w.exercises) {
      const exerciseId = ex.exerciseId;
      const exerciseDef = exerciseMap.get(exerciseId) || ex.exercise;
      if (!exerciseDef) continue;

      const scope = scopesByExercise?.[exerciseId];
      const isGymSpecific =
        gymTrackingEnabled &&
        (resolveExerciseScope(exerciseDef, scope) === 'gym_specific' ||
          resolveExerciseScope(exerciseDef, scope) === 'linked_group');
      const allowedGymIds = getAllowedGymIds(exerciseDef, scope, w.gymId);

      // If user filtered by a gym and exercise is gym-specific, verify gym match
      if (options?.selectedGymId) {
        if (isGymSpecific) {
          if (!allowedGymIds || !allowedGymIds.has(options.selectedGymId)) {
            continue;
          }
        }
      }

      let summary = recordsByExerciseId.get(exerciseId);
      if (!summary) {
        summary = {
          exerciseId,
          exerciseName: exerciseDef.name,
          category: exerciseDef.category,
          equipment: exerciseDef.equipment,
          primaryMuscles: Array.isArray(exerciseDef.primaryMuscles) ? exerciseDef.primaryMuscles : [],
        };
        recordsByExerciseId.set(exerciseId, summary);
      }

      for (const s of ex.sets) {
        if (!s.isCompleted || s.type === 'warmup') continue;

        // Weight record
        if (s.weightKg > 0) {
          if (!summary.bestWeight || s.weightKg > summary.bestWeight.value) {
            summary.bestWeight = {
              value: s.weightKg,
              reps: s.reps,
              date: w.startTime,
              gymName,
            };
          }

          if (s.reps > 0) {
            // 1RM record
            const oneRM = calculate1RM(s.weightKg, s.reps).average;
            if (!summary.best1RM || oneRM > summary.best1RM.value) {
              summary.best1RM = {
                value: oneRM,
                date: w.startTime,
                gymName,
              };
            }

            // Set Volume record
            const volume = s.weightKg * s.reps;
            if (!summary.bestVolume || volume > summary.bestVolume.value) {
              summary.bestVolume = {
                value: volume,
                weightKg: s.weightKg,
                reps: s.reps,
                date: w.startTime,
                gymName,
              };
            }
          }
        } else if (s.reps > 0) {
          // Reps record for bodyweight
          if (!summary.bestReps || s.reps > summary.bestReps.value) {
            summary.bestReps = {
              value: s.reps,
              date: w.startTime,
              gymName,
            };
          }
        }
      }
    }
  }

  // 3. Detect Big 3 (Squat, Bench, Deadlift) and Overhead Press
  let bestSquat: LiftHighlight | undefined;
  let bestBench: LiftHighlight | undefined;
  let bestDeadlift: LiftHighlight | undefined;
  let bestOHP: LiftHighlight | undefined;

  for (const record of recordsByExerciseId.values()) {
    if (!record.bestWeight) continue;
    const nameLower = record.exerciseName.toLowerCase();
    const oneRM = record.best1RM?.value || record.bestWeight.value;

    const highlight: LiftHighlight = {
      exerciseId: record.exerciseId,
      exerciseName: record.exerciseName,
      weightKg: record.bestWeight.value,
      reps: record.bestWeight.reps,
      oneRMKg: oneRM,
      date: record.bestWeight.date,
      gymName: record.bestWeight.gymName,
    };

    // Squat matching
    if (nameLower.includes('squat') && !nameLower.includes('split') && !nameLower.includes('hack')) {
      if (!bestSquat || highlight.oneRMKg > bestSquat.oneRMKg) {
        bestSquat = highlight;
      }
    }
    // Bench matching
    else if (nameLower.includes('bench press') && (nameLower.includes('barbell') || !bestBench)) {
      if (!bestBench || highlight.oneRMKg > bestBench.oneRMKg) {
        bestBench = highlight;
      }
    }
    // Deadlift matching
    else if (nameLower.includes('deadlift') && !nameLower.includes('romanian') && !nameLower.includes('stiff')) {
      if (!bestDeadlift || highlight.oneRMKg > bestDeadlift.oneRMKg) {
        bestDeadlift = highlight;
      }
    }
    // Overhead press matching
    else if (nameLower.includes('overhead press') || nameLower.includes('military press') || nameLower.includes('shoulder press')) {
      if (!bestOHP || highlight.oneRMKg > bestOHP.oneRMKg) {
        bestOHP = highlight;
      }
    }
  }

  const sbdTotalKg = (bestSquat?.oneRMKg || 0) + (bestBench?.oneRMKg || 0) + (bestDeadlift?.oneRMKg || 0);

  // 3. Apply category, search, and presence filters
  let filteredRecords = Array.from(recordsByExerciseId.values());

  if (options?.categoryFilter && options.categoryFilter !== 'all') {
    filteredRecords = filteredRecords.filter((r) => matchesCategory(r, options.categoryFilter!));
  }

  if (options?.searchQuery && options.searchQuery.trim().length > 0) {
    const q = options.searchQuery.trim().toLowerCase();
    filteredRecords = filteredRecords.filter((r) => r.exerciseName.toLowerCase().includes(q));
  }

  // Sort by highest estimated 1RM / weight descending
  filteredRecords.sort((a, b) => {
    const aVal = a.best1RM?.value || a.bestWeight?.value || a.bestReps?.value || 0;
    const bVal = b.best1RM?.value || b.bestWeight?.value || b.bestReps?.value || 0;
    return bVal - aVal;
  });

  // 4. Compute medal counts based on podium collections of filtered exercises
  let totalGold = 0;
  let totalSilver = 0;
  let totalBronze = 0;

  for (const record of filteredRecords) {
    const exerciseDef = exerciseMap.get(record.exerciseId);
    const scope = scopesByExercise?.[record.exerciseId];
    const currentGymId = options?.selectedGymId || gyms[0]?.id || 'default-gym';
    const allowedGymIds = exerciseDef && gymTrackingEnabled
      ? getAllowedGymIds(exerciseDef, scope, currentGymId)
      : (options?.selectedGymId ? new Set([options.selectedGymId]) : null);

    const podium = extractExercisePodium(workouts, record.exerciseId, gyms, allowedGymIds);
    const primaryPodium = podium.weight.length > 0 ? podium.weight : podium.reps;

    if (primaryPodium.some((p) => p.rank === 1)) totalGold++;
    if (primaryPodium.some((p) => p.rank === 2)) totalSilver++;
    if (primaryPodium.some((p) => p.rank === 3)) totalBronze++;
  }

  return {
    totalGold,
    totalSilver,
    totalBronze,
    totalRecords: totalGold + totalSilver + totalBronze,
    sbdTotalKg,
    sbdBreakdown: {
      squat: bestSquat,
      bench: bestBench,
      deadlift: bestDeadlift,
      overheadPress: bestOHP,
    },
    records: filteredRecords,
  };
}
