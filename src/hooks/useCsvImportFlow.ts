import { useState } from 'react';
import { useDialog } from '../context/DialogContext';
import { useIsWorkingOut } from '../context/WorkoutContext';
import { getStore } from '../database/db';
import { Exercise } from '../types';
import { CsvImportPreview, computeCsvImportPlan, pickCsvFile } from '../utils/importer';
import { detectEquipmentHint, inferPrimaryMuscle } from '../utils/importer/exercise-mapper';
import { createScopedId } from '../utils/ids';
import { WeightUnit } from '../utils/units';

/**
 * ARCH-02 domain hook: owns the whole CSV import flow — picking a file, previewing the merge
 * plan, remapping unknown exercises, and confirming the import into the live store.
 */
export interface CsvImportFlow {
  preview: CsvImportPreview | null;
  fileName: string;
  gymId: string;
  skipDuplicates: boolean;
  isImporting: boolean;
  /** Picks a CSV file and builds the first preview. */
  startImport: () => Promise<void>;
  /** Remaps a raw exercise name to an existing catalog exercise. */
  assignExercise: (rawName: string, exercise: Exercise) => Promise<void>;
  /** Creates a custom exercise for a raw name and remaps it. */
  setCustomExercise: (rawName: string) => Promise<void>;
  /** Retargets the import at another gym. */
  selectGym: (gymId: string) => Promise<void>;
  /** Toggles skipping workouts that already exist. */
  toggleSkipDuplicates: (skip: boolean) => Promise<void>;
  /** Merges the previewed plan into the store. */
  confirmImport: () => Promise<void>;
  closePreview: () => void;
}

export function useCsvImportFlow({
  defaultUnit,
  onImported,
}: {
  defaultUnit: WeightUnit;
  onImported: () => void | Promise<void>;
}): CsvImportFlow {
  const { notify } = useDialog();
  const isWorkingOut = useIsWorkingOut();

  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [gymId, setGymId] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [exerciseOverrides, setExerciseOverrides] = useState<Record<string, Exercise>>({});
  const [isImporting, setIsImporting] = useState(false);

  const recomputePreview = async (options: {
    targetGymId: string;
    skip: boolean;
    exerciseOverrides: Record<string, Exercise>;
    logLabel: string;
  }) => {
    if (!rawText) return;
    try {
      const store = await getStore();
      const snapshot = await store.readSnapshot();
      const plan = computeCsvImportPlan(rawText, snapshot, {
        targetGymId: options.targetGymId,
        skipExistingWorkouts: options.skip,
        defaultUnit,
        exerciseOverrides: options.exerciseOverrides,
      });
      setPreview(plan);
    } catch (err) {
      console.error(options.logLabel, err);
    }
  };

  const startImport = async () => {
    if (isWorkingOut) {
      await notify({
        title: 'Session In Progress',
        message: 'Cannot import workouts while a workout session is active. Please finish or discard your current workout first.',
      });
      return;
    }

    try {
      const picked = await pickCsvFile();
      if (!picked) return;

      const store = await getStore();
      const [snapshot, gymsList, defaultGym] = await Promise.all([
        store.readSnapshot(),
        store.getGyms(),
        store.getDefaultGym(),
      ]);

      const targetGym = defaultGym.id || gymsList[0]?.id || 'gym-default';
      setGymId(targetGym);
      setFileName(picked.name);
      setRawText(picked.content);
      setSkipDuplicates(true);
      setExerciseOverrides({});

      const plan = computeCsvImportPlan(picked.content, snapshot, {
        targetGymId: targetGym,
        skipExistingWorkouts: true,
        defaultUnit,
      });

      setPreview(plan);
    } catch (err: any) {
      await notify({
        title: 'Import Failed',
        message: err?.message || 'Failed to read or parse the selected CSV file.',
      });
    }
  };

  const assignExercise = async (rawName: string, exercise: Exercise) => {
    const updated = { ...exerciseOverrides, [rawName]: exercise };
    setExerciseOverrides(updated);
    await recomputePreview({
      targetGymId: gymId,
      skip: skipDuplicates,
      exerciseOverrides: updated,
      logLabel: 'Failed to recompute plan after exercise assignment:',
    });
  };

  const setCustomExercise = async (rawName: string) => {
    const customId = createScopedId('custom-ex');
    const customEx: Exercise = {
      id: customId,
      name: rawName.trim(),
      category: 'strength',
      equipment: detectEquipmentHint(rawName) || 'other',
      primaryMuscles: inferPrimaryMuscle(rawName),
      secondaryMuscles: [],
      instructions: [],
      isCustom: true,
    };
    const updated = { ...exerciseOverrides, [rawName]: customEx };
    setExerciseOverrides(updated);
    await recomputePreview({
      targetGymId: gymId,
      skip: skipDuplicates,
      exerciseOverrides: updated,
      logLabel: 'Failed to recompute plan after setting custom exercise:',
    });
  };

  const selectGym = async (nextGymId: string) => {
    setGymId(nextGymId);
    await recomputePreview({
      targetGymId: nextGymId,
      skip: skipDuplicates,
      exerciseOverrides,
      logLabel: 'Failed to recompute plan with gym:',
    });
  };

  const toggleSkipDuplicates = async (skip: boolean) => {
    setSkipDuplicates(skip);
    await recomputePreview({
      targetGymId: gymId,
      skip,
      exerciseOverrides,
      logLabel: 'Failed to recompute plan with duplicate toggle:',
    });
  };

  const confirmImport = async () => {
    if (!preview) return;
    setIsImporting(true);
    try {
      const store = await getStore();
      await store.mergeSnapshot(preview.snapshotToMerge);
      await onImported();

      const importedCount = skipDuplicates ? preview.newWorkoutsCount : preview.totalWorkouts;
      setPreview(null);
      await notify({
        title: 'Import Complete',
        message: `Successfully imported ${importedCount} workouts and ${preview.totalSets} sets from ${preview.formatLabel}.`,
      });
    } catch (err: any) {
      await notify({
        title: 'Import Failed',
        message: err?.message || 'Failed to import workouts. No changes were made.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return {
    preview,
    fileName,
    gymId,
    skipDuplicates,
    isImporting,
    startImport,
    assignExercise,
    setCustomExercise,
    selectGym,
    toggleSkipDuplicates,
    confirmImport,
    closePreview: () => setPreview(null),
  };
}
