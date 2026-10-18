import { useDialog } from '../context/DialogContext';
import { useIsWorkingOut } from '../context/WorkoutContext';
import { getStore } from '../database/db';
import { parseBackup } from '../utils/backup';
import { exportBackup } from '../utils/export';
import { pickBackupJson } from '../utils/pickBackup';
import { computeRestorePlan } from '../utils/restore';
import { saveBackupToFiles } from '../utils/saveBackup';
import { errorMessage } from '../utils/invariant';

/**
 * ARCH-02 domain hook: the Tools tab's backup transfer commands — save to files, share to
 * another app, and restore a backup file into the live store.
 */
export interface BackupTransfer {
  /** Writes a full backup to a user-picked file location. */
  saveBackup: () => Promise<void>;
  /** Shares a full backup through the platform share sheet. */
  shareBackup: () => Promise<void>;
  /** Picks a backup file, previews the merge, and merges it after confirmation. */
  restoreBackup: () => Promise<void>;
}

export function useBackupTransfer(): BackupTransfer {
  const { confirm, notify } = useDialog();
  const isWorkingOut = useIsWorkingOut();

  const shareBackup = async () => {
    try {
      await exportBackup();
      await notify({ title: 'Export Complete', message: 'Your workout data has been exported.' });
    } catch (e: unknown) {
      await notify({
        title: 'Export Error',
        message: errorMessage(e)
          ? `Failed to export data: ${errorMessage(e)}`
          : 'Failed to export data. Please try again.',
      });
    }
  };

  const saveBackup = async () => {
    try {
      const result = await saveBackupToFiles();
      if (result === 'cancelled') return;
      await notify({
        title: 'Backup Saved',
        message: 'Your workout data was saved to the selected file location.',
      });
    } catch (e: unknown) {
      await notify({
        title: 'Save Error',
        message: errorMessage(e)
          ? `Failed to save data: ${errorMessage(e)}`
          : 'Failed to save data. Please try again.',
      });
    }
  };

  const restoreBackup = async () => {
    if (isWorkingOut) {
      await notify({
        title: 'Session In Progress',
        message:
          'Cannot restore backup while a workout session is active. Please finish or discard your current workout first.',
      });
      return;
    }

    try {
      const json = await pickBackupJson();
      if (!json) return;

      const backup = parseBackup(json);
      const store = await getStore();
      const { preview, snapshotToMerge } = await computeRestorePlan(backup, store);

      const message =
        `Backup Summary:\n` +
        `• ${preview.gymsCount} gyms to import\n` +
        `• ${preview.scopeOverridesCount} exercise scope overrides to import\n` +
        `• ${preview.workoutsCount} workouts to import (${preview.skippedWorkoutsCount} identical skipped)\n` +
        `• ${preview.routinesCount} routines to import (${preview.skippedRoutinesCount} identical skipped)\n` +
        `• ${preview.customExercisesCount} custom exercises to import\n` +
        `• ${preview.draftsCount} drafts to import\n` +
        `• ${preview.newSettingsCount} new settings keys (existing settings preserved)\n\n` +
        `Proceed with merging this backup?`;

      const proceed = await confirm({
        title: 'Restore Backup',
        message,
        confirmLabel: 'Restore',
        cancelLabel: 'Cancel',
      });

      if (!proceed) return;

      await store.mergeSnapshot(snapshotToMerge);
      await notify({
        title: 'Restore Complete',
        message: 'Your backup data has been successfully merged.',
      });
    } catch (err: unknown) {
      await notify({
        title: 'Restore Failed',
        message: errorMessage(err) || 'An error occurred during restore. No data was changed.',
      });
    }
  };

  return { saveBackup, shareBackup, restoreBackup };
}
