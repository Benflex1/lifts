import { useEffect, useRef, useState } from 'react';
import { Routine } from '../types';
import { getRoutines, getStore, getWorkoutHistory } from '../database/db';
import { buildWeekSnapshot, WeekSnapshot } from '../workout/week-summary';
import { reportError } from '../utils/errorReporting';
import { useReloadOnActivate } from './useReloadOnActivate';

/**
 * ARCH-06 domain hook: owns the routine list and its week summary. Called
 * `reload()` after routine edits; tab activation re-reads only when the store
 * revision moved.
 */
export interface RoutinesQuery {
  routines: Routine[];
  week: WeekSnapshot | null;
  reload: (options?: { skipIfUnchanged?: boolean }) => Promise<void>;
}

export function useRoutines(): RoutinesQuery {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [week, setWeek] = useState<WeekSnapshot | null>(null);
  const revisionRef = useRef<number | null>(null);

  const reload = async ({ skipIfUnchanged = false }: { skipIfUnchanged?: boolean } = {}) => {
    try {
      const store = await getStore();
      const revision = (await store.getDataRevision?.()) ?? null;
      if (skipIfUnchanged && revision !== null && revision === revisionRef.current) return;
      revisionRef.current = revision;

      const [list, history] = await Promise.all([getRoutines(), getWorkoutHistory()]);
      setRoutines(list);
      setWeek(buildWeekSnapshot(history));
    } catch (e) {
      reportError(e, { scope: 'workout.routines' });
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useReloadOnActivate(() => void reload({ skipIfUnchanged: true }));

  return { routines, week, reload };
}
