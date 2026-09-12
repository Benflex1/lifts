let lastWebTimer: ReturnType<typeof setTimeout> | null = null;

export async function initRestNotifications(): Promise<void> {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {}
  }
}

export async function scheduleRestNotification(
  endsAtMs: number,
  exerciseName?: string
): Promise<string | null> {
  await cancelRestNotification();
  const diffMs = endsAtMs - Date.now();
  if (diffMs <= 1000) return null;

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    lastWebTimer = setTimeout(() => {
      try {
        new Notification('Rest Finished!', {
          body: exerciseName ? `Time for your next set of ${exerciseName}.` : 'Time for your next set.',
          icon: '/favicon.png',
        });
      } catch {}
    }, diffMs);
    return 'web-timer';
  }
  return null;
}

export async function cancelRestNotification(): Promise<void> {
  if (lastWebTimer) {
    clearTimeout(lastWebTimer);
    lastWebTimer = null;
  }
}
