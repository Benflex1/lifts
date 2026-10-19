import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Minus, Plus, Trash2, Weight, X } from 'lucide-react-native';
import {
  BodyWeightEntry,
  formatWeighInDate,
  isValidBodyWeightKg,
  toDateKey,
} from '../workout/body-weight';
import { sanitizeWeightInput } from '../workout/sets';
import { displayToKg, kgToDisplay, WeightUnit } from '../utils/units';
import { colors, radii } from '../theme';
import { Chip } from './ui';

interface BodyWeightModalProps {
  visible: boolean;
  entries: BodyWeightEntry[];
  unit: WeightUnit;
  onSave: (date: string, weightKg: number) => Promise<void>;
  onDelete: (date: string) => Promise<void>;
  onClose: () => void;
}

const DAY_OPTIONS = [
  { offset: 0, label: 'Today' },
  { offset: 1, label: 'Yesterday' },
  { offset: 2, label: '2 days ago' },
];

const RECENT_LIMIT = 8;

function dateKeyDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateKey(date);
}

/** Logs a weigh-in for today or the last two days, and lists recent ones to fix or remove. */
export function BodyWeightModal({
  visible,
  entries,
  unit,
  onSave,
  onDelete,
  onClose,
}: BodyWeightModalProps) {
  const [text, setText] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const entryFor = (offset: number) => entries.find(entry => entry.date === dateKeyDaysAgo(offset));

  useEffect(() => {
    if (!visible) return;
    setDayOffset(0);
    setPendingDelete(null);
    // Start from today's weigh-in if there is one, else the latest, so a small change is a tap or two.
    const start = entryFor(0) ?? entries[entries.length - 1];
    setText(start ? kgToDisplay(start.weightKg, unit).toFixed(1) : '');
    // Only when the sheet opens: typing must not be overwritten by a refreshed log.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Weigh-ins keep one decimal, the same as the field shows, so saving never shifts a value.
  const parsed = Math.round(parseFloat(sanitizeWeightInput(text)) * 10) / 10;
  const weightKg = Number.isFinite(parsed) ? displayToKg(parsed, unit) : NaN;
  const isValid = isValidBodyWeightKg(weightKg);
  const replacing = entryFor(dayOffset);

  const step = (direction: 1 | -1) => {
    const base = Number.isFinite(parsed) ? parsed : 0;
    setText(Math.max(0, Math.round((base + direction * 0.1) * 10) / 10).toFixed(1));
  };

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(dateKeyDaysAgo(dayOffset), weightKg);
      onClose();
    } catch {
      // The caller already told the user.
    } finally {
      setIsSaving(false);
    }
  };

  const recent = [...entries].reverse().slice(0, RECENT_LIMIT);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Weight size={18} color={colors.primaryLight} />
            </View>
            <Text style={styles.title}>Log body weight</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X color={colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => step(-1)}
                accessibilityRole="button"
                accessibilityLabel={`0.1 ${unit} less`}
              >
                <Minus size={18} color={colors.textSoft} />
              </TouchableOpacity>
              <View style={styles.inputWrap}>
                <TextInput
                  value={text}
                  onChangeText={value => setText(sanitizeWeightInput(value))}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor={colors.textFaint}
                  // Sized to the number, so the unit sits right beside it.
                  style={[styles.input, { width: Math.max(3, text.length || 3) * 22 + 8 }]}
                  selectTextOnFocus
                  accessibilityLabel={`Body weight in ${unit}`}
                  onSubmitEditing={handleSave}
                />
                <Text style={styles.inputUnit}>{unit}</Text>
              </View>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => step(1)}
                accessibilityRole="button"
                accessibilityLabel={`0.1 ${unit} more`}
              >
                <Plus size={18} color={colors.textSoft} />
              </TouchableOpacity>
            </View>
            {text !== '' && !isValid && (
              <Text style={styles.warning}>
                Enter a weight between {Math.ceil(kgToDisplay(20, unit))} and{' '}
                {Math.floor(kgToDisplay(400, unit))} {unit}.
              </Text>
            )}

            <View style={styles.chips}>
              {DAY_OPTIONS.map(option => (
                <Chip
                  key={option.offset}
                  label={option.label}
                  size="sm"
                  selected={dayOffset === option.offset}
                  onPress={() => setDayOffset(option.offset)}
                />
              ))}
            </View>
            {replacing && (
              <Text style={styles.caption}>
                Replaces the {kgToDisplay(replacing.weightKg, unit).toFixed(1)} {unit} logged for
                this day.
              </Text>
            )}

            {recent.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Recent</Text>
                {recent.map(entry => (
                  <View key={entry.date} style={styles.recentRow}>
                    <Text style={styles.recentDate}>{formatWeighInDate(entry.date)}</Text>
                    <Text style={styles.recentValue}>
                      {kgToDisplay(entry.weightKg, unit).toFixed(1)} {unit}
                    </Text>
                    {pendingDelete === entry.date ? (
                      // A second tap deletes, so a stray tap never loses a weigh-in.
                      <TouchableOpacity
                        onPress={() => {
                          setPendingDelete(null);
                          void onDelete(entry.date).catch(() => {});
                        }}
                        style={styles.confirmDelete}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm delete weigh-in from ${formatWeighInDate(entry.date)}`}
                      >
                        <Text style={styles.confirmDeleteText}>Delete</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setPendingDelete(entry.date)}
                        style={styles.deleteBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete weigh-in from ${formatWeighInDate(entry.date)}`}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Trash2 size={15} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, (!isValid || isSaving) && styles.saveDisabled]}
            onPress={handleSave}
            disabled={!isValid || isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save weigh-in"
          >
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 20 },
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  body: { flexGrow: 0 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  input: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
    padding: 0,
  },
  inputUnit: { color: colors.textSecondary, fontSize: 16, fontWeight: '700', marginLeft: 4 },
  warning: { color: colors.warning, fontSize: 13, marginTop: 8, textAlign: 'center' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
  },
  caption: { color: colors.textMuted, fontSize: 12, marginTop: 8, textAlign: 'center' },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 6,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recentDate: { flex: 1, color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  recentValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginRight: 14 },
  deleteBtn: { padding: 2 },
  confirmDelete: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  confirmDeleteText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800' },
});
