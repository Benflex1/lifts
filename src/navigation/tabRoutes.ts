/**
 * ARCH-09/PROD-05: the app keeps the fixed four-tab model. Routes are the tab
 * keys; on web they map to `#/<tab>` so refresh, bookmarks, and the browser back
 * button work without a navigation framework. If a future flow needs nested
 * stacks or parameterised deep links, this is the seam to replace with
 * expo-router; see docs/navigation.md.
 */
export type TabKey = 'workout' | 'history' | 'exercises' | 'analytics';

export const TAB_KEYS: readonly TabKey[] = ['workout', 'history', 'exercises', 'analytics'];

const TAB_KEY_SET = new Set<string>(TAB_KEYS);

/** Parses `#/history` (or `history`, `#history`) into a tab key; null when unknown. */
export function tabFromHash(hash: string): TabKey | null {
  const normalized = hash
    .trim()
    .replace(/^#/, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  return TAB_KEY_SET.has(normalized) ? (normalized as TabKey) : null;
}

export function hashForTab(tab: TabKey): string {
  return `#/${tab}`;
}
