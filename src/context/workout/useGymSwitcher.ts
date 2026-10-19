import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { getStore } from '../../database/db';
import { Gym } from '../../types';
import { switchWorkoutGym } from '../../workout/gym-session';
import { resolveActiveGymAfterRefresh } from '../../workout/gym-profile';
import type { SessionController } from '../../workout/session';

/**
 * ARCH-03: owns the gym list and the active-gym selection, including the mid-workout gym switch
 * (which moves set provenance) and the refresh-on-focus resolution.
 */
export interface GymSwitcher {
  gyms: Gym[];
  activeGym: Gym | null;
  /** Initial load used by the provider: loads the list and selects the default gym. */
  initializeGyms: () => Promise<void>;
  refreshGyms: () => Promise<void>;
  setActiveGym: (gymId: string) => Promise<void>;
  /** Adopts a freshly loaded list and selection (used when a workout starts). */
  adoptGyms: (gyms: Gym[], selectedGym: Gym) => void;
  /** Selects a gym from the currently loaded list (used when resuming a draft). */
  selectLoadedGym: (gymId: string) => void;
}

export function useGymSwitcher(controllerRef: RefObject<SessionController | null>): GymSwitcher {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [activeGym, setActiveGymState] = useState<Gym | null>(null);
  const gymSwitchRequestRef = useRef(0);

  const initializeGyms = useCallback(async () => {
    const store = await getStore();
    const [loadedGyms, defaultGym] = await Promise.all([
      store.getGyms(),
      store.getDefaultGym(),
    ]);
    setGyms(loadedGyms);
    setActiveGymState(defaultGym);
  }, []);

  const refreshGyms = useCallback(async () => {
    const store = await getStore();
    const [loadedGyms, defaultGym] = await Promise.all([
      store.getGyms(),
      store.getDefaultGym(),
    ]);
    const currentWorkout = controllerRef.current?.getState().workout;
    setGyms(loadedGyms);
    setActiveGymState(resolveActiveGymAfterRefresh(loadedGyms, defaultGym, currentWorkout?.gymId));
  }, [controllerRef]);

  const setActiveGym = async (gymId: string): Promise<void> => {
    const ctrl = controllerRef.current;
    if (!ctrl) {
      throw new Error('Controller not initialized');
    }

    const requestId = ++gymSwitchRequestRef.current;
    const store = await getStore();
    const result = await switchWorkoutGym(
      ctrl,
      store,
      gymId,
      () => requestId === gymSwitchRequestRef.current,
    );
    if (result.cancelled) return;
    setGyms(result.gyms);
    setActiveGymState(result.gym);
  };

  const adoptGyms = (loadedGyms: Gym[], selectedGym: Gym) => {
    setGyms(loadedGyms);
    setActiveGymState(selectedGym);
  };

  const selectLoadedGym = (gymId: string) => {
    setActiveGymState(gyms.find((gym) => gym.id === gymId) || null);
  };

  return { gyms, activeGym, initializeGyms, refreshGyms, setActiveGym, adoptGyms, selectLoadedGym };
}
