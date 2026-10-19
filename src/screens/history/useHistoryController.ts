import { useEffect, useMemo, useState } from 'react';
import { Repeat, Trash2 } from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import { ActiveExercise, Routine, Workout, WorkoutHistorySummary } from '../../types';
import { deleteWorkout, getRoutineById, saveCompletedWorkout } from '../../database/db';
import { useWorkoutActions } from '../../context/WorkoutContext';
import { useSettings } from '../../context/SettingsContext';
import { useDialog } from '../../context/DialogContext';
import { useWorkoutHistory } from '../../hooks/useWorkoutHistory';
import { resolveInitialStartGymId, resolveRepeatSourceGym } from '../../workout/gym-session';
import { formatWeight } from '../../utils/units';
import { SetPRResult } from '../../workout/pr';
import {
  buildPRDetailsNotification,
  buildRepeatExercises,
  computeHistoryTotals,
  filterHistoryByGym,
  formatHistoryDate,
} from './historyLogic';

interface PendingRepeatWorkout {
  routine?: Routine;
  name: string;
  initialExercises: ActiveExercise[];
}

/**
 * ARCH-12: all state, derived data, effects, and handlers for the history screen.
 * The screen is left as composition of the props returned here.
 */
export function useHistoryController({ workoutUpdate = null }: { workoutUpdate?: Workout | null }) {
  const { startWorkout } = useWorkoutActions();
  const { unit, gymTrackingEnabled } = useSettings();
  const { confirm, notify } = useDialog();
  const {
    history,
    gyms,
    loading,
    details: workoutDetails,
    prs: workoutPRs,
    loadingDetailId,
    reload: loadHistory,
    loadDetail,
    updateWorkout,
  } = useWorkoutHistory();

  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuWorkout, setMenuWorkout] = useState<WorkoutHistorySummary | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [pendingRepeat, setPendingRepeat] = useState<PendingRepeatWorkout | null>(null);

  useEffect(() => {
    if (!gymTrackingEnabled) {
      setSelectedGymId(null);
      return;
    }
    if (selectedGymId && !gyms.some(gym => gym.id === selectedGymId)) {
      setSelectedGymId(null);
    }
  }, [gymTrackingEnabled, gyms, selectedGymId]);

  useEffect(() => {
    if (!workoutUpdate) return;

    void updateWorkout(workoutUpdate);
  }, [workoutUpdate]);

  const filteredHistory = useMemo(
    () => filterHistoryByGym(history, selectedGymId),
    [history, selectedGymId],
  );

  const gymById = useMemo(() => new Map(gyms.map(gym => [gym.id, gym])), [gyms]);

  const { totalWorkouts, totalVolumeKg } = computeHistoryTotals(filteredHistory);

  const handleToggleExpand = async (workoutId: string) => {
    if (expandedId === workoutId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(workoutId);
    await loadDetail(workoutId);
  };

  const handleDelete = async (item: WorkoutHistorySummary) => {
    const shouldDelete = await confirm({
      title: 'Delete Workout',
      message: `Are you sure you want to delete "${item.name}" from your history? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!shouldDelete) return;

    try {
      await deleteWorkout(item.id);
      setExpandedId(null);
      loadHistory();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to delete workout.' });
    }
  };

  const handlePerformAgain = async (item: WorkoutHistorySummary) => {
    try {
      const detail = await loadDetail(item.id);
      if (!detail || !detail.exercises || detail.exercises.length === 0) {
        await notify({ title: 'Workout Unavailable', message: 'Could not load details for this workout.' });
        return;
      }

      const sourceGym = resolveRepeatSourceGym(detail, gyms);
      const initialExercises = buildRepeatExercises(detail, sourceGym, Crypto.randomUUID);

      let routine: Routine | undefined;
      if (item.routineId) {
        const found = await getRoutineById(item.routineId);
        if (found) {
          routine = found;
        }
      }

      if (!gymTrackingEnabled) {
        await startWorkout(routine, item.name, initialExercises);
        return;
      }

      const repeat = { routine, name: item.name, initialExercises };
      // With a single gym there is nothing to choose, so start straight away.
      if (gyms.length <= 1) {
        await startWorkout(repeat.routine, repeat.name, repeat.initialExercises, {
          gymId: resolveInitialStartGymId(gyms),
        });
        return;
      }
      setPendingRepeat(repeat);
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to start workout.' });
    }
  };

  const handleStartRepeat = async (gymId: string) => {
    if (!pendingRepeat) return false;

    try {
      const started = await startWorkout(
        pendingRepeat.routine,
        pendingRepeat.name,
        pendingRepeat.initialExercises,
        { gymId },
      );
      if (started) setPendingRepeat(null);
      return started;
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to start workout.' });
      throw e;
    }
  };

  const handleSaveEditedWorkout = async (updated: Workout) => {
    try {
      if (!gyms.some(gym => gym.id === updated.gymId)) {
        throw new Error('Unknown gym selected for workout.');
      }
      await saveCompletedWorkout(updated);
      await updateWorkout(updated);
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to save workout changes.' });
      throw e;
    }
  };

  const handleShowSetPR = (exerciseName: string, setNumber: number, setPR: SetPRResult) => {
    void notify(buildPRDetailsNotification(exerciseName, setNumber, setPR, unit));
  };

  return {
    header: {
      subtitle:
        totalWorkouts > 0
          ? `${totalWorkouts} ${totalWorkouts === 1 ? 'workout' : 'workouts'} · ${formatWeight(totalVolumeKg, unit)} lifted`
          : undefined,
    },
    gymFilter: {
      visible: gymTrackingEnabled && gyms.length > 1,
      gyms,
      selectedGymId,
      onSelectGym: setSelectedGymId,
    },
    list: {
      loading,
      history: filteredHistory,
      details: workoutDetails,
      prs: workoutPRs,
      expandedId,
      loadingDetailId,
      gymTrackingEnabled,
      gymById,
      unit,
      onToggleExpand: handleToggleExpand,
      onOpenMenu: setMenuWorkout,
      onEditWorkout: setEditingWorkout,
      onShowSetPR: handleShowSetPR,
    },
    actionSheet: {
      visible: menuWorkout !== null,
      title: menuWorkout?.name,
      subtitle: menuWorkout ? formatHistoryDate(menuWorkout.startTime) : undefined,
      onClose: () => setMenuWorkout(null),
      actions: menuWorkout
        ? [
            {
              key: 'repeat',
              label: 'Perform Again',
              icon: Repeat,
              onPress: () => handlePerformAgain(menuWorkout),
            },
            {
              key: 'delete',
              label: 'Delete Workout',
              icon: Trash2,
              destructive: true,
              onPress: () => handleDelete(menuWorkout),
            },
          ]
        : [],
    },
    editModal: {
      visible: editingWorkout !== null,
      workout: editingWorkout,
      gyms,
      gymTrackingEnabled,
      unit,
      onClose: () => setEditingWorkout(null),
      onSave: handleSaveEditedWorkout,
    },
    startModal: {
      visible: pendingRepeat !== null,
      workoutName: pendingRepeat?.name || 'Workout',
      gyms,
      selectedGymId: resolveInitialStartGymId(gyms),
      onStart: handleStartRepeat,
      onClose: () => setPendingRepeat(null),
    },
  };
}
