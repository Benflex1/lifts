import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AppTouchable } from '../../components/ui';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  Edit2,
  Layers,
  MoreHorizontal,
  Trophy,
} from 'lucide-react-native';
import { Gym, Workout, WorkoutHistorySummary } from '../../types';
import { SetPRResult, WorkoutPRSummary } from '../../workout/pr';
import { getSupersetMetadata } from '../../workout/supersets';
import { formatDuration } from '../../utils/calculator';
import { WeightUnit, formatWeight } from '../../utils/units';
import { formatTrackedSet, getTrackingType } from '../../workout/tracking';
import { PRBadge } from '../../components/PRBadge';
import { IconButton } from '../../components/ui';
import { colors } from '../../theme';
import { styles } from '../historyStyles';
import { formatHistoryDate } from './historyLogic';

export interface HistoryCardProps {
  item: WorkoutHistorySummary;
  isExpanded: boolean;
  detail?: Workout;
  prSummary?: WorkoutPRSummary;
  isLoadingDetail: boolean;
  gymTrackingEnabled: boolean;
  gym?: Gym;
  unit: WeightUnit;
  onToggleExpand: (workoutId: string) => void;
  onOpenMenu: (item: WorkoutHistorySummary) => void;
  onEditWorkout: (detail: Workout) => void;
  onShowSetPR: (exerciseName: string, setNumber: number, setPR: SetPRResult) => void;
}

export const HistoryCard: React.FC<HistoryCardProps> = ({
  item,
  isExpanded,
  detail,
  prSummary,
  isLoadingDetail,
  gymTrackingEnabled,
  gym,
  unit,
  onToggleExpand,
  onOpenMenu,
  onEditWorkout,
  onShowSetPR,
}) => {
  const supersetMetaMap = detail?.exercises ? getSupersetMetadata(detail.exercises) : new Map();

  return (
    <View style={styles.historyCard}>
      <View style={styles.cardTop}>
        <AppTouchable
          style={styles.cardToggle}
          onPress={() => onToggleExpand(item.id)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${isExpanded ? 'hide' : 'show'} details`}
          accessibilityState={{ expanded: isExpanded }}
        >
          <Text style={styles.dateText}>{formatHistoryDate(item.startTime)}</Text>
          <Text style={styles.workoutName} numberOfLines={1}>
            {item.name}
          </Text>
          {gymTrackingEnabled && gym && (
            <View style={styles.gymTag}>
              <View style={[styles.gymSwatch, { backgroundColor: gym.color }]} />
              <Text style={styles.gymTagText}>{gym.name}</Text>
            </View>
          )}

          {/* Metrics Row */}
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Clock size={14} color={colors.textMuted} />
              <Text style={styles.metricText}>{formatDuration(item.durationSeconds)}</Text>
            </View>
            <View style={styles.metric}>
              <Dumbbell size={14} color={colors.textMuted} />
              <Text style={styles.metricText}>{formatWeight(item.totalVolumeKg, unit)}</Text>
            </View>
            <View style={styles.metric}>
              <Layers size={14} color={colors.textMuted} />
              <Text style={styles.metricText}>{item.totalSets} sets</Text>
            </View>
            {prSummary && prSummary.totalCount > 0 && (
              <View style={[styles.metric, styles.prMetric]}>
                <Trophy size={13} color={colors.gold} />
                <Text style={styles.metricPRText}>
                  {prSummary.totalCount} PR{prSummary.totalCount > 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
        </AppTouchable>

        <View style={styles.cardSide}>
          <IconButton
            icon={MoreHorizontal}
            tone="ghost"
            size={34}
            onPress={() => onOpenMenu(item)}
            accessibilityLabel={`${item.name} options`}
          />
          <AppTouchable
            style={styles.expandIndicator}
            onPress={() => onToggleExpand(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? 'Hide details' : 'Show details'}
          >
            {isExpanded ? (
              <ChevronUp size={18} color={colors.textMuted} />
            ) : (
              <ChevronDown size={18} color={colors.textMuted} />
            )}
          </AppTouchable>
        </View>
      </View>

      {/* Expanded Set Details */}
      {isExpanded && (
        <View style={styles.expandedSection}>
          {isLoadingDetail ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : detail && detail.exercises.length > 0 ? (
            <>
              {detail.exercises.map((ex, exIdx) => {
                const completedSets = ex.sets.filter(s => s.isCompleted);
                if (completedSets.length === 0) return null;
                const ssMeta = supersetMetaMap.get(ex.id);

                return (
                  <React.Fragment key={exIdx}>
                    {ssMeta?.isFirst && (
                      <View
                        style={[styles.historySupersetHeader, { borderLeftColor: ssMeta.color }]}
                      >
                        <View
                          style={[
                            styles.historySupersetBadge,
                            { backgroundColor: ssMeta.color + '25', borderColor: ssMeta.color },
                          ]}
                        >
                          <Layers size={12} color={ssMeta.color} />
                          <Text style={[styles.historySupersetBadgeText, { color: ssMeta.color }]}>
                            {ssMeta.label}
                          </Text>
                        </View>
                        <Text style={styles.historySupersetSubtext}>
                          {ssMeta.totalInGroup} Exercises · Alternating Sets
                        </Text>
                      </View>
                    )}

                    <View
                      style={[
                        styles.detailExBlock,
                        ssMeta && {
                          borderLeftWidth: 3,
                          borderLeftColor: ssMeta.color,
                        },
                      ]}
                    >
                      <View style={styles.detailExHeader}>
                        <View style={styles.detailExTitleWrap}>
                          <Text style={styles.detailExTitle}>{ex.exercise.name}</Text>
                          {ssMeta && (
                            <View
                              style={[
                                styles.historySupersetPosBadge,
                                { borderColor: ssMeta.color + '60' },
                              ]}
                            >
                              <Text
                                style={[styles.historySupersetPosText, { color: ssMeta.color }]}
                              >
                                {ssMeta.positionInGroup}/{ssMeta.totalInGroup}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {ex.notes ? <Text style={styles.detailExNotes}>Note: {ex.notes}</Text> : null}
                      <View style={styles.detailSetsGrid}>
                        {completedSets.map((s, sIdx) => {
                          const setPR = prSummary?.setPRs.get(s.id);
                          return (
                            <View key={sIdx} style={styles.detailSetPill}>
                              <Text style={styles.detailSetNum}>#{s.setNumber}</Text>
                              <Text style={styles.detailSetWeight}>
                                {formatTrackedSet(s, getTrackingType(ex), unit)}
                              </Text>
                              {setPR?.primary && (
                                <PRBadge
                                  achievement={setPR.primary}
                                  compact
                                  showGym={gymTrackingEnabled}
                                  onPress={() => onShowSetPR(ex.exercise.name, s.setNumber, setPR)}
                                />
                              )}
                              {s.type !== 'normal' && (
                                <View
                                  style={[
                                    styles.detailSetTypeBadge,
                                    s.type === 'warmup'
                                      ? styles.detailSetTypeWarmup
                                      : s.type === 'drop'
                                        ? styles.detailSetTypeDrop
                                        : styles.detailSetTypeFailure,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.detailSetTypeBadgeText,
                                      s.type === 'warmup'
                                        ? styles.detailSetTypeWarmupText
                                        : s.type === 'drop'
                                          ? styles.detailSetTypeDropText
                                          : styles.detailSetTypeFailureText,
                                    ]}
                                  >
                                    {s.type === 'warmup' ? 'W' : s.type === 'drop' ? 'D' : 'F'}
                                  </Text>
                                </View>
                              )}
                              {s.rpe != null && <Text style={styles.detailRpe}>RPE {s.rpe}</Text>}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </React.Fragment>
                );
              })}
            </>
          ) : (
            <View style={styles.exerciseNamesBox}>
              <Text style={styles.exerciseNamesText}>{item.exerciseNames.join(' • ')}</Text>
            </View>
          )}

          {detail && (
            <AppTouchable
              style={styles.editWorkoutButton}
              onPress={() => onEditWorkout(detail)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${detail.name || 'workout'}`}
            >
              <Edit2 size={15} color={colors.textSoft} />
              <Text style={styles.editWorkoutButtonText}>Edit Workout</Text>
            </AppTouchable>
          )}
        </View>
      )}

      {/* Compact preview when collapsed */}
      {!isExpanded && item.exerciseNames.length > 0 && (
        <View style={styles.exerciseNamesBox}>
          <Text style={styles.exerciseNamesText} numberOfLines={2}>
            {item.exerciseNames.join(' · ')}
          </Text>
        </View>
      )}
    </View>
  );
};
