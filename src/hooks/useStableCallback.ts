import { useCallback, useRef } from 'react';

/**
 * Returns a function whose identity never changes but always calls the latest `callback`.
 * Lets memoized list rows receive handlers without re-rendering whenever the parent does.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const ref = useRef(callback);
  ref.current = callback;
  return useCallback((...args: Args) => ref.current(...args), []);
}
