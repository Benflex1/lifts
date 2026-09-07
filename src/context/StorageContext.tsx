import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getStore, initDatabase } from '../database/db';

export interface StorageContextValue {
  isReady: boolean;
  isReadOnly: boolean;
  error: string | null;
  retry: () => Promise<void>;
  takeOverLease: () => Promise<boolean>;
}

const StorageContext = createContext<StorageContextValue>({
  isReady: false,
  isReadOnly: false,
  error: null,
  retry: async () => {},
  takeOverLease: async () => false,
});

export function useStorage() {
  return useContext(StorageContext);
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(async () => {
    setIsReady(false);
    setError(null);
    try {
      await initDatabase();
      const store = await getStore();
      setIsReadOnly(Boolean(store.isReadOnly?.()));
      setIsReady(true);
    } catch (err: any) {
      console.error('Storage initialization failed:', err);
      setError(err?.message || 'Storage initialization failed');
      setIsReady(false);
    }
  }, []);

  const takeOverLease = useCallback(async () => {
    try {
      const store = await getStore();
      if (store.tryAcquireLease) {
        const acquired = await store.tryAcquireLease();
        setIsReadOnly(!acquired);
        return acquired;
      }
      return true;
    } catch (err: any) {
      console.error('Failed to take over storage lease:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <StorageContext.Provider
      value={{
        isReady,
        isReadOnly,
        error,
        retry: init,
        takeOverLease,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
}
