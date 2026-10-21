export interface Debouncer<T> {
  /** Stores the latest value; flushes it once `delayMs` passes without another call. */
  schedule(value: T): void;
  /** Commits the pending value immediately (e.g. on blur or unmount). */
  flushNow(): void;
  /** Drops the pending value without committing (e.g. an explicit clear). */
  cancel(): void;
}

/**
 * Minimal trailing-edge debouncer. Keeps high-frequency input (search text,
 * note typing) from committing a session write on every keystroke.
 */
export function createDebouncer<T>(delayMs: number, onFlush: (value: T) => void): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;

  const stopTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule(value: T) {
      pending = { value };
      stopTimer();
      timer = setTimeout(() => {
        timer = null;
        if (pending === null) return;
        const valueToFlush = pending.value;
        pending = null;
        onFlush(valueToFlush);
      }, delayMs);
    },

    flushNow() {
      stopTimer();
      if (pending === null) return;
      const valueToFlush = pending.value;
      pending = null;
      onFlush(valueToFlush);
    },

    cancel() {
      stopTimer();
      pending = null;
    },
  };
}
