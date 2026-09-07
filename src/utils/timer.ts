export function computeElapsedSeconds(startTimeIso: string, now: number): number {
  const start = new Date(startTimeIso).getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function computeRemaining(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function rebaseStartTime(now: number, durationSeconds: number): string {
  return new Date(now - durationSeconds * 1000).toISOString();
}
