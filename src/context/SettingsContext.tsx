import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { WeightUnit } from '../utils/units';
import { getSetting, setSetting } from '../database/db';

interface SettingsContextType {
  unit: WeightUnit;
  setUnit: (unit: WeightUnit) => void;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  unit: 'kg',
  setUnit: () => {},
  loading: true,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unit, setUnitState] = useState<WeightUnit>('kg');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getSetting('unit');
      if (stored === 'kg' || stored === 'lb') {
        setUnitState(stored);
      }
      setLoading(false);
    })();
  }, []);

  const setUnit = useCallback((u: WeightUnit) => {
    setUnitState(u);
    setSetting('unit', u);
  }, []);

  return (
    <SettingsContext.Provider value={{ unit, setUnit, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
