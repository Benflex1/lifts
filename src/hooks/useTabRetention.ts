import { useCallback, useEffect, useRef, useState } from 'react';

/** PERF-11: a heavy tab hidden longer than this is unmounted so its retained state is released. */
export const TAB_RETENTION_MS = 5 * 60 * 1000;

/** Retention is checked at this cadence; eviction lands within one sweep of the deadline. */
const RETENTION_SWEEP_MS = 30 * 1000;

export interface TabRetentionOptions<T extends string> {
  /** Tab mounted at startup. */
  initialTab: T;
  /** Tab currently on screen, or null while another surface (e.g. the workout logger) covers it. */
  visibleTab: T | null;
  /** Tabs eligible for release; every other tab stays mounted once visited. */
  evictableTabs: ReadonlySet<T>;
  /** Time a hidden evictable tab is kept mounted. Defaults to {@link TAB_RETENTION_MS}. */
  retentionMs?: number;
  /** Retention sweep interval. Defaults to 30 seconds. */
  sweepMs?: number;
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface TabRetention<T extends string> {
  mountedTabs: ReadonlySet<T>;
  /** Records a visit; the tab stays mounted until it sits hidden for a full retention window. */
  mountTab: (tab: T) => void;
}

/**
 * PERF-11: tabs mount on first visit and stay mounted (hidden) so switching back is instant, but
 * evictable tabs are released once they have been hidden for `retentionMs`, so a long session
 * does not retain the state and subscriptions of every screen the user has ever touched.
 * Revisiting a released tab mounts it fresh and reloads its data.
 */
export function useTabRetention<T extends string>({
  initialTab,
  visibleTab,
  evictableTabs,
  retentionMs = TAB_RETENTION_MS,
  sweepMs = RETENTION_SWEEP_MS,
  now = Date.now,
}: TabRetentionOptions<T>): TabRetention<T> {
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<T>>(() => new Set<T>([initialTab]));
  const hiddenSinceRef = useRef(new Map<T, number>());
  const previousVisibleRef = useRef<T | null>(visibleTab);
  const visibleRef = useRef<T | null>(visibleTab);
  const nowRef = useRef(now);
  nowRef.current = now;

  const mountTab = useCallback((tab: T) => {
    setMountedTabs(previous => (previous.has(tab) ? previous : new Set(previous).add(tab)));
  }, []);

  // Start the retention clock when a tab stops being visible; opening the logger also hides the
  // current tab, so the clock runs while the user is deep in a workout.
  useEffect(() => {
    const previous = previousVisibleRef.current;
    previousVisibleRef.current = visibleTab;
    visibleRef.current = visibleTab;
    if (visibleTab !== null) {
      hiddenSinceRef.current.delete(visibleTab);
    }
    if (previous !== null && previous !== visibleTab && evictableTabs.has(previous)) {
      hiddenSinceRef.current.set(previous, nowRef.current());
    }
  }, [visibleTab, evictableTabs]);

  useEffect(() => {
    const timer = setInterval(() => {
      const timestamp = nowRef.current();
      const expired: T[] = [];
      for (const [tab, hiddenSince] of hiddenSinceRef.current) {
        if (tab !== visibleRef.current && timestamp - hiddenSince >= retentionMs) {
          expired.push(tab);
        }
      }
      if (expired.length === 0) return;
      for (const tab of expired) {
        hiddenSinceRef.current.delete(tab);
      }
      setMountedTabs(previous => {
        const next = new Set(previous);
        let changed = false;
        for (const tab of expired) {
          changed = next.delete(tab) || changed;
        }
        return changed ? next : previous;
      });
    }, sweepMs);
    return () => clearInterval(timer);
  }, [evictableTabs, retentionMs, sweepMs]);

  return { mountedTabs, mountTab };
}
