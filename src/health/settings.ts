import type { HealthProvider } from './contract';

const unavailableError = 'Health sync is unavailable on this device.';
const permissionError = 'Health sync permission was denied or is unavailable.';

export async function authorizeHealthSync(provider: HealthProvider | null): Promise<void> {
  if (!provider) throw new Error(unavailableError);

  let available: boolean;
  try {
    available = await provider.isAvailable();
  } catch {
    throw new Error(unavailableError);
  }

  if (!available) throw new Error(unavailableError);

  let authorization: 'granted' | 'denied' | 'unavailable';
  try {
    authorization = await provider.requestWriteAuthorization();
  } catch {
    throw new Error(permissionError);
  }

  if (authorization !== 'granted') throw new Error(permissionError);
}

export interface HealthSyncSettingDependencies {
  loadProvider: () => Promise<HealthProvider | null>;
  persist: (enabled: boolean) => Promise<void>;
  setState: (enabled: boolean) => void;
  notify: (options: { title: string; message: string }) => Promise<void> | void;
  retryPendingHealthSyncs?: () => Promise<unknown>;
  logRetryFailure?: (error: unknown) => void;
}

export async function updateHealthSyncSetting(
  enabled: boolean,
  current: boolean,
  dependencies: HealthSyncSettingDependencies,
): Promise<boolean> {
  if (enabled === current) return current;

  if (enabled) {
    try {
      const provider = await dependencies.loadProvider();
      if (!provider) return current;

      await authorizeHealthSync(provider);
      dependencies.setState(true);
      await dependencies.persist(true);
      if (dependencies.retryPendingHealthSyncs) {
        try {
          void dependencies.retryPendingHealthSyncs().catch((error) => {
            if (dependencies.logRetryFailure) {
              dependencies.logRetryFailure(error);
            } else {
              console.error('Unable to retry pending health syncs', error);
            }
          });
        } catch (error) {
          if (dependencies.logRetryFailure) {
            dependencies.logRetryFailure(error);
          } else {
            console.error('Unable to retry pending health syncs', error);
          }
        }
      }
      return true;
    } catch (error) {
      dependencies.setState(current);
      await dependencies.notify({
        title: 'Settings Error',
        message: error instanceof Error ? error.message : 'Failed to save health sync setting.',
      });
      throw error;
    }
  }

  dependencies.setState(false);
  try {
    await dependencies.persist(false);
    return false;
  } catch (error) {
    dependencies.setState(current);
    await dependencies.notify({
      title: 'Settings Error',
      message: error instanceof Error ? error.message : 'Failed to save health sync setting.',
    });
    throw error;
  }
}
