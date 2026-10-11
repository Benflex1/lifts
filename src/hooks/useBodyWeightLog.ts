import { useCallback, useEffect, useState } from 'react';
import { getSetting, setSetting } from '../database/db';
import { useDialog } from '../context/DialogContext';
import {
  BODY_WEIGHT_LOG_KEY,
  BodyWeightEntry,
  parseBodyWeightLog,
  removeBodyWeight,
  serializeBodyWeightLog,
  upsertBodyWeight,
} from '../workout/body-weight';

/** The body weight log, loaded while `enabled`. Changes read the stored log first, so restores in between are kept. */
export function useBodyWeightLog(enabled: boolean) {
  const [entries, setEntries] = useState<BodyWeightEntry[]>([]);
  const { notify } = useDialog();

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setEntries(parseBodyWeightLog(await getSetting(BODY_WEIGHT_LOG_KEY)));
    } catch (error) {
      console.error('Unable to load the body weight log', error);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(async (change: (entries: BodyWeightEntry[]) => BodyWeightEntry[]) => {
    try {
      const next = change(parseBodyWeightLog(await getSetting(BODY_WEIGHT_LOG_KEY)));
      await setSetting(BODY_WEIGHT_LOG_KEY, serializeBodyWeightLog(next));
      setEntries(next);
    } catch (err: any) {
      await notify({
        title: 'Body Weight',
        message: err?.message || 'Failed to save your weigh-in.',
      });
      throw err;
    }
  }, [notify]);

  const logWeight = useCallback(
    (date: string, weightKg: number) => update((current) => upsertBodyWeight(current, date, weightKg)),
    [update],
  );
  const deleteWeight = useCallback(
    (date: string) => update((current) => removeBodyWeight(current, date)),
    [update],
  );

  return { entries, reload, logWeight, deleteWeight };
}
