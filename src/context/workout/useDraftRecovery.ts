import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { getStore } from '../../database/db';
import { WorkoutDraft } from '../../database/contract';
import { Gym, Workout } from '../../types';
import { reportError } from '../../utils/errorReporting';
import type { SessionController } from '../../workout/session';
import type { ExerciseAccordion } from './useExerciseAccordion';
import type { RestTimerEngine } from './useRestTimerEngine';

/**
 * ARCH-03: paused-draft recovery — the draft list, the resume dialog state, resuming a draft into
 * the controller, and discarding drafts.
 */
export interface DraftRecovery {
  availableDrafts: WorkoutDraft[];
  draftAvailable: Workout | null;
  isDraftModalOpen: boolean;
  openDraftModal: () => void;
  closeDraftModal: () => void;
  refreshDrafts: () => Promise<void>;
  resumeDraft: (draft?: WorkoutDraft) => void;
  discardDraft: (draftId?: string) => Promise<void>;
}

export function useDraftRecovery({
  controllerRef,
  gyms,
  selectLoadedGym,
  restTimer,
  accordion,
  setMinimized,
}: {
  controllerRef: RefObject<SessionController | null>;
  gyms: Gym[];
  selectLoadedGym: (gymId: string) => void;
  restTimer: RestTimerEngine;
  accordion: ExerciseAccordion;
  setMinimized: (minimized: boolean) => void;
}): DraftRecovery {
  const [availableDrafts, setAvailableDrafts] = useState<WorkoutDraft[]>([]);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);

  const refreshDrafts = useCallback(async () => {
    try {
      const store = await getStore();
      const drafts = await store.getWorkoutDrafts();
      setAvailableDrafts(drafts);
    } catch (e) {
      reportError(e, { scope: 'workout.drafts.load' });
    }
  }, []);

  const resumeDraft = (draft?: WorkoutDraft) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    const targetDraft = draft || (availableDrafts.length > 0 ? availableDrafts[0] : null);
    if (!targetDraft) return;

    ctrl.resume(targetDraft);
    selectLoadedGym(targetDraft.workout.gymId);
    setMinimized(false);
    setIsDraftModalOpen(false);

    accordion.applyInitialState(targetDraft.workout.exercises, { onlyWhenEmpty: true });
    restTimer.restoreRestTimer(targetDraft.restTimer);

    refreshDrafts().catch(console.error);
  };

  const discardDraft = async (draftId?: string) => {
    const ctrl = controllerRef.current;
    if (draftId) {
      const store = await getStore();
      await store.discardDraft(draftId);
      await refreshDrafts();
      return;
    }

    if (ctrl) {
      const state = ctrl.getState();
      if (state.phase === 'active') {
        await ctrl.discard();
        setMinimized(false);
        accordion.reset();
        restTimer.stopRestTimer();
        await refreshDrafts();
        return;
      }
    }

    if (availableDrafts.length > 0) {
      const store = await getStore();
      await store.discardDraft(availableDrafts[0].workout.id);
      await refreshDrafts();
    }
  };

  return {
    availableDrafts,
    draftAvailable: availableDrafts.length > 0 ? availableDrafts[0].workout : null,
    isDraftModalOpen,
    openDraftModal: () => setIsDraftModalOpen(true),
    closeDraftModal: () => setIsDraftModalOpen(false),
    refreshDrafts,
    resumeDraft,
    discardDraft,
  };
}
