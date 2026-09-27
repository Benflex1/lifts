import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Search, Trophy, X } from 'lucide-react-native';
import { ExerciseRecordSummary, LiftHighlight, TrophyRoomSummary } from '../workout/trophy-room';
import { formatWeight, kgToDisplay, WeightUnit } from '../utils/units';
import { Gym } from '../types';
import { colors, radii } from '../theme';
import { Chip, PRMark } from './ui';

const CATEGORIES = ['all', 'chest', 'back', 'legs', 'shoulders', 'arms', 'core'] as const;
const RECENT_LIMIT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

interface RecordsViewProps {
  /** Records for the current gym, before category and search filters. */
  overview: TrophyRoomSummary | null;
  /** Records after category and search filters. */
  filtered: TrophyRoomSummary | null;
  unit: WeightUnit;
  gyms: Gym[];
  gymTrackingEnabled: boolean;
  selectedGymId: string | null;
  onSelectGym: (gymId: string | null) => void;
  category: string;
  onSelectCategory: (category: string) => void;
  search: string;
  onChangeSearch: (value: string) => void;
  onOpenRecord: (record: ExerciseRecordSummary) => void;
}

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", otherwise a short date. */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 28) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

function recordDate(record: ExerciseRecordSummary): string | undefined {
  const dates = [record.bestWeight?.date, record.best1RM?.date, record.bestVolume?.date, record.bestReps?.date].filter(
    (d): d is string => Boolean(d),
  );
  return dates.sort().pop();
}

function headlineFor(record: ExerciseRecordSummary, unit: WeightUnit): { value: string; caption: string } {
  if (record.best1RM) return { value: formatWeight(record.best1RM.value, unit), caption: 'e1RM' };
  if (record.bestWeight) return { value: formatWeight(record.bestWeight.value, unit), caption: 'heaviest' };
  if (record.bestReps) return { value: String(record.bestReps.value), caption: 'reps' };
  return { value: '—', caption: '' };
}

function detailFor(record: ExerciseRecordSummary, unit: WeightUnit): string {
  if (record.bestWeight) return `Heaviest ${formatWeight(record.bestWeight.value, unit)} × ${record.bestWeight.reps}`;
  if (record.bestReps) return `Best set ${record.bestReps.value} reps`;
  return 'No completed sets yet';
}

function BigLift({ label, lift, unit }: { label: string; lift?: LiftHighlight; unit: WeightUnit }) {
  return (
    <View style={styles.bigLift}>
      <Text style={styles.bigLiftLabel}>{label}</Text>
      <Text style={styles.bigLiftValue} numberOfLines={1}>
        {lift ? kgToDisplay(lift.oneRMKg, unit) : '—'}
      </Text>
      <Text style={styles.bigLiftSub} numberOfLines={1}>
        {lift ? `${kgToDisplay(lift.weightKg, unit)} × ${lift.reps}` : 'Not logged'}
      </Text>
    </View>
  );
}

export function RecordsView({
  overview,
  filtered,
  unit,
  gyms,
  gymTrackingEnabled,
  selectedGymId,
  onSelectGym,
  category,
  onSelectCategory,
  search,
  onChangeSearch,
  onOpenRecord,
}: RecordsViewProps) {
  const hasRecord = (record: ExerciseRecordSummary) => Boolean(record.bestWeight || record.bestReps);
  const overviewRecords = overview?.records.filter(hasRecord) ?? [];

  if (!overview || overviewRecords.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <PRMark rank={1} size={56} />
        <Text style={styles.emptyTitle}>Your records live here</Text>
        <Text style={styles.emptyText}>
          Finish a workout and every best lift, rep and volume record is tracked automatically.
        </Text>
      </View>
    );
  }

  const big = overview.sbdBreakdown;
  const hasBigThree = Boolean(big.squat || big.bench || big.deadlift);

  const recent = overviewRecords
    .map(record => ({ record, date: recordDate(record) }))
    .filter((item): item is { record: ExerciseRecordSummary; date: string } => Boolean(item.date))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, RECENT_LIMIT);

  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const recentCount = recent.filter(item => item.date >= thirtyDaysAgo).length;
  const records = (filtered?.records ?? []).filter(hasRecord);

  return (
    <View>
      {hasBigThree && (
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroEyebrow}>Big Three total</Text>
              <View style={styles.heroTotalRow}>
                <Text style={styles.heroTotal}>{kgToDisplay(overview.sbdTotalKg, unit)}</Text>
                <Text style={styles.heroUnit}>{unit}</Text>
              </View>
            </View>
            <View style={styles.heroBadge}>
              <Trophy size={14} color={colors.gold} />
              <Text style={styles.heroBadgeText}>Estimated 1RM</Text>
            </View>
          </View>
          <View style={styles.bigLiftRow}>
            <BigLift label="Squat" lift={big.squat} unit={unit} />
            <View style={styles.bigLiftDivider} />
            <BigLift label="Bench" lift={big.bench} unit={unit} />
            <View style={styles.bigLiftDivider} />
            <BigLift label="Deadlift" lift={big.deadlift} unit={unit} />
          </View>
        </View>
      )}

      {/* Recent PRs */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Recent PRs</Text>
        {recentCount > 0 && <Text style={styles.sectionMeta}>{recentCount} in the last 30 days</Text>}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recentRow}
        style={styles.recentScroll}
      >
        {recent.map(({ record, date }) => {
          const headline = headlineFor(record, unit);
          return (
            <TouchableOpacity
              key={record.exerciseId}
              style={styles.recentCard}
              onPress={() => onOpenRecord(record)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${record.exerciseName}, ${headline.value} ${headline.caption}, ${formatRelativeDay(date)}`}
            >
              <View style={styles.recentTop}>
                <PRMark rank={1} size={26} />
                <Text style={styles.recentDate}>{formatRelativeDay(date)}</Text>
              </View>
              <Text style={styles.recentName} numberOfLines={2}>
                {record.exerciseName}
              </Text>
              <Text style={styles.recentValue} numberOfLines={1}>
                {headline.value}
                <Text style={styles.recentCaption}> {headline.caption}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* All records */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>All records</Text>
        <Text style={styles.sectionMeta}>
          {overviewRecords.length} {overviewRecords.length === 1 ? 'exercise' : 'exercises'}
        </Text>
      </View>

      <View style={styles.searchRow}>
        <Search size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search records"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={onChangeSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeSearch('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
        keyboardShouldPersistTaps="handled"
      >
        {CATEGORIES.map(cat => (
          <Chip
            key={cat}
            size="sm"
            label={cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            selected={category === cat}
            onPress={() => onSelectCategory(cat)}
          />
        ))}
        {gymTrackingEnabled && gyms.length > 1 && (
          <>
            <View style={styles.chipDivider} />
            <Chip size="sm" label="All gyms" selected={selectedGymId === null} onPress={() => onSelectGym(null)} />
            {gyms.map(gym => (
              <Chip
                key={gym.id}
                size="sm"
                label={gym.name}
                selected={selectedGymId === gym.id}
                onPress={() => onSelectGym(gym.id)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {records.length > 0 ? (
        <View style={styles.listCard}>
          {records.map((record, idx) => {
            const headline = headlineFor(record, unit);
            const date = recordDate(record);
            return (
              <TouchableOpacity
                key={record.exerciseId}
                style={[styles.listRow, idx > 0 && styles.listRowDivider]}
                onPress={() => onOpenRecord(record)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`View ${record.exerciseName} record details`}
              >
                <View style={styles.listRowText}>
                  <Text style={styles.listName} numberOfLines={1}>
                    {record.exerciseName}
                  </Text>
                  <Text style={styles.listDetail} numberOfLines={1}>
                    {detailFor(record, unit)}
                    {date ? ` · ${formatRelativeDay(date)}` : ''}
                  </Text>
                </View>
                <View style={styles.listValueWrap}>
                  <Text style={styles.listValue}>{headline.value}</Text>
                  <Text style={styles.listCaption}>{headline.caption}</Text>
                </View>
                <ChevronRight size={16} color={colors.textFaint} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.noMatch}>
          <Text style={styles.emptyText}>No records match these filters.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 24,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  heroEyebrow: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  heroTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  heroTotal: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.gold + '1A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  heroBadgeText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  bigLiftRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingVertical: 12,
  },
  bigLiftDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
  bigLift: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bigLiftLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  bigLiftValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  bigLiftSub: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  recentScroll: {
    marginHorizontal: -16,
    marginBottom: 24,
  },
  recentRow: {
    gap: 10,
    paddingHorizontal: 16,
  },
  recentCard: {
    width: 148,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  recentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  recentDate: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  recentName: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    minHeight: 34,
  },
  recentValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  recentCaption: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  chipScroll: {
    marginHorizontal: -16,
    marginBottom: 12,
    flexGrow: 0,
  },
  chipRow: {
    gap: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  chipDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.borderStrong,
    marginHorizontal: 2,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingLeft: 16,
    paddingRight: 12,
  },
  listRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  listRowText: {
    flex: 1,
  },
  listName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  listDetail: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  listValueWrap: {
    alignItems: 'flex-end',
  },
  listValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  listCaption: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  noMatch: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 28,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 6,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
