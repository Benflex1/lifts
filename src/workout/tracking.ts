import { ActiveExercise, Exercise, SetType, TrackingType, WorkoutSet } from '../types';
import { formatWeight, WeightUnit } from '../utils/units';

// Exercise tracking types are opt-in. With the setting off (the default) every exercise logs as
// weight × reps, and an exercise logged without a tracking type always reads as weight × reps.

export const TRACKING_TYPES_ENABLED_KEY = 'tracking_types_enabled';
export const EXERCISE_TRACKING_TYPES_KEY = 'exercise_tracking_types';

export const DEFAULT_TRACKING_TYPE: TrackingType = 'weight_reps';

export const TRACKING_TYPE_OPTIONS: { type: TrackingType; label: string; example: string }[] = [
  { type: 'weight_reps', label: 'Weight & Reps', example: 'Bench press, curls' },
  { type: 'bodyweight_reps', label: 'Bodyweight Reps', example: 'Push-ups, crunches' },
  { type: 'weighted_bodyweight', label: 'Weighted Bodyweight', example: 'Weighted pull-ups, dips' },
  { type: 'assisted_bodyweight', label: 'Assisted Bodyweight', example: 'Assisted pull-ups' },
  { type: 'duration', label: 'Time', example: 'Planks, stretches' },
  { type: 'distance_duration', label: 'Distance & Time', example: 'Running, rowing, cycling' },
];

const TRACKING_TYPE_SET = new Set<TrackingType>(TRACKING_TYPE_OPTIONS.map((option) => option.type));

export function isTrackingType(value: unknown): value is TrackingType {
  return typeof value === 'string' && TRACKING_TYPE_SET.has(value as TrackingType);
}

export function trackingTypeLabel(type: TrackingType): string {
  return TRACKING_TYPE_OPTIONS.find((option) => option.type === type)?.label ?? 'Weight & Reps';
}

export function parseTrackingTypesEnabled(value: string | null): boolean {
  return value === 'true';
}

export type TrackingTypeOverrides = Record<string, TrackingType>;

export function parseTrackingTypeOverrides(value: string | null | undefined): TrackingTypeOverrides {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const overrides: TrackingTypeOverrides = {};
    for (const [exerciseId, type] of Object.entries(parsed)) {
      if (isTrackingType(type)) overrides[exerciseId] = type;
    }
    return overrides;
  } catch {
    return {};
  }
}

export function serializeTrackingTypeOverrides(overrides: TrackingTypeOverrides): string {
  const sorted: TrackingTypeOverrides = {};
  for (const key of Object.keys(overrides).sort()) sorted[key] = overrides[key];
  return JSON.stringify(sorted);
}

/** Merges a restored backup's per-exercise choices under the ones already on this device. */
export function mergeTrackingTypeOverrides(existing: string | undefined, incoming: string): string {
  return serializeTrackingTypeOverrides({
    ...parseTrackingTypeOverrides(incoming),
    ...parseTrackingTypeOverrides(existing),
  });
}

const DURATION_EXERCISE_IDS = new Set(['Plank', 'Side_Bridge']);

/** A sensible starting type for a library or custom exercise, before the user picks one. */
export function suggestTrackingType(exercise: Pick<Exercise, 'id' | 'category' | 'equipment'>): TrackingType {
  if (exercise.category === 'cardio') return 'distance_duration';
  if (exercise.category === 'stretching' || DURATION_EXERCISE_IDS.has(exercise.id)) return 'duration';
  if (exercise.equipment === 'body only') return 'bodyweight_reps';
  return DEFAULT_TRACKING_TYPE;
}

/** The type a newly added exercise logs with: always weight × reps while the setting is off. */
export function resolveTrackingTypeForExercise(
  exercise: Pick<Exercise, 'id' | 'category' | 'equipment'>,
  enabled: boolean,
  overrides: TrackingTypeOverrides,
): TrackingType {
  if (!enabled) return DEFAULT_TRACKING_TYPE;
  return overrides[exercise.id] ?? suggestTrackingType(exercise);
}

/** The type an exercise in a workout was logged with. */
export function getTrackingType(exercise: Pick<ActiveExercise, 'trackingType'> | undefined): TrackingType {
  return exercise?.trackingType ?? DEFAULT_TRACKING_TYPE;
}

/** Stores only non-default types, so workouts logged with the setting off look exactly like before. */
export function withTrackingType<T extends { trackingType?: TrackingType }>(item: T, type: TrackingType): T {
  const { trackingType: _previous, ...rest } = item;
  return (type === DEFAULT_TRACKING_TYPE ? rest : { ...rest, trackingType: type }) as T;
}

export function usesWeight(type: TrackingType): boolean {
  return type === 'weight_reps' || type === 'weighted_bodyweight' || type === 'assisted_bodyweight';
}

export function usesReps(type: TrackingType): boolean {
  return type !== 'duration' && type !== 'distance_duration';
}

export function usesDuration(type: TrackingType): boolean {
  return type === 'duration' || type === 'distance_duration';
}

export function usesDistance(type: TrackingType): boolean {
  return type === 'distance_duration';
}

/** Whether a type's sets carry load that counts toward kg volume, 1RM and weight records. */
export function countsLoad(type: TrackingType): boolean {
  return type === 'weight_reps' || type === 'weighted_bodyweight';
}

export function setVolumeKg(set: Pick<WorkoutSet, 'weightKg' | 'reps'>, type: TrackingType): number {
  return countsLoad(type) ? set.weightKg * set.reps : 0;
}

export function exerciseVolumeKg(exercise: Pick<ActiveExercise, 'sets' | 'trackingType'>, completedOnly = true): number {
  const type = getTrackingType(exercise);
  return exercise.sets
    .filter((set) => !completedOnly || set.isCompleted)
    .reduce((sum, set) => sum + setVolumeKg(set, type), 0);
}

export function workoutVolumeKg(exercises: Pick<ActiveExercise, 'sets' | 'trackingType'>[]): number {
  return exercises.reduce((sum, exercise) => sum + exerciseVolumeKg(exercise), 0);
}

function validateWeightAndReps(set: WorkoutSet, requireWeight: boolean): string | null {
  if (requireWeight) {
    if (typeof set.weightKg !== 'number' || !Number.isFinite(set.weightKg)) {
      return 'Weight must be a valid number';
    }
    if (set.weightKg < 0) {
      return 'Weight cannot be negative';
    }
  }
  if (typeof set.reps !== 'number' || !Number.isFinite(set.reps)) {
    return 'Reps must be a valid number';
  }
  if (!Number.isInteger(set.reps)) {
    return 'Reps must be a whole number';
  }
  if (set.reps <= 0) {
    return 'Reps must be greater than 0';
  }
  return null;
}

function isPositiveNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function validateTrackedSet(set: WorkoutSet, type: TrackingType): string | null {
  switch (type) {
    case 'bodyweight_reps':
      return validateWeightAndReps(set, false);
    case 'duration':
      return isPositiveNumber(set.durationSeconds) ? null : 'Time must be greater than 0';
    case 'distance_duration':
      if (set.distanceM !== undefined && (!Number.isFinite(set.distanceM) || set.distanceM < 0)) {
        return 'Distance cannot be negative';
      }
      return isPositiveNumber(set.durationSeconds) || isPositiveNumber(set.distanceM)
        ? null
        : 'Enter a distance or a time';
    default:
      return validateWeightAndReps(set, true);
  }
}

/** Fills empty inputs from last session's numbers when a set is checked off, like weight × reps does. */
export function fillTrackedSetFromPrevious(set: WorkoutSet, type: TrackingType): WorkoutSet {
  if (type === 'duration' || type === 'distance_duration') {
    const durationSeconds = isPositiveNumber(set.durationSeconds) ? set.durationSeconds : set.previousDurationSeconds;
    const distanceM = usesDistance(type) && !isPositiveNumber(set.distanceM) && !isPositiveNumber(set.durationSeconds)
      ? set.previousDistanceM
      : set.distanceM;
    return {
      ...set,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(distanceM !== undefined ? { distanceM } : {}),
    };
  }
  return set;
}

// --- Time -----------------------------------------------------------------------------------

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatSetDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Accepts "45" (seconds), "1:30" or "1:02:05". Returns undefined for anything else. */
export function parseSetDuration(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(trimmed)) return undefined;
  const parts = trimmed.split(':').map((part) => parseInt(part, 10));
  if (parts.slice(1).some((part) => part >= 60)) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function sanitizeDurationInput(input: string): string {
  return input.replace(/[.,]/g, ':').replace(/[^0-9:]/g, '');
}

// --- Distance -------------------------------------------------------------------------------

export type DistanceUnit = 'km' | 'mi';

export const METERS_PER_MILE = 1609.344;

/** Distances follow the weight unit: kilometres with kg, miles with lb. */
export function distanceUnitFor(unit: WeightUnit): DistanceUnit {
  return unit === 'lb' ? 'mi' : 'km';
}

export function metersToDisplay(meters: number, unit: DistanceUnit): number {
  const value = unit === 'mi' ? meters / METERS_PER_MILE : meters / 1000;
  return Math.round(value * 100) / 100;
}

export function displayToMeters(value: number, unit: DistanceUnit): number {
  const meters = unit === 'mi' ? value * METERS_PER_MILE : value * 1000;
  return Math.round(meters * 10) / 10;
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  const display = metersToDisplay(meters, unit);
  return `${Number.isInteger(display) ? display.toString() : display.toFixed(2).replace(/0$/, '')} ${unit}`;
}

// --- Summaries ------------------------------------------------------------------------------

export interface TrackedSetValues {
  weightKg: number;
  reps: number;
  durationSeconds?: number;
  distanceM?: number;
}

/** One-line set summary for history, records and the previous column. */
export function formatTrackedSet(set: TrackedSetValues, type: TrackingType, unit: WeightUnit): string {
  switch (type) {
    case 'bodyweight_reps':
      return `${set.reps} reps`;
    case 'weighted_bodyweight':
      return set.weightKg > 0 ? `+${formatWeight(set.weightKg, unit)} × ${set.reps}` : `${set.reps} reps`;
    case 'assisted_bodyweight':
      return set.weightKg > 0 ? `−${formatWeight(set.weightKg, unit)} × ${set.reps}` : `${set.reps} reps`;
    case 'duration':
      return formatSetDuration(set.durationSeconds ?? 0);
    case 'distance_duration': {
      const parts: string[] = [];
      if (isPositiveNumber(set.distanceM)) parts.push(formatDistance(set.distanceM, distanceUnitFor(unit)));
      if (isPositiveNumber(set.durationSeconds)) parts.push(formatSetDuration(set.durationSeconds));
      return parts.length > 0 ? parts.join(' · ') : '—';
    }
    default:
      return `${formatWeight(set.weightKg, unit)} × ${set.reps}`;
  }
}

/** Whether a set or previous-session suggestion carries any logged numbers. */
export function hasTrackedValues(set: TrackedSetValues | undefined): boolean {
  if (!set) return false;
  return set.weightKg > 0 || set.reps > 0 || isPositiveNumber(set.durationSeconds) || isPositiveNumber(set.distanceM);
}

// --- Previous-session suggestions -------------------------------------------------------------

type PreviousTrackedFields = Pick<WorkoutSet, 'previousDurationSeconds' | 'previousDistanceM' | 'previousType' | 'previousRpe'>;

/**
 * Replaces a set's previous time, distance, set type and RPE with a suggestion's. Sets logged as
 * weight × reps never gain the time and distance keys, so they stay exactly as they were before
 * tracking types existed.
 */
export function withPreviousTracked<T extends PreviousTrackedFields>(
  set: T,
  source: { durationSeconds?: number; distanceM?: number; type?: SetType; rpe?: number } | undefined,
): T {
  const {
    previousDurationSeconds: _duration,
    previousDistanceM: _distance,
    previousType: _type,
    previousRpe: _rpe,
    ...rest
  } = set;
  return {
    ...rest,
    ...(source?.durationSeconds !== undefined ? { previousDurationSeconds: source.durationSeconds } : {}),
    ...(source?.distanceM !== undefined ? { previousDistanceM: source.distanceM } : {}),
    ...(source?.type !== undefined ? { previousType: source.type } : {}),
    ...(source?.rpe !== undefined && source.rpe !== null ? { previousRpe: source.rpe } : {}),
  } as T;
}

// --- Records --------------------------------------------------------------------------------

export interface SetRecordValues {
  weight: number;
  '1rm': number;
  volume: number;
  reps: number;
  duration: number;
  distance: number;
}

/**
 * The record values one completed set counts toward. Weight × reps keeps its long-standing rules:
 * loaded sets count for weight, 1RM and volume, and unloaded sets count for reps.
 */
export function setRecordValues(
  set: Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationSeconds' | 'distanceM'>,
  type: TrackingType,
  estimate1RM: (weightKg: number, reps: number) => number,
): SetRecordValues {
  const values: SetRecordValues = { weight: 0, '1rm': 0, volume: 0, reps: 0, duration: 0, distance: 0 };
  switch (type) {
    case 'bodyweight_reps':
      if (set.reps > 0) values.reps = set.reps;
      break;
    case 'assisted_bodyweight':
      if (set.weightKg === 0 && set.reps > 0) values.reps = set.reps;
      break;
    case 'duration':
      if (isPositiveNumber(set.durationSeconds)) values.duration = set.durationSeconds;
      break;
    case 'distance_duration':
      if (isPositiveNumber(set.durationSeconds)) values.duration = set.durationSeconds;
      if (isPositiveNumber(set.distanceM)) values.distance = set.distanceM;
      break;
    default:
      if (set.weightKg > 0) {
        values.weight = set.weightKg;
        if (set.reps > 0) {
          values['1rm'] = estimate1RM(set.weightKg, set.reps);
          values.volume = set.weightKg * set.reps;
        }
      } else if (set.reps > 0) {
        values.reps = set.reps;
      }
  }
  return values;
}

/** Headline for a type's best completed set, e.g. "25 reps", "1:30" or "5 km". Null for weight × reps. */
export function formatBestTrackedSet(
  sets: Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationSeconds' | 'distanceM'>[],
  type: TrackingType,
  unit: WeightUnit,
): string | null {
  if (countsLoad(type) || sets.length === 0) return null;
  if (type === 'duration') {
    const best = Math.max(0, ...sets.map((set) => set.durationSeconds ?? 0));
    return best > 0 ? formatSetDuration(best) : null;
  }
  if (type === 'distance_duration') {
    const bestDistance = Math.max(0, ...sets.map((set) => set.distanceM ?? 0));
    if (bestDistance > 0) return formatDistance(bestDistance, distanceUnitFor(unit));
    const bestDuration = Math.max(0, ...sets.map((set) => set.durationSeconds ?? 0));
    return bestDuration > 0 ? formatSetDuration(bestDuration) : null;
  }
  const bestReps = Math.max(0, ...sets.map((set) => set.reps));
  return bestReps > 0 ? `${bestReps} reps` : null;
}
