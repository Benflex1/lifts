import { useEffect, useRef, useState } from 'react';
import { Exercise } from '../types';
import { getStore, searchExercises } from '../database/db';
import { reportError } from '../utils/errorReporting';
import { useReloadOnActivate } from './useReloadOnActivate';

/**
 * ARCH-06 domain hook: owns the filtered exercise catalog. Re-queries when the
 * filters change and on tab activation only when the store revision moved, and
 * keeps the previous array when a result set is unchanged so long lists do not
 * re-render.
 */
export interface ExerciseCatalogFilters {
  query: string;
  muscle: string;
  equipment: string;
}

export interface ExerciseCatalogQuery {
  exercises: Exercise[];
  /** True only until the first load settles. */
  loading: boolean;
  reload: () => Promise<void>;
}

function sameExerciseList(previous: Exercise[], results: Exercise[]): boolean {
  return (
    previous.length === results.length &&
    previous.every(
      (ex, idx) =>
        ex === results[idx] ||
        (ex.id === results[idx].id &&
          ex.name === results[idx].name &&
          ex.equipment === results[idx].equipment &&
          ex.primaryMuscles.join() === results[idx].primaryMuscles.join()),
    )
  );
}

export function useExerciseCatalog(filters: ExerciseCatalogFilters): ExerciseCatalogQuery {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);
  const revisionRef = useRef<number | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const reload = async ({ skipIfUnchanged = false }: { skipIfUnchanged?: boolean } = {}) => {
    const requestId = ++requestRef.current;
    const { query, muscle, equipment } = filtersRef.current;
    try {
      const store = await getStore();
      const revision = (await store.getDataRevision?.()) ?? null;
      if (skipIfUnchanged && revision !== null && revision === revisionRef.current) return;

      const results = await searchExercises(query, muscle, equipment);
      if (requestId !== requestRef.current) return;
      revisionRef.current = revision;

      setExercises(previous => (sameExerciseList(previous, results) ? previous : results));
    } catch (e) {
      reportError(e, { scope: 'exercises.load' });
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [filters.query, filters.muscle, filters.equipment]);

  // Custom exercises can be created from the workout picker, so refresh when returning here.
  useReloadOnActivate(() => void reload({ skipIfUnchanged: true }));

  return {
    exercises,
    loading,
    reload: () => reload(),
  };
}
