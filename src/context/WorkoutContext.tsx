import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { ActiveExercise, Exercise, Routine, SetType, Workout, WorkoutSet } from '../types';
import { saveCompletedWorkout, getPreviousSetsForExercise } from '../database/db';
import { computeElapsedSeconds, computeRemaining } from '../utils/timer';

interface RestTimerState {
  isActive: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  endsAt: number | null;
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
  updateExerciseRestTimer: (activeExerciseId: string, seconds: number) => void;
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
    endsAt: null,
  });

  const workoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<string | null>(null);

  const minimizeWorkout = () => setIsMinimized(true);
  const maximizeWorkout = () => setIsMinimized(false);

  // Workout duration timer
  useEffect(() => {
    if (activeWorkout) {
      if (!startTimeRef.current) {
        startTimeRef.current = activeWorkout.startTime;
      }
      workoutTimerRef.current = setInterval(() => {
        setElapsedSeconds(computeElapsedSeconds(startTimeRef.current!, Date.now()));
      }, 1000);
    } else {
      startTimeRef.current = null;
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
      setElapsedSeconds(0);
    }
    return () => {
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
    };
  }, [activeWorkout !== null]);

  // Rest countdown timer
  useEffect(() => {
    if (restTimer.isActive && restTimer.endsAt !== null) {
      const tick = () => {
        const now = Date.now();
        const remaining = computeRemaining(restTimer.endsAt!, now);
        if (remaining <= 0) {
          setRestTimer(prev => ({ ...prev, isActive: false, remainingSeconds: 0, endsAt: null }));
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } else {
          setRestTimer(prev => {
            if (prev.remainingSeconds === remaining) return prev;
            return { ...prev, remainingSeconds: remaining };
          });
        }
      };
      restTimerRef.current = setInterval(tick, 250);
      tick();
    } else {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    }
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, [restTimer.isActive, restTimer.endsAt]);

  const startRestTimer = (seconds: number) => {
    if (seconds <= 0) return;
    setRestTimer({
      isActive: true,
      remainingSeconds: seconds,
      totalSeconds: seconds,
      endsAt: Date.now() + seconds * 1000,
    });
  };

  const adjustRestTimer = (deltaSeconds: number) => {
    setRestTimer(prev => {
      if (!prev.endsAt) return prev;
      const newEndsAt = prev.endsAt + deltaSeconds * 1000;
      const remaining = computeRemaining(newEndsAt, Date.now());
      return {
        ...prev,
        endsAt: newEndsAt,
        remainingSeconds: remaining,
        isActive: remaining > 0,
      };
    });
  };

  const stopRestTimer = () => {
    setRestTimer({
      isActive: false,
      remainingSeconds: 0,
      totalSeconds: 0,
      endsAt: null,
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
          restTimerSeconds: item.restTimerSeconds ?? 0,
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
      restTimerSeconds: 0,
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

  const updateExerciseRestTimer = (activeExerciseId: string, seconds: number) => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(e => (e.id === activeExerciseId ? { ...e, restTimerSeconds: seconds } : e)),
      };
    });
  };

  const toggleSetComplete = (activeExerciseId: string, setId: string) => {
    const currentExercise = activeWorkout?.exercises.find(e => e.id === activeExerciseId);
    if (!currentExercise) return;

    const currentSet = currentExercise.sets.find(s => s.id === setId);
    if (!currentSet) return;

    const willBeCompleted = !currentSet.isCompleted;

    if (willBeCompleted) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if ((currentExercise.restTimerSeconds ?? 0) > 0) {
        startRestTimer(currentExercise.restTimerSeconds);
      }
    }

    const prevSetInSession = currentExercise.sets.length > 0
      ? (() => {
          const idx = currentExercise.sets.findIndex(s => s.id === setId);
          return idx > 0 ? currentExercise.sets[idx - 1] : null;
        })()
      : null;

    const finalWeight =
      currentSet.weightKg > 0
        ? currentSet.weightKg
        : (prevSetInSession?.weightKg || currentSet.previousWeightKg || 20);

    const finalReps =
      currentSet.reps > 0
        ? currentSet.reps
        : (prevSetInSession?.reps || currentSet.previousReps || 10);

    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(e => {
          if (e.id !== activeExerciseId) return e;
          return {
            ...e,
            sets: e.sets.map(s => {
              if (s.id !== setId) return s;
              return {
                ...s,
                weightKg: willBeCompleted ? finalWeight : s.weightKg,
                reps: willBeCompleted ? finalReps : s.reps,
                isCompleted: willBeCompleted,
                completedAt: willBeCompleted ? new Date().toISOString() : undefined,
              };
            }),
          };
        }),
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
      durationSeconds: startTimeRef.current
        ? Math.floor((Date.now() - new Date(startTimeRef.current).getTime()) / 1000)
        : elapsedSeconds,
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
        updateExerciseRestTimer,
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
