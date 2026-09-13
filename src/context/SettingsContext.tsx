import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { WeightUnit } from '../utils/units';
import { getSetting, setSetting } from '../database/db';
import { useDialog } from './DialogContext';
import { getPlatformHealthProvider, retryPendingHealthSyncs } from '../health';
import { updateHealthSyncSetting } from '../health/settings';
import { parseGymTrackingEnabled, parseHealthSyncEnabled } from '../utils/settings';

export interface SettingsContextType {
  unit: WeightUnit;
  setUnit: (unit: WeightUnit) => Promise<void>;
  gymTrackingEnabled: boolean;
  setGymTrackingEnabled: (enabled: boolean) => Promise<void>;
  healthSyncEnabled: boolean;
  setHealthSyncEnabled: (enabled: boolean) => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  unit: 'kg',
  setUnit: async () => {},
  gymTrackingEnabled: true,
  setGymTrackingEnabled: async () => {},
  healthSyncEnabled: false,
  setHealthSyncEnabled: async () => {},
  loading: true,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unit, setUnitState] = useState<WeightUnit>('kg');
  const [gymTrackingEnabled, setGymTrackingEnabledState] = useState(true);
  const [healthSyncEnabled, setHealthSyncEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);
  const { notify } = useDialog();

  useEffect(() => {
    (async () => {
      try {
        const [storedUnit, storedGymTracking, storedHealthSync] = await Promise.all([
          getSetting('unit'),
          getSetting('gym_tracking_enabled'),
          getSetting('health_sync_enabled'),
        ]);
        if (storedUnit === 'kg' || storedUnit === 'lb') setUnitState(storedUnit);
        setGymTrackingEnabledState(parseGymTrackingEnabled(storedGymTracking));
        const persistedHealthSync = parseHealthSyncEnabled(storedHealthSync);
        setHealthSyncEnabledState(persistedHealthSync);
        if (persistedHealthSync) {
          void retryPendingHealthSyncs().catch((error) => {
            console.error('Unable to retry pending health syncs', error);
          });
        }
      } catch (e) {
        // Fallback to default
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setUnit = useCallback(async (u: WeightUnit) => {
    const prev = unit;
    setUnitState(u);
    try {
      await setSetting('unit', u);
    } catch (err: any) {
      setUnitState(prev);
      await notify({
        title: 'Settings Error',
        message: err?.message || 'Failed to save weight unit setting.',
      });
      throw err;
    }
  }, [unit, notify]);

  const setGymTrackingEnabled = useCallback(async (enabled: boolean) => {
    const previous = gymTrackingEnabled;
    setGymTrackingEnabledState(enabled);
    try {
      await setSetting('gym_tracking_enabled', enabled ? 'true' : 'false');
    } catch (err: any) {
      setGymTrackingEnabledState(previous);
      await notify({
        title: 'Settings Error',
        message: err?.message || 'Failed to save gym tracking setting.',
      });
      throw err;
    }
  }, [gymTrackingEnabled, notify]);

  const setHealthSyncEnabled = useCallback(async (enabled: boolean) => {
    await updateHealthSyncSetting(enabled, healthSyncEnabled, {
      loadProvider: getPlatformHealthProvider,
      persist: (value) => setSetting('health_sync_enabled', value ? 'true' : 'false'),
      setState: setHealthSyncEnabledState,
      notify,
    });
  }, [healthSyncEnabled, notify]);

  return (
    <SettingsContext.Provider
      value={{
        unit,
        setUnit,
        gymTrackingEnabled,
        setGymTrackingEnabled,
        healthSyncEnabled,
        setHealthSyncEnabled,
        loading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
