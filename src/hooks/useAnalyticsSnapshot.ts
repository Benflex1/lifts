import { useEffect, useRef, useState } from 'react';
import { Exercise, ExerciseGymScope, Gym, Workout } from '../types';
import { getStore } from '../database/db';
import {
  MuscleFrequencyPoint,
  WeeklyVolumePoint,
  buildMuscleFrequency,
  buildWeeklyVolume,
} from '../workout/analytics';
import { reportError } from '../utils/errorReporting';
import { useReloadOnActivate } from './useReloadOnActivate';

/**
 * ARCH-06 domain hook: owns the analytics snapshot (workouts, catalog, gyms,
 * scopes) and the first-pass derived aggregates. `reload` is revision-gated so
 * an unchanged store skips the whole hydration pass.
 */
export interface AnalyticsSnapshotQuery {
  /** True only until the first load settles. */
  loading: boolean;
  workouts: Workout[];
  gyms: Gym[];
  exercises: Exercise[];
  scopes: Record<string, ExerciseGymScope | undefined>;
  hasWorkoutData: boolean;
  weeklyVolume: WeeklyVolumePoint[];
  muscleFrequency: MuscleFrequencyPoint[];
  /** First completed exercise in the newest workout; drives the initial selection. */
  suggestedProgressionExerciseId: string | null;
  reload: (options?: { skipIfUnchanged?: boolean }) => Promise<void>;
}

export function useAnalyticsSnapshot(): AnalyticsSnapshotQuery {
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [scopes, setScopes] = useState<Record<string, ExerciseGymScope | undefined>>({});
  const [hasWorkoutData, setHasWorkoutData] = useState(false);
  const [weeklyVolume, setWeeklyVolume] = useState<WeeklyVolumePoint[]>([]);
  const [muscleFrequency, setMuscleFrequency] = useState<MuscleFrequencyPoint[]>([]);
  const [suggestedProgressionExerciseId, setSuggestedProgressionExerciseId] = useState<
    string | null
  >(null);
  const revisionRef = useRef<number | null>(null);

  const reload = async ({ skipIfUnchanged = false }: { skipIfUnchanged?: boolean } = {}) => {
    try {
      const store = await getStore();

      // Cheap revision check first: with no writes since the last load there is
      // nothing to recompute, so return before hydrating the snapshot. Stores
      // without a revision counter always reload.
      const revision = (await store.getDataRevision?.()) ?? null;
      if (skipIfUnchanged && revision !== null && revision === revisionRef.current) {
        return;
      }
      revisionRef.current = revision;

      const snapshot = await store.readSnapshot();

      const workoutList: Workout[] = snapshot.workouts || [];
      const gymList: Gym[] = snapshot.gyms || [];
      // The snapshot already carries the exercise catalog; no second full read.
      const exerciseList = snapshot.exercises;

      setWorkouts(workoutList);
      setGyms(gymList);
      setExercises(exerciseList);

      const scopesMap: Record<string, ExerciseGymScope | undefined> = {};
      (snapshot.exerciseGymScopes || []).forEach(s => {
        scopesMap[s.exerciseId] = s;
      });
      setScopes(scopesMap);

      setHasWorkoutData(workoutList.length > 0);
      setWeeklyVolume(buildWeeklyVolume(workoutList));
      setMuscleFrequency(buildMuscleFrequency(workoutList, { exerciseCatalog: exerciseList }));

      let foundExerciseId: string | null = null;
      for (const w of workoutList) {
        for (const ex of w.exercises || []) {
          if ((ex.sets || []).some(s => s.isCompleted)) {
            foundExerciseId = ex.exerciseId;
            break;
          }
        }
        if (foundExerciseId) break;
      }
      setSuggestedProgressionExerciseId(foundExerciseId);
    } catch (error) {
      reportError(error, { scope: 'analytics.load' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useReloadOnActivate(() => void reload({ skipIfUnchanged: true }));

  return {
    loading,
    workouts,
    gyms,
    exercises,
    scopes,
    hasWorkoutData,
    weeklyVolume,
    muscleFrequency,
    suggestedProgressionExerciseId,
    reload,
  };
}
