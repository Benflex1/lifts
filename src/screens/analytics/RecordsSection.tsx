import React, { useCallback, useMemo, useState } from 'react';
import { Exercise } from '../../types';
import { ExerciseDetailModal } from '../../components/ExerciseDetailModal';
import { RecordsView } from '../../components/RecordsView';
import type { AnalyticsData } from '../../hooks/useAnalyticsData';
import {
  buildTrophyRoomSummary,
  filterTrophyRecords,
  ExerciseRecordSummary,
} from '../../workout/trophy-room';

/**
 * ARCH-02: the Records tab. Owns the trophy-room filters, the unfiltered overview and the
 * filtered summary, and the exercise detail modal shown from a record row.
 */
export function RecordsSection({ analytics }: { analytics: AnalyticsData }) {
  const {
    workouts: allWorkouts,
    exercises: allExerciseList,
    gyms: allGyms,
    scopes: exerciseScopes,
    gymTrackingEnabled,
    unit,
    reload: loadAnalytics,
  } = analytics;

  const [trophyGymId, setTrophyGymId] = useState<string | null>(null);
  const [trophyCategory, setTrophyCategory] = useState<string>('all');
  const [trophySearch, setTrophySearch] = useState<string>('');
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

  // Unfiltered by category and search: feeds the Big Three card, the Recent PRs
  // strip, and the derived filtered summary below.
  const recordsOverview = useMemo(() => {
    if (allWorkouts.length === 0) return null;
    return buildTrophyRoomSummary(allWorkouts, allExerciseList, allGyms, gymTrackingEnabled, exerciseScopes, {
      selectedGymId: trophyGymId,
      includeMedalCounts: false,
    });
  }, [allWorkouts, allExerciseList, allGyms, gymTrackingEnabled, exerciseScopes, trophyGymId]);

  const trophySummary = useMemo(() => {
    if (!recordsOverview) return null;
    // Category and search only filter the precomputed list, so typing never
    // re-walks the workout history.
    return {
      ...recordsOverview,
      records: filterTrophyRecords(recordsOverview.records, {
        categoryFilter: trophyCategory,
        searchQuery: trophySearch,
      }),
    };
  }, [recordsOverview, trophyCategory, trophySearch]);

  const handleOpenRecordDetail = useCallback(
    (record: ExerciseRecordSummary) => {
      const ex = allExerciseList.find((e) => e.id === record.exerciseId);
      if (!ex) return;
      setDetailExercise(ex);
    },
    [allExerciseList],
  );

  return (
    <>
        <RecordsView
          overview={recordsOverview}
          filtered={trophySummary}
          unit={unit}
          gyms={allGyms}
          gymTrackingEnabled={gymTrackingEnabled}
          selectedGymId={trophyGymId}
          onSelectGym={setTrophyGymId}
          category={trophyCategory}
          onSelectCategory={setTrophyCategory}
          search={trophySearch}
          onChangeSearch={setTrophySearch}
          onOpenRecord={handleOpenRecordDetail}
        />

      <ExerciseDetailModal
        visible={detailExercise !== null}
        exercise={detailExercise}
        onClose={() => setDetailExercise(null)}
        currentGym={trophyGymId ? allGyms.find((g) => g.id === trophyGymId) : null}
        onHistoryTransferred={() => void loadAnalytics()}
      />
    </>
  );
}
