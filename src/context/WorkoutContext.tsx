import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { ActiveExercise, Exercise, Routine, SetType, Workout, WorkoutSet } from '../types';
import { saveCompletedWorkout, getPreviousSetsForExercise } from '../database/db';

interface RestTimerState {
  isActive: boolean;
  remainingSeconds: number;
  totalSeconds: number;
}

interface WorkoutContextType {
  activeWorkout: Workout | null;
  isWorkingOut: boolean;
  isMinimized: boolean;
  elapsedSeconds: number;
  restTimer: RestTimerState;
  startWorkout: (routine?: Routine, customName?: string) => Promise<void>;
  minimizeWorkout: () => void;
  maximizeWorkout: () => void;
  addExerciseToWorkout: (exercise: Exercise) => Promise<void>;
  removeExerciseFromWorkout: (activeExerciseId: string) => void;
  addSet: (activeExerciseId: string, setType?: SetType) => void;
  removeSet: (activeExerciseId: string, setId: string) => void;
  updateSet: (activeExerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  updateExerciseNotes: (activeExerciseId: string, notes: string) => void;
  toggleSetComplete: (activeExerciseId: string, setId: string) => void;
  startRestTimer: (seconds: number) => void;
  adjustRestTimer: (deltaSeconds: number) => void;
  stopRestTimer: () => void;
  finishWorkout: () => Promise<Workout | null>;
  cancelWorkout: () => void;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

export const WorkoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [restTimer, setRestTimer] = useState<RestTimerState>({
    isActive: false,
    remainingSeconds: 0,
    totalSeconds: 0,
  });

  const workoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const minimizeWorkout = () => setIsMinimized(true);
  const maximizeWorkout = () => setIsMinimized(false);

  // Workout duration timer
  useEffect(() => {
    if (activeWorkout) {
      workoutTimerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
      setElapsedSeconds(0);
    }
    return () => {
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
    };
  }, [activeWorkout]);

  // Rest countdown timer
  useEffect(() => {
    if (restTimer.isActive && restTimer.remainingSeconds > 0) {
      restTimerRef.current = setInterval(() => {
        setRestTimer(prev => {
          if (prev.remainingSeconds <= 1) {
            // Timer finished! Trigger haptic pattern
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            return { ...prev, isActive: false, remainingSeconds: 0 };
          }
          return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        });
      }, 1000);
    } else {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    }
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, [restTimer.isActive, restTimer.remainingSeconds]);

  const startRestTimer = (seconds: number) => {
    setRestTimer({
      isActive: true,
      remainingSeconds: seconds,
      totalSeconds: seconds,
    });
  };

  const adjustRestTimer = (deltaSeconds: number) => {
    setRestTimer(prev => {
      const nextRemaining = Math.max(0, prev.remainingSeconds + deltaSeconds);
      return {
        ...prev,
        remainingSeconds: nextRemaining,
        isActive: nextRemaining > 0,
      };
    });
  };

  const stopRestTimer = () => {
    setRestTimer({
      isActive: false,
      remainingSeconds: 0,
      totalSeconds: 0,
    });
  };

  const startWorkout = async (routine?: Routine, customName?: string) => {
    const workoutId = `wo-${Date.now()}`;
    const name = customName || (routine ? routine.name : 'Quick Workout');

    let exercises: ActiveExercise[] = [];

    if (routine && routine.exercises.length > 0) {
      for (const item of routine.exercises) {
        const prevSets = await getPreviousSetsForExercise(item.exerciseId);
        const sets: WorkoutSet[] = [];
        const count = item.targetSets || 3;

        for (let i = 1; i <= count; i++) {
          const ghost = prevSets[i - 1];
          sets.push({
            id: `set-${item.exerciseId}-${i}-${Date.now()}`,
            setNumber: i,
            type: 'normal',
            weightKg: ghost ? ghost.weightKg : 0,
            reps: ghost ? ghost.reps : 10,
            isCompleted: false,
            previousWeightKg: ghost ? ghost.weightKg : undefined,
            previousReps: ghost ? ghost.reps : undefined,
          });
        }

        exercises.push({
          id: `ae-${workoutId}-${item.exerciseId}-${Date.now()}`,
          exerciseId: item.exerciseId,
          exercise: item.exercise,
          sets,
          restTimerSeconds: item.restTimerSeconds || 90,
        });
      }
    }

    setActiveWorkout({
      id: workoutId,
      name,
      routineId: routine ? routine.id : undefined,
      startTime: new Date().toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises,
    });
    setElapsedSeconds(0);
  };

  const addExerciseToWorkout = async (exercise: Exercise) => {
    if (!activeWorkout) return;

    const prevSets = await getPreviousSetsForExercise(exercise.id);
    const sets: WorkoutSet[] = [];

    for (let i = 1; i <= 3; i++) {
      const ghost = prevSets[i - 1];
      sets.push({
        id: `set-${exercise.id}-${i}-${Date.now()}`,
        setNumber: i,
        type: 'normal',
        weightKg: ghost ? ghost.weightKg : 0,
        reps: ghost ? ghost.reps : 10,
        isCompleted: false,
        previousWeightKg: ghost ? ghost.weightKg : undefined,
        previousReps: ghost ? ghost.reps : undefined,
      });
    }

    const newActiveExercise: ActiveExercise = {
      id: `ae-${activeWorkout.id}-${exercise.id}-${Date.now()}`,
      exerciseId: exercise.id,
      exercise,
      sets,
      restTimerSeconds: 90,
    };

    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: [...prev.exercises, newActiveExercise],
      };
    });
  };

  const removeExerciseFromWorkout = (activeExerciseId: string) => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.filter(e => e.id !== activeExerciseId),
      };
    });
  };

  const addSet = (activeExerciseId: string, setType: SetType = 'normal') => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(e => {
          if (e.id !== activeExerciseId) return e;
          const nextSetNumber = e.sets.length + 1;
          const lastSet = e.sets[e.sets.length - 1];
          const newSet: WorkoutSet = {
            id: `set-${e.exerciseId}-${nextSetNumber}-${Date.now()}`,
            setNumber: nextSetNumber,
            type: setType,
            weightKg: lastSet ? lastSet.weightKg : 0,
            reps: lastSet ? lastSet.reps : 10,
            isCompleted: false,
            previousWeightKg: lastSet?.previousWeightKg,
            previousReps: lastSet?.previousReps,
          };
          return { ...e, sets: [...e.sets, newSet] };
        }),
      };
    });
  };

  const removeSet = (activeExerciseId: string, setId: string) => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(e => {
          if (e.id !== activeExerciseId) return e;
          const filtered = e.sets.filter(s => s.id !== setId);
          // Renumber sets
          const renumbered = filtered.map((s, idx) => ({ ...s, setNumber: idx + 1 }));
          return { ...e, sets: renumbered };
        }),
      };
    });
  };

  const updateSet = (activeExerciseId: string, setId: string, updates: Partial<WorkoutSet>) => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(e => {
          if (e.id !== activeExerciseId) return e;
          return {
            ...e,
            sets: e.sets.map(s => (s.id === setId ? { ...s, ...updates } : s)),
          };
        }),
      };
    });
  };

  const updateExerciseNotes = (activeExerciseId: string, notes: string) => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(e => (e.id === activeExerciseId ? { ...e, notes } : e)),
      };
    });
  };

  const toggleSetComplete = (activeExerciseId: string, setId: string) => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      let targetRestSeconds = 90;

      const nextExercises = prev.exercises.map(e => {
        if (e.id !== activeExerciseId) return e;
        targetRestSeconds = e.restTimerSeconds || 90;

        return {
          ...e,
          sets: e.sets.map((s, idx) => {
            if (s.id !== setId) return s;
            const willBeCompleted = !s.isCompleted;

            // Physical haptic trigger
            if (willBeCompleted && Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }

            // Prior set in this session for seamless straight sets
            const prevSetInSession = idx > 0 ? e.sets[idx - 1] : null;

            // Auto-fill defaults if zero when completing
            const finalWeight =
              s.weightKg > 0
                ? s.weightKg
                : (prevSetInSession?.weightKg || s.previousWeightKg || 20);

            const finalReps =
              s.reps > 0
                ? s.reps
                : (prevSetInSession?.reps || s.previousReps || 10);

            return {
              ...s,
              weightKg: willBeCompleted ? finalWeight : s.weightKg,
              reps: willBeCompleted ? finalReps : s.reps,
              isCompleted: willBeCompleted,
              completedAt: willBeCompleted ? new Date().toISOString() : undefined,
            };
          }),
        };
      });

      // If set was just marked completed, start rest timer
      const targetExercise = prev.exercises.find(e => e.id === activeExerciseId);
      const targetSet = targetExercise?.sets.find(s => s.id === setId);
      if (targetSet && !targetSet.isCompleted) {
        startRestTimer(targetRestSeconds);
      }

      return {
        ...prev,
        exercises: nextExercises,
      };
    });
  };

  const finishWorkout = async (): Promise<Workout | null> => {
    if (!activeWorkout) return null;

    // Calculate total lifted volume (sum of weight * reps for completed sets)
    let totalVolume = 0;
    for (const e of activeWorkout.exercises) {
      for (const s of e.sets) {
        if (s.isCompleted) {
          totalVolume += s.weightKg * s.reps;
        }
      }
    }

    const finished: Workout = {
      ...activeWorkout,
      durationSeconds: elapsedSeconds,
      totalVolumeKg: Math.round(totalVolume),
      endTime: new Date().toISOString(),
    };

    await saveCompletedWorkout(finished);

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setActiveWorkout(null);
    setIsMinimized(false);
    stopRestTimer();
    return finished;
  };

  const cancelWorkout = () => {
    setActiveWorkout(null);
    setIsMinimized(false);
    stopRestTimer();
  };

  return (
    <WorkoutContext.Provider
      value={{
        activeWorkout,
        isWorkingOut: activeWorkout !== null,
        isMinimized,
        elapsedSeconds,
        restTimer,
        startWorkout,
        minimizeWorkout,
        maximizeWorkout,
        addExerciseToWorkout,
        removeExerciseFromWorkout,
        addSet,
        removeSet,
        updateSet,
        updateExerciseNotes,
        toggleSetComplete,
        startRestTimer,
        adjustRestTimer,
        stopRestTimer,
        finishWorkout,
        cancelWorkout,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
};

export const useWorkout = () => {
  const context = useContext(WorkoutContext);
  if (!context) {
    throw new Error('useWorkout must be used within a WorkoutProvider');
  }
  return context;
};
