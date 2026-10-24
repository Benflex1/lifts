import { useEffect, useRef, useState } from 'react';
import { ExerciseGymScope, Gym, Workout, WorkoutHistorySummary } from '../types';
import {
  getCompletedWorkoutsForExercises,
  getExerciseGymScope,
  getGyms,
  getStore,
  getWorkoutDetail,
  getWorkoutHistory,
} from '../database/db';
import { updateWorkoutHistorySummary } from '../workout/history-summary';
import { evaluateAllWorkoutPRs, evaluateWorkoutPRs, WorkoutPRSummary } from '../workout/pr';
import { reportError } from '../utils/errorReporting';
import { useSettings } from '../context/SettingsContext';
import { useReloadOnActivate } from './useReloadOnActivate';

/**
 * ARCH-06 domain hook: owns the history list, its gyms, lazily loaded details,
 * and PR summaries. Caching and invalidation live here — the revision check
 * runs before any hydration, and the tab-activation refresh is built in — so
 * screens only render.
 */
export interface WorkoutHistoryQuery {
  /** Newest-first workout summaries. */
  history: WorkoutHistorySummary[];
  gyms: Gym[];
  /** True only until the first load settles. */
  loading: boolean;
  details: Record<string, Workout>;
  prs: Record<string, WorkoutPRSummary>;
  loadingDetailId: string | null;
  reload: (options?: { skipIfUnchanged?: boolean }) => Promise<void>;
  /** Returns a cached detail or fetches it, refreshing its PR summary. */
  loadDetail: (workoutId: string) => Promise<Workout | null>;
  /** Applies a locally saved workout to the cache and refreshes its PRs. */
  updateWorkout: (workout: Workout) => Promise<void>;
}

export function useWorkoutHistory(): WorkoutHistoryQuery {
  const { gymTrackingEnabled } = useSettings();
  const [history, setHistory] = useState<WorkoutHistorySummary[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<Record<string, Workout>>({});
  const [prs, setPrs] = useState<Record<string, WorkoutPRSummary>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const requestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const revisionRef = useRef<number | null>(null);
  const gymTrackingRef = useRef(gymTrackingEnabled);
  const gymsRef = useRef(gyms);
  const detailsRef = useRef(details);
  const prsRef = useRef(prs);
  gymsRef.current = gyms;
  detailsRef.current = details;
  prsRef.current = prs;

  const refreshPRs = async (targetWorkout: Workout): Promise<WorkoutPRSummary | null> => {
    try {
      const distinctExerciseIds = Array.from(
        new Set(targetWorkout.exercises.map(ex => ex.exerciseId)),
      );
      if (distinctExerciseIds.length === 0) return null;

      const [workoutsByEx, scopes] = await Promise.all([
        getCompletedWorkoutsForExercises(distinctExerciseIds),
        Promise.all(distinctExerciseIds.map(id => getExerciseGymScope(id))),
      ]);

      const scopesByEx: Record<string, ExerciseGymScope | undefined> = {};
      distinctExerciseIds.forEach((id, idx) => {
        scopesByEx[id] = scopes[idx] || undefined;
      });

      const summary = evaluateWorkoutPRs(
        targetWorkout,
        workoutsByEx,
        gymsRef.current,
        gymTrackingEnabled,
        scopesByEx,
      );
      setPrs(prev => ({ ...prev, [targetWorkout.id]: summary }));
      return summary;
    } catch (e) {
      reportError(e, { scope: 'history.pr-summary' });
      return null;
    }
  };

  const reload = async ({ skipIfUnchanged = false }: { skipIfUnchanged?: boolean } = {}) => {
    const requestId = ++requestRef.current;
    // Only show the spinner on the first load; later refreshes keep the current list on screen.
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const store = await getStore();

      // Cheap revision check first: any write that affects history, PR badges,
      // or analytics advances the revision, so an unchanged revision means the
      // expensive reload (list + snapshot + PR pass) can be skipped entirely.
      // Stores without a revision counter always reload.
      const revision = (await store.getDataRevision?.()) ?? null;
      // PR ranking also depends on the gym-tracking setting, which a data revision does not cover.
      const gymTrackingChanged = gymTrackingRef.current !== gymTrackingEnabled;
      if (
        skipIfUnchanged &&
        !gymTrackingChanged &&
        revision !== null &&
        revision === revisionRef.current
      ) {
        return;
      }

      const [list, gymList] = await Promise.all([getWorkoutHistory(), getGyms()]);
      if (requestId !== requestRef.current) return;
      revisionRef.current = revision;
      gymTrackingRef.current = gymTrackingEnabled;

      hasLoadedRef.current = true;
      setHistory(list);
      setGyms(gymList);

      // Eagerly compute PRs for all historical workouts so PR badges always show
      const snapshot = await store.readSnapshot();
      if (requestId !== requestRef.current) return;

      const scopesByEx: Record<string, ExerciseGymScope | undefined> = {};
      (snapshot.exerciseGymScopes || []).forEach(s => {
        scopesByEx[s.exerciseId] = s;
      });

      // One chronological pass over the whole history (linear), instead of re-scanning the
      // history for every workout.
      const prMap = evaluateAllWorkoutPRs(
        snapshot.workouts || [],
        gymList,
        gymTrackingEnabled,
        scopesByEx,
      );
      const detailsMap: Record<string, Workout> = {};
      for (const w of snapshot.workouts || []) {
        detailsMap[w.id] = w;
      }

      setDetails(prev => ({ ...detailsMap, ...prev }));
      setPrs(prMap);
    } catch (e) {
      reportError(e, { scope: 'history.load' });
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // Mount-only initial load; reload is recreated per render and must not restart the fetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useReloadOnActivate(() => void reload({ skipIfUnchanged: true }));

  const loadDetail = async (workoutId: string): Promise<Workout | null> => {
    let detail: Workout | null = detailsRef.current[workoutId] || null;
    if (!detail) {
      setLoadingDetailId(workoutId);
      try {
        const loaded = await getWorkoutDetail(workoutId);
        if (loaded) {
          detail = loaded;
          setDetails(prev => ({ ...prev, [workoutId]: loaded }));
        }
      } catch (e) {
        reportError(e, { scope: 'history.detail' });
      } finally {
        setLoadingDetailId(null);
      }
    }

    if (detail && !prsRef.current[workoutId]) {
      void refreshPRs(detail);
    }
    return detail;
  };

  const updateWorkout = async (workout: Workout) => {
    setHistory(previous => updateWorkoutHistorySummary(previous, workout));
    setDetails(previous => ({ ...previous, [workout.id]: workout }));
    void refreshPRs(workout);
    await reload();
  };

  return {
    history,
    gyms,
    loading,
    details,
    prs,
    loadingDetailId,
    reload,
    loadDetail,
    updateWorkout,
  };
}
