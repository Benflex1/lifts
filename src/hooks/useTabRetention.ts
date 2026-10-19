import { useCallback, useState } from 'react';

export interface TabRetentionOptions<T extends string> {
  initialTab: T;
}

export interface TabRetention<T extends string> {
  mountedTabs: ReadonlySet<T>;
  mountTab: (tab: T) => void;
}

/**
 * Mount tabs on first visit and preserve their UI state for the app session.
 * Keep code splitting independent of screen lifetime: timed eviction discarded
 * filters and could leave an empty pane when the logger was minimized.
 */
export function useTabRetention<T extends string>({
  initialTab,
}: TabRetentionOptions<T>): TabRetention<T> {
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<T>>(() => new Set<T>([initialTab]));
  const mountTab = useCallback((tab: T) => {
    setMountedTabs(previous => (previous.has(tab) ? previous : new Set(previous).add(tab)));
  }, []);
  return { mountedTabs, mountTab };
}
