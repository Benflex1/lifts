import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { WeightUnit } from '../utils/units';
import { getSetting, setSetting } from '../database/db';
import { useDialog } from './DialogContext';
import { getPlatformHealthProvider, retryPendingHealthSyncs } from '../health';
import { updateHealthSyncSetting } from '../health/settings';
import { parseGymTrackingEnabled, parseHealthSyncEnabled, parseRemoteExerciseImagesEnabled } from '../utils/settings';

export interface SettingsContextType {
  unit: WeightUnit;
  setUnit: (unit: WeightUnit) => Promise<void>;
  gymTrackingEnabled: boolean;
  setGymTrackingEnabled: (enabled: boolean) => Promise<void>;
  healthSyncEnabled: boolean;
  setHealthSyncEnabled: (enabled: boolean) => Promise<void>;
  remoteImagesEnabled: boolean;
  setRemoteImagesEnabled: (enabled: boolean) => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  unit: 'kg',
  setUnit: async () => {},
  gymTrackingEnabled: true,
  setGymTrackingEnabled: async () => {},
  healthSyncEnabled: false,
  setHealthSyncEnabled: async () => {},
  remoteImagesEnabled: false,
  setRemoteImagesEnabled: async () => {},
  loading: true,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unit, setUnitState] = useState<WeightUnit>('kg');
  const [gymTrackingEnabled, setGymTrackingEnabledState] = useState(true);
  const [healthSyncEnabled, setHealthSyncEnabledState] = useState(false);
  // Off until the stored preference is read, so a slow or failed read never fetches photos the user turned off.
  const [remoteImagesEnabled, setRemoteImagesEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);
  const { notify } = useDialog();

  useEffect(() => {
    (async () => {
      try {
        const [storedUnit, storedGymTracking, storedHealthSync, storedRemoteImages] = await Promise.all([
          getSetting('unit'),
          getSetting('gym_tracking_enabled'),
          getSetting('health_sync_enabled'),
          getSetting('remote_exercise_images'),
        ]);
        if (storedUnit === 'kg' || storedUnit === 'lb') setUnitState(storedUnit);
        setGymTrackingEnabledState(parseGymTrackingEnabled(storedGymTracking));
        const persistedHealthSync = parseHealthSyncEnabled(storedHealthSync, Platform.OS);
        setHealthSyncEnabledState(persistedHealthSync);
        setRemoteImagesEnabledState(parseRemoteExerciseImagesEnabled(storedRemoteImages));
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

  const setRemoteImagesEnabled = useCallback(async (enabled: boolean) => {
    const previous = remoteImagesEnabled;
    setRemoteImagesEnabledState(enabled);
    try {
      await setSetting('remote_exercise_images', enabled ? 'true' : 'false');
    } catch (err: any) {
      setRemoteImagesEnabledState(previous);
      await notify({
        title: 'Settings Error',
        message: err?.message || 'Failed to save exercise photo setting.',
      });
      throw err;
    }
  }, [remoteImagesEnabled, notify]);

  const setHealthSyncEnabled = useCallback(async (enabled: boolean) => {
    await updateHealthSyncSetting(enabled, healthSyncEnabled, {
      loadProvider: getPlatformHealthProvider,
      persist: (value) => setSetting('health_sync_enabled', value ? 'true' : 'false'),
      setState: setHealthSyncEnabledState,
      notify,
      retryPendingHealthSyncs,
      logRetryFailure: (error) => {
        console.error('Unable to retry pending health syncs', error);
      },
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
        remoteImagesEnabled,
        setRemoteImagesEnabled,
        loading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
