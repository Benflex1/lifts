import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { WeightUnit } from '../utils/units';
import { getSetting, setSetting } from '../database/db';
import { useDialog } from './DialogContext';
import { getPlatformHealthProvider, retryPendingHealthSyncs } from '../health';
import { updateHealthSyncSetting } from '../health/settings';
import { parseGymTrackingEnabled, parseHealthSyncEnabled, parseRemoteExerciseImagesEnabled } from '../utils/settings';
import { TrackingType } from '../types';
import {
  EXERCISE_TRACKING_TYPES_KEY,
  parseTrackingTypeOverrides,
  parseTrackingTypesEnabled,
  serializeTrackingTypeOverrides,
  TRACKING_TYPES_ENABLED_KEY,
  TrackingTypeOverrides,
} from '../workout/tracking';

export interface SettingsContextType {
  unit: WeightUnit;
  setUnit: (unit: WeightUnit) => Promise<void>;
  gymTrackingEnabled: boolean;
  setGymTrackingEnabled: (enabled: boolean) => Promise<void>;
  healthSyncEnabled: boolean;
  setHealthSyncEnabled: (enabled: boolean) => Promise<void>;
  remoteImagesEnabled: boolean;
  setRemoteImagesEnabled: (enabled: boolean) => Promise<void>;
  trackingTypesEnabled: boolean;
  setTrackingTypesEnabled: (enabled: boolean) => Promise<void>;
  trackingTypeOverrides: TrackingTypeOverrides;
  setExerciseTrackingType: (exerciseId: string, type: TrackingType) => Promise<void>;
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
  trackingTypesEnabled: false,
  setTrackingTypesEnabled: async () => {},
  trackingTypeOverrides: {},
  setExerciseTrackingType: async () => {},
  loading: true,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unit, setUnitState] = useState<WeightUnit>('kg');
  const [gymTrackingEnabled, setGymTrackingEnabledState] = useState(true);
  const [healthSyncEnabled, setHealthSyncEnabledState] = useState(false);
  // Off until the stored preference is read, so a slow or failed read never fetches photos the user turned off.
  const [remoteImagesEnabled, setRemoteImagesEnabledState] = useState(false);
  const [trackingTypesEnabled, setTrackingTypesEnabledState] = useState(false);
  const [trackingTypeOverrides, setTrackingTypeOverridesState] = useState<TrackingTypeOverrides>({});
  const [loading, setLoading] = useState(true);
  const { notify } = useDialog();

  useEffect(() => {
    (async () => {
      try {
        const [
          storedUnit,
          storedGymTracking,
          storedHealthSync,
          storedRemoteImages,
          storedTrackingTypes,
          storedTrackingTypeOverrides,
        ] = await Promise.all([
          getSetting('unit'),
          getSetting('gym_tracking_enabled'),
          getSetting('health_sync_enabled'),
          getSetting('remote_exercise_images'),
          getSetting(TRACKING_TYPES_ENABLED_KEY),
          getSetting(EXERCISE_TRACKING_TYPES_KEY),
        ]);
        if (storedUnit === 'kg' || storedUnit === 'lb') setUnitState(storedUnit);
        setGymTrackingEnabledState(parseGymTrackingEnabled(storedGymTracking));
        const persistedHealthSync = parseHealthSyncEnabled(storedHealthSync, Platform.OS);
        setHealthSyncEnabledState(persistedHealthSync);
        setRemoteImagesEnabledState(parseRemoteExerciseImagesEnabled(storedRemoteImages));
        setTrackingTypesEnabledState(parseTrackingTypesEnabled(storedTrackingTypes));
        setTrackingTypeOverridesState(parseTrackingTypeOverrides(storedTrackingTypeOverrides));
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

  const setTrackingTypesEnabled = useCallback(async (enabled: boolean) => {
    const previous = trackingTypesEnabled;
    setTrackingTypesEnabledState(enabled);
    try {
      await setSetting(TRACKING_TYPES_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch (err: any) {
      setTrackingTypesEnabledState(previous);
      await notify({
        title: 'Settings Error',
        message: err?.message || 'Failed to save exercise tracking setting.',
      });
      throw err;
    }
  }, [trackingTypesEnabled, notify]);

  const setExerciseTrackingType = useCallback(async (exerciseId: string, type: TrackingType) => {
    const previous = trackingTypeOverrides;
    const next = { ...previous, [exerciseId]: type };
    setTrackingTypeOverridesState(next);
    try {
      await setSetting(EXERCISE_TRACKING_TYPES_KEY, serializeTrackingTypeOverrides(next));
    } catch (err: any) {
      setTrackingTypeOverridesState(previous);
      await notify({
        title: 'Settings Error',
        message: err?.message || 'Failed to save how this exercise is tracked.',
      });
      throw err;
    }
  }, [trackingTypeOverrides, notify]);

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
        trackingTypesEnabled,
        setTrackingTypesEnabled,
        trackingTypeOverrides,
        setExerciseTrackingType,
        loading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
