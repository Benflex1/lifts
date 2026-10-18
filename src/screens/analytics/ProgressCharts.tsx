import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Award,
  Dumbbell,
  Flame,
  Layers,
  PieChart,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react-native';
import { formatWeight } from '../../utils/units';
import { colors } from '../../theme';
import { ProgressionMetric, TimeframeFilter } from '../../workout/analytics';
import { BodyWeightEntry } from '../../workout/body-weight';
import { BodyWeightCard } from '../../components/BodyWeightCard';
import { ExercisePickerModal } from '../../components/ExercisePickerModal';
import { ProgressionCurveView } from '../../components/ProgressionCurveView';
import type { AnalyticsData } from '../../hooks/useAnalyticsData';

/**
 * ARCH-02: the Progress tab's overview charts. Receives the analytics data model and renders the
 * lifetime summary plus the volume, muscle, consistency, progression, and breakdown charts.
 */
export function ProgressCharts({
  analytics,
  bodyWeight,
}: {
  analytics: AnalyticsData;
  bodyWeight?: { entries: BodyWeightEntry[]; onLog: () => void };
}) {
  const {
    loading: analyticsLoading,
    hasWorkoutData,
    weeklyVolume,
    muscleFrequency,
    lifetimeStats,
    trainingDistribution,
    repRangeDistribution,
    consistencySummary,
    progressionExercise,
    progressionSeries,
    progressionTimeframe,
    setProgressionTimeframe,
    progressionMetric,
    setProgressionMetric,
    progressionGymFilter,
    setProgressionGymFilter,
    showProgressionPicker,
    setShowProgressionPicker,
    setSelectedProgressionExerciseId,
    dashboardTimeframe,
    setDashboardTimeframe,
    distMode,
    setDistMode,
    gyms: allGyms,
    unit,
    gymTrackingEnabled,
  } = analytics;

  return (
    <>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {bodyWeight && (
          <BodyWeightCard entries={bodyWeight.entries} unit={unit} onLog={bodyWeight.onLog} />
        )}

        {/* Progress Charts */}
        {analyticsLoading ? (
          <View style={styles.chartLoading}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.chartLoadingText}>Loading progress...</Text>
          </View>
        ) : hasWorkoutData ? (
          <>
            {/* Lifetime Training Overview Banner */}
            {lifetimeStats && (
              <View style={styles.lifetimeHeroCard}>
                <View style={styles.lifetimeHeroHeader}>
                  <TrendingUp size={18} color={colors.primary} />
                  <Text style={styles.lifetimeHeroTitle}>LIFETIME TRAINING SUMMARY</Text>
                </View>
                <View style={styles.lifetimeGrid}>
                  <View style={styles.lifetimeTile}>
                    <Text style={styles.lifetimeTileVal}>{lifetimeStats.totalWorkouts}</Text>
                    <Text style={styles.lifetimeTileLabel}>WORKOUTS</Text>
                    <Text style={styles.lifetimeTileSub}>
                      {lifetimeStats.workoutsThisWeek} this week
                    </Text>
                  </View>
                  <View style={styles.lifetimeTile}>
                    <Text style={styles.lifetimeTileVal}>
                      {formatWeight(lifetimeStats.totalVolumeKg, unit)}
                    </Text>
                    <Text style={styles.lifetimeTileLabel}>TOTAL VOLUME</Text>
                    <Text style={styles.lifetimeTileSub}>
                      {formatWeight(lifetimeStats.volumeThisWeekKg, unit)} this wk
                    </Text>
                  </View>
                  <View style={styles.lifetimeTile}>
                    <Text style={styles.lifetimeTileVal}>
                      {lifetimeStats.totalDurationMinutes >= 60
                        ? `${(lifetimeStats.totalDurationMinutes / 60).toFixed(1)}h`
                        : `${lifetimeStats.totalDurationMinutes}m`}
                    </Text>
                    <Text style={styles.lifetimeTileLabel}>TIME TRAINED</Text>
                    <Text style={styles.lifetimeTileSub}>
                      {lifetimeStats.totalWorkouts > 0
                        ? `~${Math.round(lifetimeStats.totalDurationMinutes / lifetimeStats.totalWorkouts)}m / session`
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.lifetimeTile}>
                    <Text style={styles.lifetimeTileVal}>{lifetimeStats.totalSets}</Text>
                    <Text style={styles.lifetimeTileLabel}>SETS LOGGED</Text>
                    <Text style={styles.lifetimeTileSub}>
                      {lifetimeStats.totalReps.toLocaleString()} reps
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.toolCard}>
              <View style={styles.toolHeader}>
                <Dumbbell size={18} color={colors.primary} />
                <Text style={styles.toolTitle}>Weekly Volume</Text>
              </View>
              <Text style={styles.toolSubtitle}>Total completed-set volume over the last eight weeks.</Text>
              <View style={styles.volumeChart}>
                {weeklyVolume.map(point => {
                  const maxVolume = Math.max(1, ...weeklyVolume.map(item => item.volumeKg));
                  const barHeight = point.volumeKg > 0
                    ? Math.max(6, (point.volumeKg / maxVolume) * 112)
                    : 4;
                  return (
                    <View key={point.key} style={styles.volumeColumn}>
                      <View style={styles.volumeBarTrack}>
                        <View
                          style={[
                            styles.volumeBar,
                            { height: barHeight },
                            point.volumeKg <= 0 && styles.volumeBarEmpty,
                          ]}
                        />
                      </View>
                      <Text style={styles.volumeLabel}>{point.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {muscleFrequency.length > 0 && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <Award size={18} color={colors.primary} />
                  <Text style={styles.toolTitle}>Muscle Frequency</Text>
                </View>
                <Text style={styles.toolSubtitle}>Workouts that trained each muscle by primary or secondary role.</Text>
                <View style={styles.muscleLegend}>
                  <View style={styles.muscleLegendItem}>
                    <View style={[styles.muscleLegendSwatch, styles.musclePrimaryBar]} />
                    <Text style={styles.muscleLegendText}>Primary</Text>
                  </View>
                  <View style={styles.muscleLegendItem}>
                    <View style={[styles.muscleLegendSwatch, styles.muscleSecondaryBar]} />
                    <Text style={styles.muscleLegendText}>Secondary</Text>
                  </View>
                </View>
                <View style={styles.muscleChart}>
                  {muscleFrequency.map(point => {
                    const maxCount = Math.max(1, ...muscleFrequency.map(item => item.count));
                    return (
                      <View key={point.muscle} style={styles.muscleRow}>
                        <View style={styles.muscleRowHeader}>
                          <Text style={styles.muscleName}>{point.muscle}</Text>
                          <Text style={styles.muscleCount}>{point.count}</Text>
                        </View>
                        <View style={styles.muscleBarTrack}>
                          {point.primaryCount > 0 && (
                            <View
                              style={[
                                styles.muscleBar,
                                styles.musclePrimaryBar,
                                { width: `${(point.primaryCount / maxCount) * 100}%` },
                              ]}
                            />
                          )}
                          {point.secondaryCount > 0 && (
                            <View
                              style={[
                                styles.muscleBar,
                                styles.muscleSecondaryBar,
                                { width: `${(point.secondaryCount / maxCount) * 100}%` },
                              ]}
                            />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Consistency & Streaks */}
            {consistencySummary && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <Flame size={18} color={colors.primary} />
                  <Text style={styles.toolTitle}>Consistency & Streaks</Text>
                </View>
                <Text style={styles.toolSubtitle}>Your training rhythm over the last 12 weeks.</Text>

                <View style={styles.streakBadgesRow}>
                  <View style={styles.streakBadge}>
                    <View style={[styles.streakIcon, { backgroundColor: colors.dangerSoft }]}>
                      <Flame size={16} color={colors.danger} />
                    </View>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.currentStreakWeeks} wk</Text>
                      <Text style={styles.streakLabel}>Current streak</Text>
                    </View>
                  </View>
                  <View style={styles.streakBadge}>
                    <View style={[styles.streakIcon, { backgroundColor: colors.warningSoft }]}>
                      <Trophy size={16} color={colors.gold} />
                    </View>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.bestStreakWeeks} wk</Text>
                      <Text style={styles.streakLabel}>Best streak</Text>
                    </View>
                  </View>
                  <View style={styles.streakBadge}>
                    <View style={[styles.streakIcon, { backgroundColor: colors.primarySoft }]}>
                      <Zap size={16} color={colors.primaryLight} />
                    </View>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.averageWorkoutsPerWeek}/wk</Text>
                      <Text style={styles.streakLabel}>12-week avg</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.consistencyHeatmap}>
                  {consistencySummary.weeks.map((week) => {
                    const active = week.workoutCount > 0;
                    return (
                      <View key={week.weekKey} style={styles.consistencyCol}>
                        <View
                          style={[
                            styles.consistencyDot,
                            active && styles.consistencyDotActive,
                            week.workoutCount >= 3 && styles.consistencyDotHigh,
                          ]}
                        />
                        <Text style={styles.consistencyLabel}>{week.label.split(' ')[0]}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Exercise Progression Curve */}
            <View style={styles.toolCard}>
              <View style={styles.toolHeader}>
                <TrendingUp size={18} color={colors.primary} />
                <Text style={styles.toolTitle}>Exercise Progression</Text>
              </View>
              <Text style={styles.toolSubtitle}>
                Estimated 1RM, load, and volume trajectory over time.
              </Text>

              {/* Exercise Selector */}
              <TouchableOpacity
                style={styles.exerciseSelectorBtn}
                onPress={() => setShowProgressionPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose exercise for progression curve"
              >
                <View style={styles.exerciseSelectorLeft}>
                  <Dumbbell size={18} color={colors.primary} />
                  <Text style={styles.exerciseSelectorName}>
                    {progressionExercise?.name || 'Select Exercise'}
                  </Text>
                </View>
                <View style={styles.changeBadge}>
                  <Text style={styles.changeBadgeText}>Change</Text>
                </View>
              </TouchableOpacity>

              {/* Timeframe & Metric Filters */}
              <View style={styles.filterControlsRow}>
                <View style={styles.filterGroup}>
                  {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeframeFilter[]).map((tf) => {
                    const isSelected = progressionTimeframe === tf;
                    const label = tf === 'ALL' ? 'All time' : `Past ${tf}`;
                    return (
                      <TouchableOpacity
                        key={tf}
                        style={[
                          styles.filterChip,
                          isSelected && styles.filterChipActive,
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Timeframe: ${label}`}
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => setProgressionTimeframe(tf)}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            isSelected && styles.filterChipTextActive,
                          ]}
                        >
                          {tf}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.filterGroup}>
                  {(['e1rm', 'max_weight', 'max_reps', 'volume'] as ProgressionMetric[]).map((m) => {
                    const isSelected = progressionMetric === m;
                    const label = m === 'e1rm' ? 'Estimated 1RM' : m === 'max_weight' ? 'Heaviest Weight' : m === 'max_reps' ? 'Max Reps' : 'Total Volume';
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.filterChip,
                          isSelected && styles.filterChipActive,
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => setProgressionMetric(m)}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            isSelected && styles.filterChipTextActive,
                          ]}
                        >
                          {m === 'e1rm' ? '1RM' : m === 'max_weight' ? 'Weight' : m === 'max_reps' ? 'Reps' : 'Vol'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Gym Scoping Filter */}
              {gymTrackingEnabled && allGyms.length > 1 && (
                <View style={styles.gymFilterRow}>
                  <TouchableOpacity
                    style={[
                      styles.gymChip,
                      progressionGymFilter === null && styles.gymChipActive,
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel="Filter by all gyms"
                    accessibilityState={{ selected: progressionGymFilter === null }}
                    onPress={() => setProgressionGymFilter(null)}
                  >
                    <Text
                      style={[
                        styles.gymChipText,
                        progressionGymFilter === null && styles.gymChipTextActive,
                      ]}
                    >
                      All Gyms
                    </Text>
                  </TouchableOpacity>
                  {allGyms.map((gym) => (
                    <TouchableOpacity
                      key={gym.id}
                      style={[
                        styles.gymChip,
                        progressionGymFilter === gym.id && styles.gymChipActive,
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter by ${gym.name}`}
                      accessibilityState={{ selected: progressionGymFilter === gym.id }}
                      onPress={() => setProgressionGymFilter(gym.id)}
                    >
                      <Text
                        style={[
                          styles.gymChipText,
                          progressionGymFilter === gym.id && styles.gymChipTextActive,
                        ]}
                      >
                        {gym.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Chart */}
              {progressionSeries ? (
                <ProgressionCurveView
                  series={progressionSeries}
                  metric={progressionMetric}
                  unit={unit}
                  height={190}
                  gymTrackingEnabled={gymTrackingEnabled}
                />
              ) : (
                <View style={styles.emptyChartBox}>
                  <Text style={styles.emptyChartText}>No recorded sets for this exercise yet.</Text>
                </View>
              )}
            </View>

            {/* Training Breakdown Section Header & Timeframe Filter */}
            <View style={styles.breakdownHeaderRow}>
              <View style={styles.breakdownTitleWrap}>
                <Layers size={18} color={colors.primary} />
                <Text style={styles.breakdownTitleText}>TRAINING BREAKDOWN</Text>
              </View>
              <View style={styles.breakdownTimeframeRow}>
                {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeframeFilter[]).map((tf) => {
                  const isSelected = dashboardTimeframe === tf;
                  const label = tf === 'ALL' ? 'All time' : `Past ${tf}`;
                  return (
                    <TouchableOpacity
                      key={tf}
                      style={[
                        styles.breakdownChip,
                        isSelected && styles.breakdownChipActive,
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Breakdown timeframe: ${label}`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setDashboardTimeframe(tf)}
                    >
                      <Text
                        style={[
                          styles.breakdownChipText,
                          isSelected && styles.breakdownChipTextActive,
                        ]}
                      >
                        {tf}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Rep-Range Training Zones */}
            {repRangeDistribution && repRangeDistribution.totalSets > 0 && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <Layers size={18} color={colors.primary} />
                  <Text style={styles.toolTitle}>Rep Range Training Zones</Text>
                </View>
                <Text style={styles.toolSubtitle}>
                  Distribution of completed sets across strength, hypertrophy, and endurance ({dashboardTimeframe === 'ALL' ? 'All time' : `Past ${dashboardTimeframe}`}).
                </Text>

                <View style={styles.zoneStackedBar}>
                  {repRangeDistribution.strength > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          flex: repRangeDistribution.strength,
                          backgroundColor: colors.danger,
                        },
                      ]}
                    />
                  )}
                  {repRangeDistribution.hypertrophy > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          flex: repRangeDistribution.hypertrophy,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  )}
                  {repRangeDistribution.endurance > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          flex: repRangeDistribution.endurance,
                          backgroundColor: colors.success,
                        },
                      ]}
                    />
                  )}
                </View>

                <View style={styles.zoneLegendRow}>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: colors.danger }]} />
                    <Text style={styles.zoneLabel}>
                      Strength (1-5): {repRangeDistribution.percentages.strength}% ({repRangeDistribution.strength} sets)
                    </Text>
                  </View>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.zoneLabel}>
                      Hypertrophy (6-12): {repRangeDistribution.percentages.hypertrophy}% ({repRangeDistribution.hypertrophy} sets)
                    </Text>
                  </View>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: colors.success }]} />
                    <Text style={styles.zoneLabel}>
                      Endurance (13+): {repRangeDistribution.percentages.endurance}% ({repRangeDistribution.endurance} sets)
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Muscle Distribution with Volume vs Sets Toggle */}
            {trainingDistribution.length > 0 && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeaderBetween}>
                  <View style={styles.toolHeaderLeft}>
                    <PieChart size={18} color={colors.primary} />
                    <Text style={styles.toolTitle}>Muscle Distribution</Text>
                  </View>
                  <View style={styles.distToggleWrap}>
                    <TouchableOpacity
                      style={[styles.distToggleBtn, distMode === 'volume' && styles.distToggleBtnActive]}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel="View volume distribution"
                      accessibilityState={{ selected: distMode === 'volume' }}
                      onPress={() => setDistMode('volume')}
                    >
                      <Text style={[styles.distToggleText, distMode === 'volume' && styles.distToggleTextActive]}>
                        Volume
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.distToggleBtn, distMode === 'sets' && styles.distToggleBtnActive]}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel="View sets distribution"
                      accessibilityState={{ selected: distMode === 'sets' }}
                      onPress={() => setDistMode('sets')}
                    >
                      <Text style={[styles.distToggleText, distMode === 'sets' && styles.distToggleTextActive]}>
                        Sets
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.toolSubtitle}>
                  {distMode === 'volume'
                    ? `Proportion of completed volume across muscle groups (${dashboardTimeframe === 'ALL' ? 'All time' : `Past ${dashboardTimeframe}`}).`
                    : `Proportion of hard working sets completed across muscle groups (${dashboardTimeframe === 'ALL' ? 'All time' : `Past ${dashboardTimeframe}`}).`}
                </Text>

                <View style={styles.distList}>
                  {[...trainingDistribution]
                    .sort((a, b) => (distMode === 'volume' ? b.volumeKg - a.volumeKg : b.setsCount - a.setsCount))
                    .slice(0, 8)
                    .map((item) => {
                      const pct = distMode === 'volume' ? item.percentage : item.setsPercentage;
                      const valText = distMode === 'volume'
                        ? `${item.percentage}% (${formatWeight(item.volumeKg, unit)})`
                        : `${item.setsPercentage}% (${item.setsCount} ${item.setsCount === 1 ? 'set' : 'sets'})`;
                      return (
                        <View key={item.muscle} style={styles.distRow}>
                          <View style={styles.distHeaderRow}>
                            <Text style={styles.distMuscleName}>{item.muscle}</Text>
                            <Text style={styles.distPercentage}>{valText}</Text>
                          </View>
                          <View style={styles.distBarTrack}>
                            <View
                              style={[
                                styles.distBarFill,
                                { width: `${Math.min(100, pct)}%` },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })}
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyTitle}>Progress charts will appear here</Text>
            <Text style={styles.chartEmptyText}>Complete a workout to start tracking volume and muscle frequency.</Text>
          </View>
        )}

      </ScrollView>

      <ExercisePickerModal
        visible={showProgressionPicker}
        title="Select Progression Exercise"
        onClose={() => setShowProgressionPicker(false)}
        onSelectExercise={(ex) => {
          setSelectedProgressionExerciseId(ex.id);
          setShowProgressionPicker(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  breakdownChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
  breakdownChipActive: {
      backgroundColor: '#38BDF820',
      borderColor: colors.primary,
    },
  breakdownChipText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
  breakdownChipTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
  breakdownHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 12,
      flexWrap: 'wrap',
      gap: 8,
    },
  breakdownTimeframeRow: {
      flexDirection: 'row',
      gap: 4,
    },
  breakdownTitleText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
  breakdownTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
  changeBadge: {
      backgroundColor: '#38BDF820',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#38BDF840',
    },
  changeBadgeText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
  chartEmpty: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: 'center',
      marginBottom: 12,
    },
  chartEmptyText: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
  chartEmptyTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
  chartLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 28,
    },
  chartLoadingText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
  consistencyCol: {
      alignItems: 'center',
      gap: 6,
    },
  consistencyDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.surfaceHigh,
    },
  consistencyDotActive: {
      backgroundColor: colors.primary + '99',
    },
  consistencyDotHigh: {
      backgroundColor: colors.primary,
    },
  consistencyHeatmap: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderStrong,
    },
  consistencyLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '600',
    },
  distBarFill: {
      height: '100%',
      backgroundColor: colors.warning,
      borderRadius: 3,
    },
  distBarTrack: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
  distHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
  distList: {
      gap: 10,
    },
  distMuscleName: {
      color: colors.textSoft,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
  distPercentage: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
  distRow: {
      gap: 4,
    },
  distToggleBtn: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
  distToggleBtnActive: {
      backgroundColor: '#F59E0B25',
    },
  distToggleText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
  distToggleTextActive: {
      color: colors.warning,
      fontWeight: '700',
    },
  distToggleWrap: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      padding: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
  emptyChartBox: {
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSunken,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
  emptyChartText: {
      color: colors.textMuted,
      fontSize: 13,
      fontStyle: 'italic',
    },
  exerciseSelectorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
    },
  exerciseSelectorLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
  exerciseSelectorName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      flex: 1,
    },
  filterChip: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
    },
  filterChipActive: {
      backgroundColor: '#38BDF820',
    },
  filterChipText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
  filterChipTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
  filterControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      flexWrap: 'wrap',
      gap: 8,
    },
  filterGroup: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
  gymChip: {
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
  gymChipActive: {
      backgroundColor: '#38BDF820',
      borderColor: '#38BDF850',
    },
  gymChipText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
  gymChipTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
  gymFilterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
  lifetimeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
  lifetimeHeroCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
  lifetimeHeroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
  lifetimeHeroTitle: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
  lifetimeTile: {
      flexGrow: 1,
      flexBasis: '47%',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 14,
      padding: 12,
    },
  lifetimeTileLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
  lifetimeTileSub: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '500',
    },
  lifetimeTileVal: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.4,
      marginBottom: 2,
      fontVariant: ['tabular-nums'],
    },
  muscleBar: {
      height: '100%',
    },
  muscleBarTrack: {
      height: 8,
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 4,
      overflow: 'hidden',
    },
  muscleChart: {
      gap: 9,
    },
  muscleCount: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
  muscleLegend: {
      flexDirection: 'row',
      gap: 14,
      marginTop: 2,
      marginBottom: 2,
    },
  muscleLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
  muscleLegendSwatch: {
      width: 9,
      height: 9,
      borderRadius: 2,
    },
  muscleLegendText: {
      color: colors.textSecondary,
      fontSize: 11,
    },
  muscleName: {
      color: colors.textSoft,
      fontSize: 12,
      textTransform: 'capitalize',
    },
  musclePrimaryBar: {
      backgroundColor: colors.primary,
    },
  muscleRow: {
      gap: 4,
    },
  muscleRowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  muscleSecondaryBar: {
      backgroundColor: colors.primary + '59',
    },
  scrollArea: {
      flex: 1,
    },
  scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 120,
    },
  streakBadge: {
      flex: 1,
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 14,
      padding: 12,
    },
  streakBadgesRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
  streakIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
  streakLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },
  streakValue: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
  toolCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
  toolHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
  toolHeaderBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
  toolHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
  toolSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 14,
    },
  toolTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
  volumeBar: {
      width: '72%',
      backgroundColor: colors.primary,
      borderRadius: 6,
    },
  volumeBarEmpty: {
      backgroundColor: colors.surfaceHigh,
    },
  volumeBarTrack: {
      height: 112,
      width: '100%',
      justifyContent: 'flex-end',
      alignItems: 'center',
      borderRadius: 6,
      overflow: 'hidden',
    },
  volumeChart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      minHeight: 142,
      gap: 5,
    },
  volumeColumn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
    },
  volumeLabel: {
      color: colors.textMuted,
      fontSize: 9,
    },
  zoneBarSegment: {
      height: '100%',
    },
  zoneDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
  zoneLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
  zoneLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
  zoneLegendRow: {
      gap: 6,
    },
  zoneStackedBar: {
      flexDirection: 'row',
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginBottom: 12,
    },
});
