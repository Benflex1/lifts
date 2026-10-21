import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { ActiveExercise } from '../../types';
import { resolveInitialAccordionState } from '../../workout/gym-session';
import type { SessionController } from '../../workout/session';

/**
 * ARCH-03: the exercise accordion state — which exercise cards are expanded in the logger.
 */
export interface ExerciseAccordion {
  expandedExercises: Record<string, boolean>;
  toggleExerciseExpanded: (activeExerciseId: string) => void;
  setExerciseExpanded: (activeExerciseId: string, expanded: boolean) => void;
  expandAllExercises: () => void;
  collapseAllExercises: () => void;
  /** Expands the given exercises (used when they are appended to the workout). */
  expandExercises: (activeExerciseIds: string[]) => void;
  /** Drops an exercise's expansion state (used when it leaves the workout). */
  removeExercise: (activeExerciseId: string) => void;
  /** Applies the initial expansion of a starting or resumed workout. */
  applyInitialState: (exercises: ActiveExercise[], options?: { onlyWhenEmpty?: boolean }) => void;
  /** Clears all expansion state (used when a workout ends or is discarded). */
  reset: () => void;
}

export function useExerciseAccordion(
  controllerRef: RefObject<SessionController | null>,
): ExerciseAccordion {
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});

  const toggleExerciseExpanded = useCallback((activeExerciseId: string) => {
    setExpandedExercises(prev => ({
      ...prev,
      [activeExerciseId]: !(prev[activeExerciseId] ?? false),
    }));
  }, []);

  const setExerciseExpanded = useCallback((activeExerciseId: string, expanded: boolean) => {
    setExpandedExercises(prev => ({
      ...prev,
      [activeExerciseId]: expanded,
    }));
  }, []);

  const expandAllExercises = useCallback(() => {
    const workout = controllerRef.current?.getState().workout;
    if (!workout) return;
    const all: Record<string, boolean> = {};
    workout.exercises.forEach(e => {
      all[e.id] = true;
    });
    setExpandedExercises(all);
  }, [controllerRef]);

  const collapseAllExercises = useCallback(() => {
    const workout = controllerRef.current?.getState().workout;
    if (!workout) return;
    const all: Record<string, boolean> = {};
    workout.exercises.forEach(e => {
      all[e.id] = false;
    });
    setExpandedExercises(all);
  }, [controllerRef]);

  const expandExercises = useCallback((activeExerciseIds: string[]) => {
    setExpandedExercises(prev => {
      const next = { ...prev };
      for (const id of activeExerciseIds) {
        next[id] = true;
      }
      return next;
    });
  }, []);

  const removeExercise = useCallback((activeExerciseId: string) => {
    setExpandedExercises(prev => {
      const next = { ...prev };
      delete next[activeExerciseId];
      return next;
    });
  }, []);

  const applyInitialState = useCallback(
    (exercises: ActiveExercise[], options?: { onlyWhenEmpty?: boolean }) => {
      setExpandedExercises(prev => {
        if (options?.onlyWhenEmpty && Object.keys(prev).length > 0) return prev;
        return resolveInitialAccordionState(exercises);
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setExpandedExercises({});
  }, []);

  return {
    expandedExercises,
    toggleExerciseExpanded,
    setExerciseExpanded,
    expandAllExercises,
    collapseAllExercises,
    expandExercises,
    removeExercise,
    applyInitialState,
    reset,
  };
}
