import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Edit2, ListOrdered, Play, SkipForward, Trash2, XCircle } from 'lucide-react-native';
import { Routine } from '../../types';
import { deleteRoutine, duplicateRoutine, getGyms } from '../../database/db';
import { useWorkoutActions, useWorkoutGyms } from '../../context/WorkoutContext';
import { useSettings } from '../../context/SettingsContext';
import { useDialog } from '../../context/DialogContext';
import { useRoutines } from '../../hooks/useRoutines';
import { resolveInitialStartGymId } from '../../workout/gym-session';
import {
  findProgramForRoutine,
  ProgramState,
  removeProgramFolder,
  renameProgramFolder,
  resolveProgramState,
  resolveProgramStates,
  RoutineProgram,
  withNextOverride,
} from '../../workout/programs';
import {
  collectRoutineFolders,
  filterRoutinesByFolder,
  formatTodayLabel,
} from './workoutScreenLogic';

interface PendingStart {
  routine?: Routine;
  customName: string;
  deload?: boolean;
}

/**
 * ARCH-13: all state, derived data, effects, and handlers for the workout
 * (routines) screen. The screen is left as composition of the returned props.
 */
export function useWorkoutScreenController() {
  const { startWorkout, refreshGyms } = useWorkoutActions();
  const { gyms } = useWorkoutGyms();
  const { gymTrackingEnabled, unit, routinePrograms, updateRoutinePrograms } = useSettings();
  const { confirm, notify } = useDialog();
  const { routines, history, week, reload: loadRoutines } = useRoutines();

  const [selectedFolder, setSelectedFolder] = useState('All');
  const [showEditor, setShowEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [routineToEdit, setRoutineToEdit] = useState<Routine | null>(null);
  const [showFolderManage, setShowFolderManage] = useState(false);
  const [menuRoutine, setMenuRoutine] = useState<Routine | null>(null);
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
  const [menuProgram, setMenuProgram] = useState<ProgramState | null>(null);
  const [pickProgram, setPickProgram] = useState<ProgramState | null>(null);
  const [editingProgramFolder, setEditingProgramFolder] = useState<string | null>(null);

  const programStates = useMemo(
    () => resolveProgramStates(routinePrograms, routines, history),
    [routinePrograms, routines, history],
  );
  const hasPrograms = programStates.length > 0;

  // Starting a rotation's routine from anywhere counts, and picks up its deload week.
  const isDeloadStart = (routine?: Routine): boolean => {
    const program = findProgramForRoutine(routinePrograms, routine);
    if (!program) return false;
    return resolveProgramState(program, routines, history)?.isDeload ?? false;
  };

  const openStartModal = async (routine?: Routine, customName = 'Empty Workout') => {
    const deload = isDeloadStart(routine);
    if (!gymTrackingEnabled) {
      try {
        await startWorkout(routine, customName, undefined, deload ? { deload } : undefined);
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
          deload,
        });
        return;
      }
      setPendingStart({ routine, customName, deload });
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
      const started = await startWorkout(
        pendingStart.routine,
        pendingStart.customName,
        undefined,
        { gymId, deload: pendingStart.deload },
      );
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

  const saveProgram = async (program: RoutineProgram) => {
    await updateRoutinePrograms((programs) => ({ ...programs, [program.folderName]: program }));
  };

  const stopProgram = async (folderName: string) => {
    await updateRoutinePrograms((programs) => removeProgramFolder(programs, folderName));
  };

  const pointProgramAt = async (state: ProgramState, routineId: string) => {
    try {
      await updateRoutinePrograms((programs) => {
        const stored = programs[state.program.folderName];
        return stored
          ? { ...programs, [stored.folderName]: withNextOverride(stored, routineId) }
          : programs;
      });
    } catch {
      // The settings context already told the user.
    }
  };

  const handleStopProgram = async (state: ProgramState) => {
    const shouldStop = await confirm({
      title: 'Stop Rotation',
      message: `"${state.program.folderName}" goes back to a normal folder. Your routines and history stay.`,
      confirmLabel: 'Stop',
      destructive: true,
    });
    if (!shouldStop) return;
    try {
      await stopProgram(state.program.folderName);
    } catch {
      // The settings context already told the user.
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

  const selectedProgram = selectedFolder !== 'All' ? routinePrograms[selectedFolder] : undefined;
  // A rotation whose folder dropped below two routines has no card, so the row is how to edit or stop it.
  const isDormantRotation = Boolean(
    selectedProgram && !programStates.some((state) => state.program.folderName === selectedFolder),
  );
  const canMakeRotation =
    selectedFolder !== 'All' &&
    ((!selectedProgram && filteredRoutines.length >= 2) || isDormantRotation);

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
    programs: {
      states: programStates,
      onStart: handleStartRoutine,
      onMenu: setMenuProgram,
    },
    quickStart: {
      hasPrograms,
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
      canMakeRotation,
      isDormantRotation,
      onOpenProgramEditor: () => setEditingProgramFolder(selectedFolder),
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
    programMenuSheet: {
      visible: menuProgram !== null,
      title: menuProgram ? `${menuProgram.program.folderName} rotation` : undefined,
      subtitle: menuProgram ? `Up next: ${menuProgram.next.name}` : undefined,
      onClose: () => setMenuProgram(null),
      actions: menuProgram
        ? [
            {
              key: 'skip',
              label: `Skip to ${
                menuProgram.rotation[
                  (menuProgram.nextIndex + 1) % menuProgram.rotation.length
                ].name
              }`,
              icon: SkipForward,
              onPress: () =>
                pointProgramAt(
                  menuProgram,
                  menuProgram.rotation[
                    (menuProgram.nextIndex + 1) % menuProgram.rotation.length
                  ].id,
                ),
            },
            {
              key: 'pick',
              label: 'Choose next workout',
              icon: ListOrdered,
              onPress: () => setPickProgram(menuProgram),
            },
            {
              key: 'edit',
              label: 'Edit rotation',
              icon: Edit2,
              onPress: () => setEditingProgramFolder(menuProgram.program.folderName),
            },
            {
              key: 'stop',
              label: 'Stop rotation',
              icon: XCircle,
              destructive: true,
              onPress: () => handleStopProgram(menuProgram),
            },
          ]
        : [],
    },
    programPickSheet: {
      visible: pickProgram !== null,
      title: 'Choose next workout',
      subtitle: pickProgram?.program.folderName,
      onClose: () => setPickProgram(null),
      actions: pickProgram
        ? pickProgram.rotation.map((routine, index) => ({
            key: routine.id,
            label: index === pickProgram.nextIndex ? `${routine.name} (up next)` : routine.name,
            icon: index === pickProgram.nextIndex ? Check : Play,
            onPress: () => pointProgramAt(pickProgram, routine.id),
          }))
        : [],
    },
    programEditorModal: {
      visible: editingProgramFolder !== null,
      folderName: editingProgramFolder,
      routines,
      program: editingProgramFolder ? routinePrograms[editingProgramFolder] : undefined,
      onSave: saveProgram,
      onStop: () =>
        editingProgramFolder ? stopProgram(editingProgramFolder) : Promise.resolve(),
      onClose: () => setEditingProgramFolder(null),
    },
    editorModal: {
      visible: showEditor,
      routineToEdit,
      existingFolders: folders.filter((f) => f !== 'All'),
      onClose: () => setShowEditor(false),
      onSaved: loadRoutines,
    },
    folderModal: {
      visible: showFolderManage,
      folders: folders.filter((f) => f !== 'All'),
      onClose: () => setShowFolderManage(false),
      onFoldersChanged: () => {
        setShowFolderManage(false);
        loadRoutines();
      },
      onFolderRenamed: (oldName: string, newName: string) =>
        updateRoutinePrograms((programs) => renameProgramFolder(programs, oldName, newName)),
      onFolderDeleted: (name: string) =>
        updateRoutinePrograms((programs) => removeProgramFolder(programs, name)),
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
