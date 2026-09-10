import { Exercise, ExerciseGymScope, ExerciseScopeType } from '../types';

const GYM_SPECIFIC_EQUIPMENT = new Set(['machine', 'cable']);

export function defaultScopeForEquipment(equipment: string): ExerciseScopeType {
  return GYM_SPECIFIC_EQUIPMENT.has(equipment.trim().toLowerCase()) ? 'gym_specific' : 'global';
}

export function resolveExerciseScope(exercise: Exercise, override?: ExerciseGymScope): ExerciseScopeType {
  return override?.scopeType ?? defaultScopeForEquipment(exercise.equipment);
}

export function getAllowedGymIds(exercise: Exercise, override: ExerciseGymScope | undefined, currentGymId: string): Set<string> | null {
  const scope = resolveExerciseScope(exercise, override);
  if (scope === 'global') return null;
  if (scope === 'gym_specific') return new Set([currentGymId]);
  return new Set(override?.linkedGymIds ?? []);
}

export function validateExerciseGymScope(scope: ExerciseGymScope, knownGymIds: ReadonlySet<string>): void {
  if (!scope.exerciseId.trim()) throw new Error('exercise ID cannot be empty');
  const linkedGymIds = scope.linkedGymIds ?? [];
  if (scope.scopeType !== 'linked_group' && linkedGymIds.length > 0) {
    throw new Error('linked gym IDs are only valid for linked_group scopes');
  }
  if (scope.scopeType === 'linked_group') {
    if (linkedGymIds.length < 2) throw new Error('linked_group requires at least two gyms');
    if (new Set(linkedGymIds).size !== linkedGymIds.length) throw new Error('linked gym IDs contain a duplicate');
    for (const gymId of linkedGymIds) {
      if (!knownGymIds.has(gymId)) throw new Error(`unknown gym: ${gymId}`);
    }
  }
}
