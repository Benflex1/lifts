/**
 * Completion marking for persisted workout records.
 *
 * Both stores keep only finished workouts in their main workout collections.
 * Native persists completion as the `in_progress` SQL column (0 = completed);
 * the web store stamps `inProgress: false` on the stored record. The marker
 * lets both platforms exclude foreign, legacy, or future in-progress records
 * from history, snapshots, stats, and PR inputs with the same rule.
 */

/** True when a raw persisted record is explicitly marked as in progress. */
export function isInProgressRecord(record: unknown): boolean {
  return Boolean(
    record &&
    typeof record === 'object' &&
    (record as { inProgress?: unknown }).inProgress === true,
  );
}

/**
 * Marks a workout record as completed before persisting it, mirroring the
 * native store's explicit `in_progress = 0` at the write sites.
 */
export function asCompletedRecord<T extends object>(record: T): T & { inProgress: false } {
  return { ...record, inProgress: false };
}
