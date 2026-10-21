import { Routine } from '../../types';
import { getSupersetMetadata } from '../../workout/supersets';

/**
 * ARCH-13: pure helpers backing the workout (routines) screen. Kept free of
 * React so folder handling and routine summaries are directly testable.
 */

/** 'All' followed by every distinct folder name, in routine order. */
export function collectRoutineFolders(routines: Routine[]): string[] {
  return [
    'All',
    ...Array.from(new Set(routines.map(r => r.folderName).filter(Boolean) as string[])),
  ];
}

export function filterRoutinesByFolder(routines: Routine[], selectedFolder: string): Routine[] {
  return selectedFolder === 'All'
    ? routines
    : routines.filter(r => r.folderName === selectedFolder);
}

export interface RoutineSummary {
  hasSupersets: boolean;
  exerciseCount: number;
  setCount: number;
  preview: string;
}

export function buildRoutineSummary(routine: Routine): RoutineSummary {
  return {
    hasSupersets: getSupersetMetadata(routine.exercises).size > 0,
    exerciseCount: routine.exercises.length,
    setCount: routine.exercises.reduce((sum, re) => sum + (re.targetSets || 0), 0),
    preview: routine.exercises.map(re => re.exercise.name).join(' · '),
  };
}

/** Long weekday label shown above the screen title. */
export function formatTodayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/** '1.5h' for an hour or more, otherwise rounded minutes. */
export function formatWeekDuration(totalSeconds: number): string {
  return totalSeconds >= 3600
    ? `${(totalSeconds / 3600).toFixed(1)}h`
    : `${Math.round(totalSeconds / 60)}m`;
}
