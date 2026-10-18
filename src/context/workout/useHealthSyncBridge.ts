import { useEffect, useRef } from 'react';
import { useSettings } from '../SettingsContext';
import { enqueueCompletedWorkoutSync } from '../../health';
import { Workout } from '../../types';

/**
 * ARCH-03: bridges workout completion to the health provider. Completions that finish while the
 * persisted setting is still loading are buffered and drained once it resolves.
 */
export interface HealthSyncBridge {
  enqueueCompleted: (workout: Workout) => void;
}

export function useHealthSyncBridge(): HealthSyncBridge {
  const { healthSyncEnabled, loading: settingsLoading } = useSettings();
  const pendingHealthSyncsRef = useRef<Workout[]>([]);
  const healthSyncSettingsRef = useRef({ enabled: healthSyncEnabled, loading: settingsLoading });
  healthSyncSettingsRef.current = { enabled: healthSyncEnabled, loading: settingsLoading };

  useEffect(() => {
    if (settingsLoading) return;

    const pendingWorkouts = pendingHealthSyncsRef.current.splice(0);
    for (const workout of pendingWorkouts) {
      enqueueCompletedWorkoutSync(workout, healthSyncEnabled);
    }
  }, [healthSyncEnabled, settingsLoading]);

  const enqueueCompleted = (workout: Workout) => {
    const settings = healthSyncSettingsRef.current;
    if (settings.loading) {
      pendingHealthSyncsRef.current.push(workout);
    } else {
      enqueueCompletedWorkoutSync(workout, settings.enabled);
    }
  };

  return { enqueueCompleted };
}
