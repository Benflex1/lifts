import { computeRemaining } from './timer';

/** A running rest countdown. `endsAt` is wall-clock epoch ms, so it survives backgrounding. */
export interface RestCountdown {
  endsAt: number;
  totalSeconds: number;
  exerciseName?: string;
}

export type RestAlarmAction =
  | { kind: 'arm'; endsAt: number; exerciseName?: string }
  | { kind: 'cancel' }
  | { kind: 'none' };

/**
 * Moves a running rest by `deltaSeconds`, keeping `totalSeconds` in step so the progress bar
 * does not jump back. Returns null when no time is left after the change.
 */
export function shiftRestCountdown(
  countdown: RestCountdown,
  deltaSeconds: number,
  now: number
): RestCountdown | null {
  const endsAt = countdown.endsAt + deltaSeconds * 1000;
  if (computeRemaining(endsAt, now) <= 0) return null;
  return { ...countdown, endsAt, totalSeconds: Math.max(1, countdown.totalSeconds + deltaSeconds) };
}

/**
 * The OS rest alarm follows app visibility. While the app is on screen the in-app countdown
 * alerts the user, so the alarm is armed only as the app goes to the background and cancelled
 * when it returns. Arming at the start would also post a second alert over the open app.
 */
export function restAlarmForAppState(
  nextState: string,
  countdown: RestCountdown | null,
  now: number
): RestAlarmAction {
  if (nextState === 'active') return { kind: 'cancel' };
  if (nextState === 'background' && countdown && computeRemaining(countdown.endsAt, now) > 0) {
    return { kind: 'arm', endsAt: countdown.endsAt, exerciseName: countdown.exerciseName };
  }
  return { kind: 'none' };
}
