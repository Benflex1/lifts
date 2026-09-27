import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  Platform,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trophy } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radii, spacing, type, HEADER_TOP_FALLBACK } from '../theme';

/**
 * Shared building blocks for the Lifts UI. Screens compose these instead of
 * restyling headers, chips and menus individually, which keeps spacing and
 * hierarchy consistent across the app.
 */

// ---------------------------------------------------------------------------
// Screen header
// ---------------------------------------------------------------------------

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, eyebrow, right, children }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const top = insets.top > 0 ? insets.top + 12 : HEADER_TOP_FALLBACK;

  return (
    <View style={[styles.header, { paddingTop: top }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitles}>
          {eyebrow ? <Text style={styles.headerEyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Icon button
// ---------------------------------------------------------------------------

type Tone = 'default' | 'primary' | 'danger' | 'ghost';

interface IconButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: Tone;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  tone = 'default',
  size = 40,
  iconSize = 19,
  disabled,
  style,
}: IconButtonProps) {
  const toneStyle =
    tone === 'primary'
      ? { backgroundColor: colors.primary }
      : tone === 'danger'
        ? { backgroundColor: colors.dangerSoft }
        : tone === 'ghost'
          ? { backgroundColor: 'transparent' }
          : { backgroundColor: colors.surfaceHigh };
  const iconColor =
    tone === 'primary' ? colors.onPrimary : tone === 'danger' ? colors.danger : colors.textSoft;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        toneStyle,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon size={iconSize} color={iconColor} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map(option => {
        const selected = option.key === value;
        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.segment, selected && styles.segmentActive]}
            onPress={() => onChange(option.key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  leading?: React.ReactNode;
  size?: 'md' | 'sm';
  accessibilityLabel?: string;
}

export function Chip({ label, selected, onPress, leading, size = 'md', accessibilityLabel }: ChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        size === 'sm' && styles.chipSm,
        selected && (size === 'sm' ? styles.chipSmActive : styles.chipActive),
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: Boolean(selected) }}
    >
      {leading}
      <Text
        style={[
          styles.chipText,
          size === 'sm' && styles.chipTextSm,
          selected && (size === 'sm' ? styles.chipTextSmActive : styles.chipTextActive),
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, meta, actionLabel, onAction, style }: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
        >
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Action sheet
// ---------------------------------------------------------------------------

export interface SheetAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
}

// Safety net in case iOS never reports the dismissal of the sheet's modal.
const IOS_DISMISS_FALLBACK_MS = 600;

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}

export function ActionSheet({ visible, title, subtitle, actions, onClose }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  // iOS cannot present another modal until this one has fully dismissed, so the chosen action
  // runs from onDismiss there. Other platforms run it immediately.
  const pendingActionRef = useRef<(() => void) | null>(null);

  const runPendingAction = () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  };

  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
      return;
    }
    if (Platform.OS === 'ios' && pendingActionRef.current) {
      const fallback = setTimeout(runPendingAction, IOS_DISMISS_FALLBACK_MS);
      return () => clearTimeout(fallback);
    }
  }, [visible, progress]);

  const handleSelect = (action: SheetAction) => {
    if (Platform.OS === 'ios') {
      pendingActionRef.current = action.onPress;
      onClose();
    } else {
      onClose();
      action.onPress();
    }
  };

  const sheetTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [360, 0] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={runPendingAction}
    >
      <View style={styles.sheetRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: progress }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
            accessibilityLabel="Close menu"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md) },
            { transform: [{ translateY: sheetTranslate }] },
          ]}
        >
          <View style={styles.sheetHandle} />
          {title ? (
            <View style={styles.sheetTitleWrap}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.sheetSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.sheetGroup}>
            {actions.map((action, idx) => {
              const Icon = action.icon;
              return (
                <TouchableOpacity
                  key={action.key}
                  style={[styles.sheetItem, idx > 0 && styles.sheetItemDivider]}
                  onPress={() => handleSelect(action)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <View
                    style={[
                      styles.sheetIcon,
                      action.destructive && { backgroundColor: colors.dangerSoft },
                    ]}
                  >
                    <Icon size={17} color={action.destructive ? colors.danger : colors.textSoft} />
                  </View>
                  <Text
                    style={[styles.sheetItemText, action.destructive && { color: colors.danger }]}
                    numberOfLines={1}
                  >
                    {action.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.sheetCancel}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// PR mark
// ---------------------------------------------------------------------------

export type PRRankLevel = 1 | 2 | 3;

/** Accent per record rank: gold for a new best, quieter metals for 2nd and 3rd best. */
export const PR_RANK_COLORS: Record<PRRankLevel, string> = {
  1: '#F5B83D',
  2: '#AEB7C4',
  3: '#D4925B',
};

export const PR_RANK_LABELS: Record<PRRankLevel, string> = {
  1: 'PR',
  2: '2nd best',
  3: '3rd best',
};

interface PRMarkProps {
  rank: PRRankLevel;
  size?: number;
}

/** A tinted trophy disc; the one visual used for personal records across the app. */
export function PRMark({ rank, size = 28 }: PRMarkProps) {
  const color = PR_RANK_COLORS[rank];
  return (
    <View
      accessibilityLabel={rank === 1 ? 'Personal record' : PR_RANK_LABELS[rank]}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color + '24',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Trophy size={Math.round(size * 0.52)} color={color} strokeWidth={2.2} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

interface StatProps {
  label: string;
  value: string;
  accent?: string;
}

export function Stat({ label, value, accent }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTitles: {
    flex: 1,
  },
  headerEyebrow: {
    ...type.overline,
    color: colors.textMuted,
    marginBottom: 2,
  },
  headerTitle: {
    ...type.largeTitle,
  },
  headerSubtitle: {
    ...type.subhead,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: 2,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.surfaceHigh,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.text,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipSm: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipSmActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipTextSmActive: {
    color: colors.primaryLight,
  },
  chipActive: {
    backgroundColor: colors.text,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSm: {
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.bg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...type.title,
    fontSize: 20,
  },
  sectionMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sectionAction: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.control,
    marginBottom: spacing.md,
  },
  sheetTitleWrap: {
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...type.headline,
  },
  sheetSubtitle: {
    ...type.caption,
    marginTop: 2,
  },
  sheetGroup: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  sheetItemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  sheetIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  sheetCancel: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
  sheetCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  stat: {
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...type.caption,
    marginTop: 2,
  },
});
