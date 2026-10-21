import { useEffect, useMemo, useState } from 'react';
import { Exercise, ExerciseGymScope, Gym, Workout } from '../types';
import { useSettings } from '../context/SettingsContext';
import {
  MuscleFrequencyPoint,
  ProgressionMetric,
  TimeframeFilter,
  WeeklyVolumePoint,
  buildConsistencySummary,
  buildLifetimeTrainingStats,
  buildRepRangeDistribution,
  buildTrainingDistribution,
  extractExerciseProgression,
} from '../workout/analytics';
import { WeightUnit } from '../utils/units';
import { useAnalyticsSnapshot } from './useAnalyticsSnapshot';

/**
 * ARCH-02 domain hook: owns the analytics screen's data model — the snapshot query plus every
 * derived overview aggregate — and the progression/dashboard filter state that drives them.
 */
export interface AnalyticsData {
  loading: boolean;
  hasWorkoutData: boolean;
  workouts: Workout[];
  gyms: Gym[];
  exercises: Exercise[];
  scopes: Record<string, ExerciseGymScope | undefined>;
  weeklyVolume: WeeklyVolumePoint[];
  muscleFrequency: MuscleFrequencyPoint[];
  suggestedProgressionExerciseId: string | null;
  reload: (options?: { skipIfUnchanged?: boolean }) => Promise<void>;
  unit: WeightUnit;
  gymTrackingEnabled: boolean;
  lifetimeStats: ReturnType<typeof buildLifetimeTrainingStats> | null;
  trainingDistribution: ReturnType<typeof buildTrainingDistribution>;
  repRangeDistribution: ReturnType<typeof buildRepRangeDistribution> | null;
  consistencySummary: ReturnType<typeof buildConsistencySummary> | null;
  progressionExercise: Exercise | null;
  progressionSeries: ReturnType<typeof extractExerciseProgression> | null;
  selectedProgressionExerciseId: string | null;
  setSelectedProgressionExerciseId: (id: string | null) => void;
  progressionTimeframe: TimeframeFilter;
  setProgressionTimeframe: (timeframe: TimeframeFilter) => void;
  progressionMetric: ProgressionMetric;
  setProgressionMetric: (metric: ProgressionMetric) => void;
  progressionGymFilter: string | null;
  setProgressionGymFilter: (gymId: string | null) => void;
  showProgressionPicker: boolean;
  setShowProgressionPicker: (visible: boolean) => void;
  dashboardTimeframe: TimeframeFilter;
  setDashboardTimeframe: (timeframe: TimeframeFilter) => void;
  distMode: 'volume' | 'sets';
  setDistMode: (mode: 'volume' | 'sets') => void;
}

export function useAnalyticsData(): AnalyticsData {
  const { unit, gymTrackingEnabled } = useSettings();
  const {
    loading,
    workouts: allWorkouts,
    gyms: allGyms,
    exercises: allExerciseList,
    scopes: exerciseScopes,
    hasWorkoutData,
    weeklyVolume,
    muscleFrequency,
    suggestedProgressionExerciseId,
    reload,
  } = useAnalyticsSnapshot();

  // Progression states
  const [selectedProgressionExerciseId, setSelectedProgressionExerciseId] = useState<string | null>(
    null,
  );
  const [progressionTimeframe, setProgressionTimeframe] = useState<TimeframeFilter>('ALL');
  const [progressionMetric, setProgressionMetric] = useState<ProgressionMetric>('e1rm');
  const [progressionGymFilter, setProgressionGymFilter] = useState<string | null>(null);
  const [showProgressionPicker, setShowProgressionPicker] = useState(false);

  // Preselect the newest logged exercise until the user picks one.
  useEffect(() => {
    if (suggestedProgressionExerciseId) {
      setSelectedProgressionExerciseId(prev => prev || suggestedProgressionExerciseId);
    }
  }, [suggestedProgressionExerciseId]);

  const progressionExercise = useMemo(() => {
    if (!selectedProgressionExerciseId) {
      return allExerciseList[0] || null;
    }
    return allExerciseList.find(e => e.id === selectedProgressionExerciseId) || null;
  }, [allExerciseList, selectedProgressionExerciseId]);

  const progressionSeries = useMemo(() => {
    if (!progressionExercise || allWorkouts.length === 0) return null;
    const gymNames = new Map(allGyms.map(g => [g.id, g.name]));
    const allowedGymIds = progressionGymFilter ? [progressionGymFilter] : undefined;
    return extractExerciseProgression(allWorkouts, progressionExercise.id, {
      allowedGymIds,
      timeframe: progressionTimeframe,
      gymNamesMap: gymNames,
    });
  }, [progressionExercise, allWorkouts, progressionGymFilter, progressionTimeframe, allGyms]);

  const [dashboardTimeframe, setDashboardTimeframe] = useState<TimeframeFilter>('ALL');
  const [distMode, setDistMode] = useState<'volume' | 'sets'>('volume');

  const lifetimeStats = useMemo(() => {
    if (allWorkouts.length === 0) return null;
    return buildLifetimeTrainingStats(allWorkouts);
  }, [allWorkouts]);

  const trainingDistribution = useMemo(() => {
    if (allWorkouts.length === 0) return [];
    return buildTrainingDistribution(allWorkouts, dashboardTimeframe);
  }, [allWorkouts, dashboardTimeframe]);

  const repRangeDistribution = useMemo(() => {
    if (allWorkouts.length === 0) return null;
    return buildRepRangeDistribution(allWorkouts, dashboardTimeframe);
  }, [allWorkouts, dashboardTimeframe]);

  const consistencySummary = useMemo(() => {
    if (allWorkouts.length === 0) return null;
    return buildConsistencySummary(allWorkouts, new Date(), 12);
  }, [allWorkouts]);

  return {
    loading,
    hasWorkoutData,
    workouts: allWorkouts,
    gyms: allGyms,
    exercises: allExerciseList,
    scopes: exerciseScopes,
    weeklyVolume,
    muscleFrequency,
    suggestedProgressionExerciseId,
    reload,
    unit,
    gymTrackingEnabled,
    lifetimeStats,
    trainingDistribution,
    repRangeDistribution,
    consistencySummary,
    progressionExercise,
    progressionSeries,
    selectedProgressionExerciseId,
    setSelectedProgressionExerciseId,
    progressionTimeframe,
    setProgressionTimeframe,
    progressionMetric,
    setProgressionMetric,
    progressionGymFilter,
    setProgressionGymFilter,
    showProgressionPicker,
    setShowProgressionPicker,
    dashboardTimeframe,
    setDashboardTimeframe,
    distMode,
    setDistMode,
  };
}
