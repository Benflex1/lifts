import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { TabKey } from './tabRoutes';

/**
 * ARCH-09: shell-level Android back handling. From a secondary tab, back
 * returns to the Workout tab and consumes the press; from Workout it falls
 * through so the platform exits the app. The active logger registers its own
 * (later) listener that minimizes the workout, so it keeps precedence.
 */
export function useAndroidBackToWorkout(tab: TabKey, onSelectTab: (tab: TabKey) => void): void {
  const onSelectRef = useRef(onSelectTab);
  onSelectRef.current = onSelectTab;

  useEffect(() => {
    // ARCH-08: genuine Android-only behavior inside one module.
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'workout') return false;
      onSelectRef.current('workout');
      return true;
    });
    return () => subscription.remove();
  }, [tab]);
}
