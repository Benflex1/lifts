import { Routine, WorkoutHistorySummary } from '../types';

/**
 * A program turns a routine folder into a rotation (Push → Pull → Legs). It is stored as one
 * JSON setting, so it travels with backups without a schema change. The next workout is never
 * stored: it is worked out from completed workouts, so it stays right after edits, deleted
 * workouts and restores.
 */
export const ROUTINE_PROGRAMS_KEY = 'routine_programs';

export const DELOAD_EVERY_OPTIONS = [3, 4, 5, 6] as const;

export interface RoutineProgram {
  folderName: string;
  /** Rotation order. Routines later added to the folder join at the end. */
  routineIds: string[];
  /** Workouts before this don't count toward the rotation or its cycles. */
  startedAt: string;
  /** Every Nth cycle is a deload, with lighter next targets. Absent means no deloads. */
  deloadEvery?: number;
  /** A skip or a different pick, honoured until a rotation workout finishes after it. */
  nextOverride?: { routineId: string; setAt: string };
}

export type RoutinePrograms = Record<string, RoutineProgram>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/** Reads the stored setting, dropping anything malformed instead of failing. */
export function parseRoutinePrograms(value: string | null): RoutinePrograms {
  if (!value) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return {};
  }
  if (!isRecord(raw)) return {};
  const programs: RoutinePrograms = {};
  for (const [folderName, entry] of Object.entries(raw)) {
    if (!isRecord(entry) || !folderName.trim()) continue;
    if (!Array.isArray(entry.routineIds) || !isTimestamp(entry.startedAt)) continue;
    const routineIds = entry.routineIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    const program: RoutineProgram = { folderName, routineIds: Array.from(new Set(routineIds)), startedAt: entry.startedAt };
    if (typeof entry.deloadEvery === 'number' && Number.isInteger(entry.deloadEvery) && entry.deloadEvery >= 2) {
      program.deloadEvery = entry.deloadEvery;
    }
    const override = entry.nextOverride;
    if (isRecord(override) && typeof override.routineId === 'string' && isTimestamp(override.setAt)) {
      program.nextOverride = { routineId: override.routineId, setAt: override.setAt };
    }
    programs[folderName] = program;
  }
  return programs;
}

export function serializeRoutinePrograms(programs: RoutinePrograms): string {
  return JSON.stringify(programs);
}

/** The folder's routines in rotation order: saved order first, then newer routines by creation date. */
export function resolveRotation(program: RoutineProgram, routines: readonly Routine[]): Routine[] {
  const inFolder = routines.filter((routine) => routine.folderName === program.folderName);
  const byId = new Map(inFolder.map((routine) => [routine.id, routine]));
  const ordered = program.routineIds.map((id) => byId.get(id)).filter((routine): routine is Routine => Boolean(routine));
  const listed = new Set(ordered.map((routine) => routine.id));
  const added = inFolder
    .filter((routine) => !listed.has(routine.id))
    // Stable, so routines created together keep the order the folder lists them in.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...ordered, ...added];
}

export interface ProgramState {
  program: RoutineProgram;
  rotation: Routine[];
  next: Routine;
  nextIndex: number;
  /** 1-based cycle the next workout belongs to. */
  cycle: number;
  /** Rotation workouts finished in the current cycle. */
  doneInCycle: number;
  /** Routines finished in the current cycle, so skipped ones don't show as done. */
  doneThisCycleIds: string[];
  isDeload: boolean;
  lastWorkout?: WorkoutHistorySummary;
  lastRoutine?: Routine;
  isOverridden: boolean;
}

/**
 * Where a program stands, from its folder's routines and the completed workout history. Returns
 * null when the folder has fewer than two routines left, since a rotation of one is just a routine.
 */
export function resolveProgramState(
  program: RoutineProgram,
  routines: readonly Routine[],
  history: readonly WorkoutHistorySummary[],
): ProgramState | null {
  const rotation = resolveRotation(program, routines);
  if (rotation.length < 2) return null;
  const indexById = new Map(rotation.map((routine, index) => [routine.id, index]));

  const startedAt = Date.parse(program.startedAt);
  const done = history
    .filter((workout) => workout.routineId !== undefined && indexById.has(workout.routineId))
    .filter((workout) => Date.parse(workout.startTime) >= startedAt)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));

  // Walk the rotation in time order: a new cycle starts each time it comes back around, so skips,
  // repeats and routines added later don't shift cycles (and deload weeks) after the fact.
  let cycle = 1;
  let previousIndex = -1;
  let doneThisCycle: string[] = [];
  for (const workout of done) {
    const index = indexById.get(workout.routineId!)!;
    if (previousIndex !== -1 && index <= previousIndex) {
      cycle += 1;
      doneThisCycle = [];
    }
    doneThisCycle.push(workout.routineId!);
    previousIndex = index;
  }

  const lastWorkout = done[done.length - 1];
  const lastIndex = previousIndex;
  let nextIndex = (lastIndex + 1) % rotation.length;

  // A skip or pick holds until a rotation workout finishes after it was made.
  const override = program.nextOverride;
  const overrideIndex = override ? indexById.get(override.routineId) : undefined;
  const lastFinishedAt = lastWorkout ? Date.parse(lastWorkout.endTime ?? lastWorkout.startTime) : undefined;
  const isOverridden = overrideIndex !== undefined
    && (lastFinishedAt === undefined || lastFinishedAt < Date.parse(override!.setAt));
  if (isOverridden) nextIndex = overrideIndex!;

  // The next workout opens a new cycle when it comes back around.
  if (lastIndex !== -1 && nextIndex <= lastIndex) {
    cycle += 1;
    doneThisCycle = [];
  }
  const doneInCycle = doneThisCycle.length;
  const isDeload = program.deloadEvery !== undefined && cycle % program.deloadEvery === 0;

  return {
    program,
    rotation,
    next: rotation[nextIndex],
    nextIndex,
    cycle,
    doneInCycle,
    doneThisCycleIds: Array.from(new Set(doneThisCycle)),
    isDeload,
    lastWorkout,
    lastRoutine: lastWorkout ? rotation[lastIndex] : undefined,
    isOverridden,
  };
}

/** States for every program with at least two routines, in folder name order. */
export function resolveProgramStates(
  programs: RoutinePrograms,
  routines: readonly Routine[],
  history: readonly WorkoutHistorySummary[],
): ProgramState[] {
  return Object.values(programs)
    .sort((a, b) => a.folderName.localeCompare(b.folderName))
    .map((program) => resolveProgramState(program, routines, history))
    .filter((state): state is ProgramState => state !== null);
}

// --- Deload sessions ---------------------------------------------------------------------------

/**
 * Workouts finished in a deload week. Their lighter numbers never become "last time" for next
 * targets, so a deload doesn't compound or reset progress.
 */
export const DELOAD_WORKOUTS_KEY = 'deload_workout_ids';
const MAX_DELOAD_WORKOUTS = 200;

export function parseDeloadWorkoutIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const raw = JSON.parse(value);
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  } catch {
    return [];
  }
}

export function addDeloadWorkoutId(value: string | null | undefined, workoutId: string): string {
  const ids = parseDeloadWorkoutIds(value).filter((id) => id !== workoutId);
  ids.push(workoutId);
  return JSON.stringify(ids.slice(-MAX_DELOAD_WORKOUTS));
}

/** Restores union the lists; rotations merge per folder with this device's winning. */
export function mergeDeloadWorkoutIds(existing: string | undefined, incoming: string): string {
  const ids = Array.from(new Set([...parseDeloadWorkoutIds(incoming), ...parseDeloadWorkoutIds(existing)]));
  return JSON.stringify(ids.slice(-MAX_DELOAD_WORKOUTS));
}

export function mergeRoutinePrograms(existing: string | undefined, incoming: string): string {
  return serializeRoutinePrograms({
    ...parseRoutinePrograms(incoming),
    ...parseRoutinePrograms(existing ?? null),
  });
}

/** Points the rotation at a routine until the next rotation workout finishes. */
export function withNextOverride(program: RoutineProgram, routineId: string, now: Date = new Date()): RoutineProgram {
  return { ...program, nextOverride: { routineId, setAt: now.toISOString() } };
}

/** The program a routine belongs to, if any, so starting it from anywhere counts toward the rotation. */
export function findProgramForRoutine(programs: RoutinePrograms, routine: Routine | undefined): RoutineProgram | undefined {
  if (!routine?.folderName) return undefined;
  return programs[routine.folderName];
}

export function renameProgramFolder(programs: RoutinePrograms, oldName: string, newName: string): RoutinePrograms {
  const program = programs[oldName];
  if (!program || oldName === newName) return programs;
  const { [oldName]: _old, ...rest } = programs;
  // A folder renamed onto an existing one merges its routines, so its own rotation wins.
  if (rest[newName]) return rest;
  return { ...rest, [newName]: { ...program, folderName: newName } };
}

export function removeProgramFolder(programs: RoutinePrograms, folderName: string): RoutinePrograms {
  if (!programs[folderName]) return programs;
  const { [folderName]: _removed, ...rest } = programs;
  return rest;
}

/** Human "today", "yesterday", "3 days ago" for the last workout line. */
export function formatDaysAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
}
