export function parseGymTrackingEnabled(value: string | null): boolean {
  return value !== 'false';
}

export function parseHealthSyncEnabled(value: string | null): boolean {
  return value === 'true';
}
