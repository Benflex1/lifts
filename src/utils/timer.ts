export function computeElapsedSeconds(startTimeIso: string, now: number): number {
  const start = new Date(startTimeIso).getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function computeRemaining(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * Milliseconds until the next change of `computeRemaining`.
 *
 * Rest-timer displays change once per second; scheduling the next wakeup at the
 * exact second boundary keeps one update per second instead of polling.
 * Returns 0 when the timer has already expired.
 */
export function nextRemainingTickDelay(endsAt: number, now: number): number {
  const remaining = computeRemaining(endsAt, now);
  if (remaining <= 0) return 0;
  const nextChangeAt = endsAt - (remaining - 1) * 1000;
  return Math.max(0, nextChangeAt - now);
}
