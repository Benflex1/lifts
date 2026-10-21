import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import type { RefObject } from 'react';
import { getStore } from '../../database/db';
import { createSessionController, SessionController, SessionState } from '../../workout/session';
import { computeElapsedSeconds } from '../../utils/timer';
import { reportError } from '../../utils/errorReporting';

/**
 * ARCH-03: bridges the session controller into React — creation and subscription, the 1 s
 * workout clock, and the AppState background flush.
 */
export interface SessionControllerBridge {
  controllerRef: RefObject<SessionController | null>;
  sessionState: SessionState;
  /** Whole seconds elapsed in the active workout; 0 while idle. */
  elapsedSeconds: number;
}

export function useSessionControllerBridge(): SessionControllerBridge {
  const controllerRef = useRef<SessionController | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>({
    phase: 'idle',
    workout: null,
    restTimer: null,
    persistenceError: null,
    revision: 0,
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const workoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize controller and subscribe
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const store = await getStore();
        const ctrl = createSessionController(store, () => Date.now(), { maxDirtyTimeMs: 3000 });
        controllerRef.current = ctrl;

        unsubscribe = ctrl.subscribe(newState => {
          if (isMounted) {
            setSessionState(newState);
          }
        });
      } catch (err) {
        reportError(err, { scope: 'workout.session.init' });
      }
    })();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Elapsed workout time ticker
  useEffect(() => {
    if (sessionState.phase === 'active' && sessionState.workout) {
      const startTime = sessionState.workout.startTime;
      setElapsedSeconds(computeElapsedSeconds(startTime, Date.now()));

      workoutTimerRef.current = setInterval(() => {
        setElapsedSeconds(computeElapsedSeconds(startTime, Date.now()));
      }, 1000);
    } else {
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
      setElapsedSeconds(0);
    }

    return () => {
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
    };
    // Deliberately narrowed to the start time: other workout mutations must not restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState.phase, sessionState.workout?.startTime]);

  // AppState background flush
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'background' && controllerRef.current && sessionState.phase === 'active') {
        controllerRef.current.flush().catch(error => {
          reportError(error, { scope: 'workout.autosave.background' });
        });
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [sessionState.phase]);

  return { controllerRef, sessionState, elapsedSeconds };
}
