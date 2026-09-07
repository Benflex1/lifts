import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { WeightUnit } from '../utils/units';
import { getSetting, setSetting } from '../database/db';
import { useDialog } from './DialogContext';

interface SettingsContextType {
  unit: WeightUnit;
  setUnit: (unit: WeightUnit) => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  unit: 'kg',
  setUnit: async () => {},
  loading: true,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unit, setUnitState] = useState<WeightUnit>('kg');
  const [loading, setLoading] = useState(true);
  const { notify } = useDialog();

  useEffect(() => {
    (async () => {
      try {
        const stored = await getSetting('unit');
        if (stored === 'kg' || stored === 'lb') {
          setUnitState(stored);
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

  return (
    <SettingsContext.Provider value={{ unit, setUnit, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);

