import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Repeat, MoreHorizontal, Check, Feather } from 'lucide-react-native';
import { ProgramState, formatDaysAgo } from '../workout/programs';
import { colors, radii } from '../theme';
import { IconButton } from './ui';

interface ProgramCardProps {
  state: ProgramState;
  onStart: () => void;
  onMenu: () => void;
}

/** "Push Day (Chest/Shoulders)" reads as "Push Day" under the progress bar. */
export function shortRoutineName(name: string): string {
  const short = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return short || name;
}

/** The "up next" hero for a routine rotation on the Workout tab. */
export function ProgramCard({ state, onStart, onMenu }: ProgramCardProps) {
  const { program, rotation, next, nextIndex, cycle, isDeload, lastWorkout, lastRoutine } = state;
  const exerciseCount = next.exercises.length;
  const setCount = next.exercises.reduce((sum, item) => sum + (item.targetSets || 0), 0);
  const accent = isDeload ? colors.warning : colors.primary;
  const shortName = shortRoutineName(next.name);
  const detail = shortName !== next.name ? next.name.slice(shortName.length).trim().replace(/^\(|\)$/g, '') : '';

  return (
    <View style={[styles.card, isDeload && styles.cardDeload]}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      <View style={styles.headerRow}>
        <View style={styles.eyebrowRow}>
          <Repeat size={13} color={isDeload ? colors.warning : colors.primaryLight} />
          <Text style={[styles.eyebrow, isDeload && { color: colors.warning }]} numberOfLines={1}>
            {program.folderName} · Cycle {cycle}
          </Text>
          {isDeload && (
            <View style={styles.deloadPill}>
              <Feather size={11} color={colors.warning} />
              <Text style={styles.deloadPillText}>Deload week</Text>
            </View>
          )}
        </View>
        <IconButton
          icon={MoreHorizontal}
          tone="ghost"
          size={32}
          iconSize={18}
          onPress={onMenu}
          accessibilityLabel={`${program.folderName} rotation options`}
        />
      </View>

      <Text style={styles.upNext}>Up next</Text>
      <Text style={styles.title} numberOfLines={1}>{shortName}</Text>
      {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
      <Text style={styles.meta}>
        {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'} · {setCount} sets
        {isDeload ? ' · lighter targets' : ''}
      </Text>

      <View style={styles.track} accessible accessibilityLabel={`Workout ${nextIndex + 1} of ${rotation.length} in this cycle`}>
        {rotation.map((routine, index) => {
          const isDone = state.doneThisCycleIds.includes(routine.id) && index !== nextIndex;
          const isNext = index === nextIndex;
          return (
            <View key={routine.id} style={styles.step}>
              <View
                style={[
                  styles.segment,
                  isDone && { backgroundColor: accent, opacity: 0.55 },
                  isNext && { backgroundColor: accent },
                ]}
              />
              <View style={styles.stepLabelRow}>
                {isDone && <Check size={10} color={colors.textMuted} strokeWidth={3} />}
                <Text
                  style={[styles.stepLabel, isNext && styles.stepLabelNext]}
                  numberOfLines={1}
                >
                  {shortRoutineName(routine.name)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {lastWorkout && lastRoutine && (
        <Text style={styles.lastLine} numberOfLines={1}>
          Last: {lastRoutine.name} · {formatDaysAgo(lastWorkout.startTime)}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.startButton, { backgroundColor: accent }]}
        onPress={onStart}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Start ${next.name}`}
      >
        <Play size={16} color={isDeload ? colors.black : colors.onPrimary} fill={isDeload ? colors.black : colors.onPrimary} />
        <Text style={[styles.startText, isDeload && { color: colors.black }]} numberOfLines={1}>
          Start {shortName}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardDeload: {
    borderColor: colors.warningSoft,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  eyebrow: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  deloadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  deloadPillText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
  },
  upNext: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 2,
  },
  detail: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  track: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 18,
  },
  step: {
    flex: 1,
    minWidth: 0,
  },
  segment: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceHigh,
  },
  stepLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 7,
  },
  stepLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  stepLabelNext: {
    color: colors.text,
    fontWeight: '800',
  },
  lastLine: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 14,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.md,
    paddingVertical: 14,
    marginTop: 14,
  },
  startText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
