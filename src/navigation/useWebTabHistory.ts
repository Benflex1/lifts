import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { hashForTab, tabFromHash, type TabKey } from './tabRoutes';

interface WebTabHistoryOptions {
  tab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

/**
 * PROD-05: mirrors the active tab into the browser URL and history on web.
 * Deep links (`#/history`) select the tab on load; browser back/forward emit
 * `popstate` and select the matching tab; tab changes push a new entry.
 */
export function useWebTabHistory({ tab, onSelectTab }: WebTabHistoryOptions): void {
  const onSelectRef = useRef(onSelectTab);
  onSelectRef.current = onSelectTab;
  const initialTabRef = useRef<TabKey | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    // ARCH-08: this is genuine web-only behavior inside one module.
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const applyHash = () => {
      const next = tabFromHash(window.location.hash);
      if (next && next !== tabRef.current) onSelectRef.current(next);
    };

    // Deep link on load: select the requested tab, or normalise the URL to the
    // current tab without adding a history entry.
    const initial = tabFromHash(window.location.hash);
    initialTabRef.current = initial;
    if (!initial)
      window.history.replaceState({ tab: tabRef.current }, '', hashForTab(tabRef.current));
    else if (initial !== tabRef.current) onSelectRef.current(initial);

    window.addEventListener('popstate', applyHash);
    return () => window.removeEventListener('popstate', applyHash);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // The mount effect may have scheduled a deep-link state update. Do not
    // write the stale render tab while that update is still pending.
    if (initialTabRef.current && initialTabRef.current !== tab) return;
    const completingInitialLink = initialTabRef.current !== null;
    initialTabRef.current = null;
    const nextHash = hashForTab(tab);
    if (window.location.hash === nextHash) return;
    if (completingInitialLink) window.history.replaceState({ tab }, '', nextHash);
    else window.history.pushState({ tab }, '', nextHash);
  }, [tab]);
}
