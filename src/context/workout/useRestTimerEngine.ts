import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, Vibration } from 'react-native';
import type { RefObject } from 'react';
import * as Haptics from 'expo-haptics';
import { computeRemaining, nextRemainingTickDelay } from '../../utils/timer';
import {
  initRestNotifications,
  scheduleRestNotification,
  cancelRestNotification,
} from '../../utils/restNotifications';
import type { SessionController, SessionState } from '../../workout/session';

export interface RestTimerState {
  isActive: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  endsAt: number | null;
}

export const IDLE_REST_TIMER: RestTimerState = { isActive: false, remainingSeconds: 0, totalSeconds: 0, endsAt: null };

/**
 * ARCH-03: the rest countdown engine — countdown state, the second-aligned ticker, the 3-2-1
 * and finish haptics, and the background notification handoff.
 */
export interface RestTimerEngine {
  restTimer: RestTimerState;
  startRestTimer: (seconds: number, exerciseName?: string) => void;
  adjustRestTimer: (deltaSeconds: number) => void;
  stopRestTimer: () => void;
  /** Restores (or clears) the timer recorded on a resumed draft. */
  restoreRestTimer: (draftTimer: { endsAt: number; totalSeconds: number } | null) => void;
}

export function useRestTimerEngine(
  controllerRef: RefObject<SessionController | null>,
  sessionPhase: SessionState['phase'],
): RestTimerEngine {
  const [restTimer, setRestTimer] = useState<RestTimerState>(IDLE_REST_TIMER);
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBuzzedSecondRef = useRef<number | null>(null);

  useEffect(() => {
    void initRestNotifications();
  }, []);

  // Foreground cleanup of the scheduled background notification.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') {
        void cancelRestNotification();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, []);

  // Rest countdown ticker: one wakeup per second, aligned to the second boundary.
  useEffect(() => {
    const clearScheduledTick = () => {
      if (restTimerRef.current) {
        clearTimeout(restTimerRef.current);
        restTimerRef.current = null;
      }
    };

    if (!restTimer.isActive || restTimer.endsAt === null) {
      lastBuzzedSecondRef.current = null;
      clearScheduledTick();
      return clearScheduledTick;
    }

    const endsAt = restTimer.endsAt;
    const tick = () => {
      const now = Date.now();
      const remaining = computeRemaining(endsAt, now);
      if (remaining <= 0) {
        const expiredRecently = Math.abs(now - endsAt) < 1500;
        setRestTimer((prev) => ({ ...prev, isActive: false, remainingSeconds: 0, endsAt: null }));
        const ctrl = controllerRef.current;
        if (ctrl) {
          const state = ctrl.getState();
          if (state.phase === 'active' && state.workout) {
            ctrl.update(state.workout, null);
          }
        }
        void cancelRestNotification();

        // Intense countdown finish buzzer (triple pulse)
        // Only buzz if timer reached 0 in foreground / just now (< 1.5s), avoiding false alarm on app resume
        if (lastBuzzedSecondRef.current !== 0 && expiredRecently) {
          lastBuzzedSecondRef.current = 0;
          if (Platform.OS !== 'web') {
            try {
              Vibration.vibrate([0, 800, 400, 800, 400, 800]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setTimeout(() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              }, 160);
              setTimeout(() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              }, 320);
            } catch {
              // Best-effort countdown haptics; failure must not interrupt the workout.
            }
          }
        } else {
          lastBuzzedSecondRef.current = 0;
        }
      } else {
        // Intense 3-2-1 countdown haptics
        if (remaining === 3 && lastBuzzedSecondRef.current !== 3) {
          lastBuzzedSecondRef.current = 3;
          if (Platform.OS !== 'web') {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch {
              // Best-effort countdown haptics; failure must not interrupt the workout.
            }
          }
        } else if (remaining === 2 && lastBuzzedSecondRef.current !== 2) {
          lastBuzzedSecondRef.current = 2;
          if (Platform.OS !== 'web') {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch {
              // Best-effort countdown haptics; failure must not interrupt the workout.
            }
          }
        } else if (remaining === 1 && lastBuzzedSecondRef.current !== 1) {
          lastBuzzedSecondRef.current = 1;
          if (Platform.OS !== 'web') {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            } catch {
              // Best-effort countdown haptics; failure must not interrupt the workout.
            }
          }
        } else if (remaining > 3) {
          lastBuzzedSecondRef.current = null;
        }

        setRestTimer((prev) => {
          if (prev.remainingSeconds === remaining) return prev;
          return { ...prev, remainingSeconds: remaining };
        });

        // Wake again exactly when the displayed second changes.
        restTimerRef.current = setTimeout(
          tick,
          Math.max(50, nextRemainingTickDelay(endsAt, Date.now()) + 10),
        );
      }
    };

    tick();
    return clearScheduledTick;
  }, [restTimer.isActive, restTimer.endsAt, sessionPhase, controllerRef]);

  const startRestTimer = (seconds: number, exerciseName?: string) => {
    if (seconds <= 0) return;
    const endsAt = Date.now() + seconds * 1000;
    lastBuzzedSecondRef.current = null;
    void scheduleRestNotification(endsAt, exerciseName);
    setRestTimer({
      isActive: true,
      remainingSeconds: seconds,
      totalSeconds: seconds,
      endsAt,
    });
    const ctrl = controllerRef.current;
    if (ctrl) {
      const state = ctrl.getState();
      if (state.phase === 'active' && state.workout) {
        ctrl.update(state.workout, { endsAt, totalSeconds: seconds });
      }
    }
  };

  const adjustRestTimer = (deltaSeconds: number) => {
    setRestTimer((prev) => {
      if (!prev.endsAt) return prev;
      const newEndsAt = prev.endsAt + deltaSeconds * 1000;
      const remaining = computeRemaining(newEndsAt, Date.now());
      if (remaining > 0) {
        void scheduleRestNotification(newEndsAt);
      } else {
        void cancelRestNotification();
      }
      const updatedTimer = {
        ...prev,
        endsAt: newEndsAt,
        remainingSeconds: remaining,
        isActive: remaining > 0,
      };
      const ctrl = controllerRef.current;
      if (ctrl) {
        const state = ctrl.getState();
        if (state.phase === 'active' && state.workout) {
          ctrl.update(
            state.workout,
            remaining > 0 ? { endsAt: newEndsAt, totalSeconds: prev.totalSeconds } : null
          );
        }
      }
      return updatedTimer;
    });
  };

  const stopRestTimer = () => {
    lastBuzzedSecondRef.current = null;
    void cancelRestNotification();
    setRestTimer({
      isActive: false,
      remainingSeconds: 0,
      totalSeconds: 0,
      endsAt: null,
    });
    const ctrl = controllerRef.current;
    if (ctrl) {
      const state = ctrl.getState();
      if (state.phase === 'active' && state.workout) {
        ctrl.update(state.workout, null);
      }
    }
  };

  const restoreRestTimer = (draftTimer: { endsAt: number; totalSeconds: number } | null) => {
    if (draftTimer && draftTimer.endsAt > Date.now()) {
      setRestTimer({
        isActive: true,
        endsAt: draftTimer.endsAt,
        totalSeconds: draftTimer.totalSeconds,
        remainingSeconds: computeRemaining(draftTimer.endsAt, Date.now()),
      });
    } else {
      stopRestTimer();
    }
  };

  return { restTimer, startRestTimer, adjustRestTimer, stopRestTimer, restoreRestTimer };
}
