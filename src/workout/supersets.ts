import { ActiveExercise, RoutineExercise, Workout, WorkoutSet } from '../types';

export interface SupersetGroupInfo {
  id: string; // supersetId
  label: string; // 'SUPERSET A', 'GIANT SET B', etc.
  type: 'superset' | 'giant_set';
  color: string;
  exerciseIds: string[];
}

export interface ExerciseSupersetMeta {
  groupId: string;
  label: string;
  type: 'superset' | 'giant_set';
  color: string;
  isFirst: boolean;
  isLast: boolean;
  positionInGroup: number;
  totalInGroup: number;
}

export const SUPERSET_PALETTE = [
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
];

/**
 * Analyses an exercise sequence (either active exercises or routine exercises)
 * and returns grouped metadata keyed by exercise ID.
 */
export function getSupersetMetadata(
  exercises: Array<{ id: string; supersetId?: string }>
): Map<string, ExerciseSupersetMeta> {
  const result = new Map<string, ExerciseSupersetMeta>();

  // 1. Collect contiguous or distinct superset groups
  const groupsOrder: string[] = [];
  const groupMembers = new Map<string, string[]>();

  for (const ex of exercises) {
    if (!ex.supersetId) continue;
    const sid = ex.supersetId;
    if (!groupMembers.has(sid)) {
      groupMembers.set(sid, []);
      groupsOrder.push(sid);
    }
    groupMembers.get(sid)!.push(ex.id);
  }

  // Filter out singleton groups (must have at least 2 exercises to qualify as superset)
  const validGroups = groupsOrder.filter((gid) => (groupMembers.get(gid)?.length || 0) >= 2);

  validGroups.forEach((gid, groupIndex) => {
    const memberIds = groupMembers.get(gid)!;
    const isGiant = memberIds.length >= 3;
    const letter = String.fromCharCode(65 + (groupIndex % 26)); // A, B, C...
    const label = isGiant ? `GIANT SET ${letter}` : `SUPERSET ${letter}`;
    const color = SUPERSET_PALETTE[groupIndex % SUPERSET_PALETTE.length];

    memberIds.forEach((exId, idx) => {
      result.set(exId, {
        groupId: gid,
        label,
        type: isGiant ? 'giant_set' : 'superset',
        color,
        isFirst: idx === 0,
        isLast: idx === memberIds.length - 1,
        positionInGroup: idx + 1,
        totalInGroup: memberIds.length,
      });
    });
  });

  return result;
}

export interface NextSupersetTarget {
  nextExerciseId: string;
  nextExerciseName: string;
  nextSetId: string;
  nextSetNumber: number;
  isRoundComplete: boolean;
}

/**
 * When a set in a superset is completed, resolves the alternating target set
 * (e.g. Ex A Set 1 -> Ex B Set 1, or indicates round is completed to rest).
 */
export function resolveNextSupersetTarget(
  workout: Workout,
  completedExerciseId: string,
  completedSetId: string
): NextSupersetTarget | null {
  const currentEx = workout.exercises.find((e) => e.id === completedExerciseId);
  if (!currentEx || !currentEx.supersetId) return null;

  const currentSet = currentEx.sets.find((s) => s.id === completedSetId);
  if (!currentSet) return null;

  // Warmup sets do not trigger superset circuit switching.
  // Lifters perform warmups locally at their station before beginning working superset rounds.
  if (currentSet.type === 'warmup') {
    return null;
  }

  // Working sets in current exercise
  const currentWorkingSets = currentEx.sets.filter((s) => s.type !== 'warmup');
  const currentWorkingIndex = currentWorkingSets.findIndex((s) => s.id === completedSetId);
  if (currentWorkingIndex === -1) return null;

  // Find all exercises belonging to the same superset
  const supersetExercises = workout.exercises.filter(
    (e) => e.supersetId === currentEx.supersetId
  );
  if (supersetExercises.length < 2) return null;

  const currentExGroupIndex = supersetExercises.findIndex((e) => e.id === completedExerciseId);
  if (currentExGroupIndex === -1) return null;

  const isLastExerciseInGroup = currentExGroupIndex === supersetExercises.length - 1;

  if (!isLastExerciseInGroup) {
    // Next exercise in the same working set round
    const nextEx = supersetExercises[currentExGroupIndex + 1];
    const nextWorkingSets = nextEx.sets.filter((s) => s.type !== 'warmup');

    // Find corresponding working set index or first incomplete working set in nextEx
    const matchingSet =
      (!nextWorkingSets[currentWorkingIndex]?.isCompleted
        ? nextWorkingSets[currentWorkingIndex]
        : undefined) ?? nextWorkingSets.find((s) => !s.isCompleted);

    if (matchingSet && !matchingSet.isCompleted) {
      return {
        nextExerciseId: nextEx.id,
        nextExerciseName: nextEx.exercise?.name || 'Exercise',
        nextSetId: matchingSet.id,
        nextSetNumber: matchingSet.setNumber,
        isRoundComplete: false,
      };
    }
  } else {
    // Last exercise in group completed this working set -> this round is complete!
    // Check if subsequent working rounds remain in the superset
    const firstEx = supersetExercises[0];
    const firstExWorkingSets = firstEx.sets.filter((s) => s.type !== 'warmup');
    const nextRoundIndex = currentWorkingIndex + 1;

    const hasMoreSets = supersetExercises.some((e) => {
      const wSets = e.sets.filter((s) => s.type !== 'warmup');
      return wSets.length > nextRoundIndex && !wSets[nextRoundIndex].isCompleted;
    });

    if (hasMoreSets && firstExWorkingSets[nextRoundIndex]) {
      return {
        nextExerciseId: firstEx.id,
        nextExerciseName: firstEx.exercise?.name || 'Exercise',
        nextSetId: firstExWorkingSets[nextRoundIndex].id,
        nextSetNumber: firstExWorkingSets[nextRoundIndex].setNumber,
        isRoundComplete: true,
      };
    }

    return {
      nextExerciseId: '',
      nextExerciseName: '',
      nextSetId: '',
      nextSetNumber: 0,
      isRoundComplete: true,
    };
  }

  return null;
}

/**
 * Merges or creates superset grouping between two exercise items.
 * If either item already belongs to a group, or if both belong to separate groups,
 * merges all members of both groups into one unified superset ID.
 */
export function linkExercisesInGroup<T extends { supersetId?: string }>(
  items: T[],
  firstIndex: number,
  secondIndex: number,
  fallbackNewId: string
): T[] {
  if (
    firstIndex < 0 ||
    firstIndex >= items.length ||
    secondIndex < 0 ||
    secondIndex >= items.length
  ) {
    return items;
  }
  const current = items[firstIndex];
  const next = items[secondIndex];
  const oldId1 = current.supersetId;
  const oldId2 = next.supersetId;
  const supersetId = oldId1 || oldId2 || fallbackNewId;

  return items.map((item, idx) => {
    if (
      idx === firstIndex ||
      idx === secondIndex ||
      (oldId1 && item.supersetId === oldId1) ||
      (oldId2 && item.supersetId === oldId2)
    ) {
      return { ...item, supersetId };
    }
    return item;
  });
}

/**
 * Removes an exercise from its superset group.
 * If the remaining group has fewer than 2 members, cleans up the orphaned member.
 */
export function unlinkExerciseFromGroup<T extends { supersetId?: string }>(
  items: T[],
  targetIndex: number
): T[] {
  if (targetIndex < 0 || targetIndex >= items.length) return items;
  const target = items[targetIndex];
  if (!target.supersetId) return items;
  const oldId = target.supersetId;

  const updated = items.map((item, idx) =>
    idx === targetIndex ? { ...item, supersetId: undefined } : item
  );
  const remainingCount = updated.filter((item) => item.supersetId === oldId).length;
  if (remainingCount < 2) {
    return updated.map((item) =>
      item.supersetId === oldId ? { ...item, supersetId: undefined } : item
    );
  }
  return updated;
}
