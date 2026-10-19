import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, Vibration } from 'react-native';
import type { RefObject } from 'react';
import * as Haptics from 'expo-haptics';
import { useDialog } from '../DialogContext';
import { getSetting, setSetting } from '../../database/db';
import { computeRemaining, nextRemainingTickDelay } from '../../utils/timer';
import { getExactAlarmStatus, openExactAlarmSettings } from '../../utils/exactAlarms';
import { reportError } from '../../utils/errorReporting';
import {
  RestCountdown,
  restAlarmForAppState,
  shiftRestCountdown,
} from '../../utils/restTimer';
import {
  initRestNotifications,
  scheduleRestNotification,
  cancelRestNotification,
  isRestCueNative,
} from '../../utils/restNotifications';
import type { SessionController, SessionState } from '../../workout/session';

const EXACT_ALARM_PROMPTED_KEY = 'exact_alarm_prompted';

export interface RestTimerState {
  isActive: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  endsAt: number | null;
  exerciseName?: string;
}

export const IDLE_REST_TIMER: RestTimerState = {
  isActive: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  endsAt: null,
};

// Two taps 120ms apart, so each count reads as a pulse. Skipped off screen, where the rest alarm alerts instead,
// and where the native rest cue plays the countdown itself.
function pulseCountdown(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === 'web' || AppState.currentState !== 'active' || isRestCueNative()) return;
  try {
    Haptics.impactAsync(style);
    setTimeout(() => {
      Haptics.impactAsync(style);
    }, 120);
  } catch {
    // Best-effort countdown haptics; failure must not interrupt the workout.
  }
}

/**
 * ARCH-03: the rest countdown engine — countdown state, the second-aligned ticker, the 3-2-1
 * and finish haptics, the exact-alarm prompt, and the background notification handoff.
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
  const { confirm } = useDialog();
  const [restTimer, setRestTimer] = useState<RestTimerState>(IDLE_REST_TIMER);
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBuzzedSecondRef = useRef<number | null>(null);
  // Read by AppState and adjust handlers, which must see the latest countdown without re-subscribing.
  const restCountdownRef = useRef<RestCountdown | null>(null);
  restCountdownRef.current =
    restTimer.isActive && restTimer.endsAt !== null
      ? {
          endsAt: restTimer.endsAt,
          totalSeconds: restTimer.totalSeconds,
          exerciseName: restTimer.exerciseName,
        }
      : null;

  useEffect(() => {
    void initRestNotifications();
  }, []);

  // AppState background flush, and the OS rest alarm: armed when the app leaves the screen, cancelled on return.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'background' && controllerRef.current && sessionPhase === 'active') {
        controllerRef.current.flush().catch((error) => {
          reportError(error, { scope: 'workout.autosave.background' });
        });
      }
      // The native rest cue is armed for the whole rest (see below), so it does not follow app visibility.
      if (isRestCueNative()) return;
      const alarm = restAlarmForAppState(state, restCountdownRef.current, Date.now());
      if (alarm.kind === 'arm') {
        void scheduleRestNotification(alarm.endsAt, alarm.exerciseName);
      } else if (alarm.kind === 'cancel') {
        void cancelRestNotification();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [sessionPhase, controllerRef]);

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
        // No cancel here: a running OS alarm is only armed while the app is backgrounded, and cancelling
        // at expiry could dismiss the notification the alarm has just posted.

        // Intense countdown finish buzzer (triple pulse)
        // Only buzz if the timer reached 0 in the foreground / just now (< 1.5s), avoiding a false alarm on resume.
        // In the background the OS rest alarm alerts instead.
        if (
          lastBuzzedSecondRef.current !== 0 &&
          expiredRecently &&
          AppState.currentState === 'active' &&
          !isRestCueNative()
        ) {
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
        // Intense 3-2-1 countdown haptics: a double pulse on each of the last three seconds.
        if (remaining <= 3 && lastBuzzedSecondRef.current !== remaining) {
          lastBuzzedSecondRef.current = remaining;
          pulseCountdown(
            remaining === 1
              ? Haptics.ImpactFeedbackStyle.Heavy
              : Haptics.ImpactFeedbackStyle.Medium,
          );
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

  // Android: the native rest cue (3-2-1 pulses, then a harder buzz at the end) is armed for every rest
  // start, adjustment and resumed draft, in and out of the app. It is only disarmed by stopRestTimer,
  // never at expiry, which would cut off the end buzz while it plays.
  useEffect(() => {
    if (!isRestCueNative() || !restTimer.isActive || restTimer.endsAt === null) return;
    void scheduleRestNotification(restTimer.endsAt, restTimer.exerciseName);
  }, [restTimer.isActive, restTimer.endsAt]);

  // Without exact alarms (denied by default from Android 14) the cue can fire seconds or minutes late,
  // so ask once, on the first rest. Settings keeps a button for later.
  const exactAlarmPromptedRef = useRef(false);
  useEffect(() => {
    if (!restTimer.isActive || exactAlarmPromptedRef.current || !isRestCueNative()) return;
    if (getExactAlarmStatus() !== 'denied') return;
    exactAlarmPromptedRef.current = true;
    (async () => {
      if ((await getSetting(EXACT_ALARM_PROMPTED_KEY)) === 'true') return;
      await setSetting(EXACT_ALARM_PROMPTED_KEY, 'true');
      const allow = await confirm({
        title: 'On-time rest buzz',
        message:
          'To buzz 3, 2, 1 exactly when your rest ends, even with the phone locked, Lifts needs permission to set alarms. Android may delay the buzz without it.',
        confirmLabel: 'Allow',
        cancelLabel: 'Not now',
      });
      if (allow) openExactAlarmSettings();
    })().catch((error) => {
      reportError(error, { scope: 'workout.rest.exact-alarm-prompt' });
    });
  }, [restTimer.isActive, confirm]);

  const startRestTimer = (seconds: number, exerciseName?: string) => {
    if (seconds <= 0) return;
    const endsAt = Date.now() + seconds * 1000;
    lastBuzzedSecondRef.current = null;
    // The OS alarm is armed by the native cue effect above on Android, elsewhere when the app leaves the screen.
    setRestTimer({
      isActive: true,
      remainingSeconds: seconds,
      totalSeconds: seconds,
      endsAt,
      exerciseName,
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
    const countdown = restCountdownRef.current;
    if (!countdown) return;
    const shifted = shiftRestCountdown(countdown, deltaSeconds, Date.now());
    if (!shifted) {
      stopRestTimer();
      return;
    }
    setRestTimer({
      isActive: true,
      remainingSeconds: computeRemaining(shifted.endsAt, Date.now()),
      totalSeconds: shifted.totalSeconds,
      endsAt: shifted.endsAt,
      exerciseName: shifted.exerciseName,
    });
    const ctrl = controllerRef.current;
    if (ctrl) {
      const state = ctrl.getState();
      if (state.phase === 'active' && state.workout) {
        ctrl.update(state.workout, {
          endsAt: shifted.endsAt,
          totalSeconds: shifted.totalSeconds,
        });
      }
    }
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
