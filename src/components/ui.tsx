import React from 'react';
import {
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

const IOS_MODAL_HANDOFF_MS = 350;

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}

export function ActionSheet({ visible, title, subtitle, actions, onClose }: ActionSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md) }]}
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
                  onPress={() => {
                    onClose();
                    // iOS cannot present a new modal while this one is still dismissing.
                    if (Platform.OS === 'ios') setTimeout(action.onPress, IOS_MODAL_HANDOFF_MS);
                    else action.onPress();
                  }}
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
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Medal
// ---------------------------------------------------------------------------

export const MEDAL_COLORS = {
  1: { fill: '#F5B83D', ring: '#FCD877', text: '#3D2A00' },
  2: { fill: '#B9C2CF', ring: '#E2E8F0', text: '#1F2733' },
  3: { fill: '#D08A4E', ring: '#EDB282', text: '#3A1C05' },
} as const;

interface MedalProps {
  rank: 1 | 2 | 3;
  size?: number;
  /** Show the rank number inside the medal. */
  numbered?: boolean;
}

/** A small, platform-consistent medal disc used wherever a PR rank is shown. */
export function Medal({ rank, size = 14, numbered = false }: MedalProps) {
  const palette = MEDAL_COLORS[rank];
  return (
    <View
      accessibilityLabel={rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : 'Bronze'}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette.fill,
        borderWidth: Math.max(1, Math.round(size / 9)),
        borderColor: palette.ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {numbered ? (
        <Text style={{ color: palette.text, fontSize: size * 0.5, fontWeight: '900' }}>{rank}</Text>
      ) : null}
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
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
