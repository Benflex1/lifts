import { useState } from 'react';
import { Gym } from '../types';
import { getGyms } from '../database/db';

/**
 * ARCH-06 domain hook: a lazily loaded gym profile list. `reload()` always
 * re-reads (callers use it when they need a fresh list for a modal); errors
 * propagate to the caller's own error policy.
 */
export interface GymProfilesQuery {
  gyms: Gym[];
  loading: boolean;
  reload: () => Promise<Gym[]>;
}

export function useGymProfiles(): GymProfilesQuery {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async (): Promise<Gym[]> => {
    setLoading(true);
    try {
      const list = await getGyms();
      setGyms(list);
      return list;
    } finally {
      setLoading(false);
    }
  };

  return { gyms, loading, reload };
}
