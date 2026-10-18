import { useEffect, useMemo, useState } from 'react';
import { Copy, Edit2, Trash2 } from 'lucide-react-native';
import { Routine } from '../../types';
import { deleteRoutine, duplicateRoutine, getGyms } from '../../database/db';
import { useWorkoutActions, useWorkoutGyms } from '../../context/WorkoutContext';
import { useSettings } from '../../context/SettingsContext';
import { useDialog } from '../../context/DialogContext';
import { useRoutines } from '../../hooks/useRoutines';
import { resolveInitialStartGymId } from '../../workout/gym-session';
import {
  collectRoutineFolders,
  filterRoutinesByFolder,
  formatTodayLabel,
} from './workoutScreenLogic';

interface PendingStart {
  routine?: Routine;
  customName: string;
}

/**
 * ARCH-13: all state, derived data, effects, and handlers for the workout
 * (routines) screen. The screen is left as composition of the returned props.
 */
export function useWorkoutScreenController() {
  const { startWorkout, refreshGyms } = useWorkoutActions();
  const { gyms } = useWorkoutGyms();
  const { gymTrackingEnabled, unit } = useSettings();
  const { confirm, notify } = useDialog();
  const { routines, week, reload: loadRoutines } = useRoutines();

  const [selectedFolder, setSelectedFolder] = useState('All');
  const [showEditor, setShowEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [routineToEdit, setRoutineToEdit] = useState<Routine | null>(null);
  const [showFolderManage, setShowFolderManage] = useState(false);
  const [menuRoutine, setMenuRoutine] = useState<Routine | null>(null);
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);

  const openStartModal = async (routine?: Routine, customName = 'Empty Workout') => {
    if (!gymTrackingEnabled) {
      try {
        await startWorkout(routine, customName);
      } catch (e) {
        await notify({
          title: 'Error',
          message: routine ? `Failed to start "${routine.name}".` : 'Failed to start workout.',
        });
      }
      return;
    }

    try {
      const [gymList] = await Promise.all([getGyms(), refreshGyms()]);
      // With a single gym there is nothing to choose, so start straight away.
      if (gymList.length <= 1) {
        await startWorkout(routine, customName, undefined, {
          gymId: resolveInitialStartGymId(gymList),
        });
        return;
      }
      setPendingStart({ routine, customName });
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to start workout.' });
    }
  };

  const handleStartEmpty = async () => {
    await openStartModal(undefined, 'Empty Workout');
  };

  const handleStartRoutine = async (routine: Routine) => {
    await openStartModal(routine, routine.name);
  };

  const handleConfirmStart = async (gymId: string) => {
    if (!pendingStart) return false;

    try {
      const started = await startWorkout(pendingStart.routine, pendingStart.customName, undefined, {
        gymId,
      });
      if (started) setPendingStart(null);
      return started;
    } catch (e) {
      await notify({
        title: 'Error',
        message: pendingStart.routine
          ? `Failed to start "${pendingStart.routine.name}".`
          : 'Failed to start workout.',
      });
      throw e;
    }
  };

  const handleDuplicateRoutine = async (routine: Routine) => {
    try {
      await duplicateRoutine(routine.id);
      loadRoutines();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to duplicate routine.' });
    }
  };

  const handleDeleteRoutine = async (routine: Routine) => {
    const shouldDelete = await confirm({
      title: 'Delete Routine',
      message: `Are you sure you want to delete "${routine.name}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!shouldDelete) return;

    try {
      await deleteRoutine(routine.id);
      loadRoutines();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to delete routine.' });
    }
  };

  // Collect unique folders
  const folders = useMemo(() => collectRoutineFolders(routines), [routines]);

  // Auto-reset selected folder if deleted or renamed
  useEffect(() => {
    if (selectedFolder !== 'All' && !folders.includes(selectedFolder)) {
      setSelectedFolder('All');
    }
  }, [folders, selectedFolder]);

  const filteredRoutines = useMemo(
    () => filterRoutinesByFolder(routines, selectedFolder),
    [routines, selectedFolder],
  );

  const openEditor = (routine: Routine | null) => {
    setRoutineToEdit(routine);
    setShowEditor(true);
  };

  const todayLabel = formatTodayLabel(new Date());

  return {
    header: {
      eyebrow: todayLabel,
      onOpenSettings: () => setShowSettings(true),
    },
    weekCard: week ? { week, unit } : null,
    quickStart: {
      onStartEmpty: handleStartEmpty,
    },
    routines: {
      count: routines.length,
      folders,
      selectedFolder,
      showFolderChips: folders.length > 1,
      onSelectFolder: setSelectedFolder,
      onOpenFolderManager: () => setShowFolderManage(true),
      filtered: filteredRoutines,
      onCreate: () => openEditor(null),
      onOpenMenu: setMenuRoutine,
      onStart: handleStartRoutine,
    },
    actionSheet: {
      visible: menuRoutine !== null,
      title: menuRoutine?.name,
      subtitle: menuRoutine?.folderName || undefined,
      onClose: () => setMenuRoutine(null),
      actions: menuRoutine
        ? [
            {
              key: 'edit',
              label: 'Edit Routine',
              icon: Edit2,
              onPress: () => openEditor(menuRoutine),
            },
            {
              key: 'duplicate',
              label: 'Duplicate',
              icon: Copy,
              onPress: () => handleDuplicateRoutine(menuRoutine),
            },
            {
              key: 'delete',
              label: 'Delete Routine',
              icon: Trash2,
              destructive: true,
              onPress: () => handleDeleteRoutine(menuRoutine),
            },
          ]
        : [],
    },
    editorModal: {
      visible: showEditor,
      routineToEdit,
      existingFolders: folders.filter(f => f !== 'All'),
      onClose: () => setShowEditor(false),
      onSaved: loadRoutines,
    },
    folderModal: {
      visible: showFolderManage,
      folders: folders.filter(f => f !== 'All'),
      onClose: () => setShowFolderManage(false),
      onFoldersChanged: () => {
        setShowFolderManage(false);
        loadRoutines();
      },
    },
    settingsModal: {
      visible: showSettings,
      onClose: () => setShowSettings(false),
    },
    startModal: {
      visible: pendingStart !== null,
      workoutName: pendingStart?.customName || 'Workout',
      gyms,
      selectedGymId: resolveInitialStartGymId(gyms),
      onStart: handleConfirmStart,
      onClose: () => setPendingStart(null),
    },
  };
}
