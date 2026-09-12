function isNodeEnvironment(): boolean {
  return (
    typeof (globalThis as any).__DEV__ === 'undefined' &&
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node)
  );
}

export async function initRestNotifications(): Promise<void> {
  if (typeof document !== 'undefined') {
    const { initRestNotifications } = await import('./restNotifications.web');
    return initRestNotifications();
  }
  if (isNodeEnvironment()) {
    return;
  }
  const { initRestNotifications } = await import('./restNotifications.native');
  return initRestNotifications();
}

export async function scheduleRestNotification(
  endsAtMs: number,
  exerciseName?: string
): Promise<string | null> {
  if (typeof document !== 'undefined') {
    const { scheduleRestNotification } = await import('./restNotifications.web');
    return scheduleRestNotification(endsAtMs, exerciseName);
  }
  if (isNodeEnvironment()) {
    return null;
  }
  const { scheduleRestNotification } = await import('./restNotifications.native');
  return scheduleRestNotification(endsAtMs, exerciseName);
}

export async function cancelRestNotification(): Promise<void> {
  if (typeof document !== 'undefined') {
    const { cancelRestNotification } = await import('./restNotifications.web');
    return cancelRestNotification();
  }
  if (isNodeEnvironment()) {
    return;
  }
  const { cancelRestNotification } = await import('./restNotifications.native');
  return cancelRestNotification();
}
