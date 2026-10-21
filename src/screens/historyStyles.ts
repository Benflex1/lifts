import { StyleSheet } from 'react-native';
import { colors, radii } from '../theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  gymFilterSection: {
    paddingBottom: 12,
  },
  gymFilterScroll: {
    gap: 8,
    paddingHorizontal: 16,
  },
  gymSwatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gymTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  gymTagText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 120,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  workoutName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  dateText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  expandedSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    gap: 10,
  },
  editWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    marginTop: 4,
    paddingVertical: 12,
  },
  editWorkoutButtonText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  detailExBlock: {
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    borderRadius: radii.md,
  },
  detailExTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailExNotes: {
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  detailSetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailSetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 6,
  },
  detailSetNum: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  detailSetWeight: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  detailRpe: {
    color: colors.purple,
    fontSize: 10,
    fontWeight: '700',
  },
  metricPRText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  detailExHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  exerciseNamesBox: {
    marginTop: 12,
  },
  exerciseNamesText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySub: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  historySupersetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 4,
    borderLeftWidth: 3,
  },
  historySupersetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  historySupersetBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  historySupersetSubtext: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  detailExTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  historySupersetPosBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
  },
  historySupersetPosText: {
    fontSize: 9,
    fontWeight: '800',
  },
  detailSetTypeBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  detailSetTypeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  detailSetTypeWarmup: {
    backgroundColor: '#78350F30',
    borderColor: '#F59E0B60',
  },
  detailSetTypeWarmupText: {
    color: colors.warning,
  },
  detailSetTypeDrop: {
    backgroundColor: '#83184330',
    borderColor: '#EC489960',
  },
  detailSetTypeDropText: {
    color: '#F472B6',
  },
  detailSetTypeFailure: {
    backgroundColor: '#7F1D1D30',
    borderColor: '#EF444460',
  },
  detailSetTypeFailureText: {
    color: colors.danger,
  },
  prMetric: {
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  expandIndicator: {
    width: 34,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cardToggle: {
    flex: 1,
    marginRight: 8,
  },
  cardSide: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
