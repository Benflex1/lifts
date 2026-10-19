import { useEffect, useRef, useState } from 'react';
import { Routine, WorkoutHistorySummary } from '../types';
import { getRoutines, getStore, getWorkoutHistory } from '../database/db';
import { buildWeekSnapshot, WeekSnapshot } from '../workout/week-summary';
import { reportError } from '../utils/errorReporting';
import { useReloadOnActivate } from './useReloadOnActivate';

/**
 * ARCH-06 domain hook: owns the routine list, the history it derives rotation
 * state from, and its week summary. Called `reload()` after routine edits; tab
 * activation re-reads only when the store revision moved.
 */
export interface RoutinesQuery {
  routines: Routine[];
  history: WorkoutHistorySummary[];
  week: WeekSnapshot | null;
  reload: (options?: { skipIfUnchanged?: boolean }) => Promise<void>;
}

export function useRoutines(): RoutinesQuery {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [history, setHistory] = useState<WorkoutHistorySummary[]>([]);
  const [week, setWeek] = useState<WeekSnapshot | null>(null);
  const historyRef = useRef<WorkoutHistorySummary[]>([]);
  const revisionRef = useRef<number | null>(null);

  const reload = async ({ skipIfUnchanged = false }: { skipIfUnchanged?: boolean } = {}) => {
    try {
      const store = await getStore();
      const revision = (await store.getDataRevision?.()) ?? null;
      if (skipIfUnchanged && revision !== null && revision === revisionRef.current) {
        setWeek(buildWeekSnapshot(historyRef.current));
        return;
      }

      const [list, historyList] = await Promise.all([getRoutines(), getWorkoutHistory()]);
      revisionRef.current = revision;
      historyRef.current = historyList;
      setRoutines(list);
      setHistory(historyList);
      setWeek(buildWeekSnapshot(historyList));
    } catch (e) {
      reportError(e, { scope: 'workout.routines' });
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useReloadOnActivate(() => void reload({ skipIfUnchanged: true }));

  return { routines, history, week, reload };
}
