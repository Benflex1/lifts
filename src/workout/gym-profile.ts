import { Gym } from '../types';

export const GYM_COLOR_PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'] as const;
export const DEFAULT_GYM_COLOR = '#3B82F6';

export function validateGymName(name: string): string {
  if (typeof name !== 'string') throw new Error('gym name must be a string');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('gym name cannot be empty');
  if ([...trimmed].length > 80) throw new Error('gym name cannot exceed 80 Unicode characters');
  return trimmed;
}

export function validateGymColor(color: string): string {
  if (!(GYM_COLOR_PALETTE as readonly string[]).includes(color)) throw new Error('gym color must be from the approved palette');
  return color;
}

export function validateGymDeletion(gymId: string, replacementGymId: string, gyms: readonly Gym[]): void {
  if (gyms.length < 2) throw new Error('at least two gyms must exist before deletion');
  if (!gyms.some(gym => gym.id === gymId)) throw new Error(`unknown gym: ${gymId}`);
  if (!replacementGymId || replacementGymId === gymId) throw new Error('replacement gym must be different');
  if (!gyms.some(gym => gym.id === replacementGymId)) throw new Error(`unknown replacement gym: ${replacementGymId}`);
}
