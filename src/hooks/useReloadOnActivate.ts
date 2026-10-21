import { createContext, useContext, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Tabs mount on first visit and stay mounted (hidden) so switching back is instant; heavy tabs
 * are released again after a retention window (PERF-11). Each tab gets an activation emitter
 * through context; because the emitter object never changes, a hidden tab is never re-rendered
 * just because the selected tab changed.
 */
export interface ActivationEmitter {
  subscribe: (listener: () => void) => () => void;
  emit: () => void;
}

export function createActivationEmitter(): ActivationEmitter {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      listeners.forEach(listener => listener());
    },
  };
}

export const TabActivationContext = createContext<ActivationEmitter | null>(null);

/**
 * Refreshes a tab's data whenever the user returns to it. The refresh runs after the switch has
 * rendered, so it never delays the tap itself.
 */
export function useReloadOnActivate(reload: () => void) {
  const emitter = useContext(TabActivationContext);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!emitter) return;
    let task: { cancel: () => void } | null = null;
    const unsubscribe = emitter.subscribe(() => {
      task?.cancel();
      task = InteractionManager.runAfterInteractions(() => reloadRef.current());
    });
    return () => {
      task?.cancel();
      unsubscribe();
    };
  }, [emitter]);
}
