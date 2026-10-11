import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { X, ArrowUp, ArrowDown, Repeat } from 'lucide-react-native';
import { Routine } from '../types';
import { DELOAD_EVERY_OPTIONS, RoutineProgram, resolveRotation } from '../workout/programs';
import { colors, radii } from '../theme';
import { Chip } from './ui';

interface ProgramEditorModalProps {
  visible: boolean;
  folderName: string | null;
  routines: Routine[];
  program?: RoutineProgram;
  onSave: (program: RoutineProgram) => Promise<void>;
  onStop: () => Promise<void>;
  onClose: () => void;
}

/** Turns a folder into a rotation, or edits one: order and deload weeks. */
export function ProgramEditorModal({
  visible,
  folderName,
  routines,
  program,
  onSave,
  onStop,
  onClose,
}: ProgramEditorModalProps) {
  const [order, setOrder] = useState<Routine[]>([]);
  const [deloadEvery, setDeloadEvery] = useState<number | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible || !folderName) return;
    const draft: RoutineProgram = program ?? {
      folderName,
      routineIds: [],
      startedAt: new Date().toISOString(),
    };
    setOrder(resolveRotation(draft, routines));
    setDeloadEvery(program?.deloadEvery);
  }, [visible, folderName, program, routines]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  const handleSave = async () => {
    if (!folderName || order.length < 2 || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        folderName,
        routineIds: order.map((routine) => routine.id),
        // Keep the history of an existing rotation; a new one starts counting now.
        startedAt: program?.startedAt ?? new Date().toISOString(),
        ...(deloadEvery ? { deloadEvery } : {}),
        ...(program?.nextOverride ? { nextOverride: program.nextOverride } : {}),
      });
      onClose();
    } catch {
      // The settings context already told the user.
    } finally {
      setIsSaving(false);
    }
  };

  const handleStop = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onStop();
      onClose();
    } catch {
      // The settings context already told the user.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Repeat size={18} color={colors.primaryLight} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{program ? 'Edit rotation' : 'Make a rotation'}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{folderName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X color={colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.explain}>
              Lifts puts the next routine on the Workout tab and moves on each time you finish one.
            </Text>

            <Text style={styles.sectionLabel}>Order</Text>
            {order.map((routine, index) => (
              <View key={routine.id} style={styles.routineRow}>
                <View style={styles.indexBadge}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>
                <View style={styles.routineInfo}>
                  <Text style={styles.routineName} numberOfLines={1}>{routine.name}</Text>
                  <Text style={styles.routineMeta}>
                    {routine.exercises.length} {routine.exercises.length === 1 ? 'exercise' : 'exercises'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.arrowBtn, index === 0 && styles.arrowDisabled]}
                  onPress={() => move(index, -1)}
                  disabled={index === 0}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${routine.name} up`}
                >
                  <ArrowUp size={16} color={colors.textSoft} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.arrowBtn, index === order.length - 1 && styles.arrowDisabled]}
                  onPress={() => move(index, 1)}
                  disabled={index === order.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${routine.name} down`}
                >
                  <ArrowDown size={16} color={colors.textSoft} />
                </TouchableOpacity>
              </View>
            ))}
            {order.length < 2 && (
              <Text style={styles.warning}>Add at least two routines to this folder to make a rotation.</Text>
            )}

            <Text style={[styles.sectionLabel, styles.sectionGap]}>Deload week</Text>
            <View style={styles.chips}>
              <Chip label="Off" size="sm" selected={!deloadEvery} onPress={() => setDeloadEvery(undefined)} />
              {DELOAD_EVERY_OPTIONS.map((every) => (
                <Chip
                  key={every}
                  label={`Every ${every}${every === 3 ? 'rd' : 'th'}`}
                  size="sm"
                  selected={deloadEvery === every}
                  onPress={() => setDeloadEvery(every)}
                  accessibilityLabel={`Deload every ${every} cycles`}
                />
              ))}
            </View>
            <Text style={styles.caption}>
              {deloadEvery
                ? `Every ${deloadEvery}${deloadEvery === 3 ? 'rd' : 'th'} time through the rotation, next targets drop to about 90% so you recover.`
                : 'No lighter weeks. You can turn this on later.'}
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, (order.length < 2 || isSaving) && styles.saveDisabled]}
            onPress={handleSave}
            disabled={order.length < 2 || isSaving}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{program ? 'Save rotation' : 'Start rotation'}</Text>
          </TouchableOpacity>
          {program && (
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} disabled={isSaving} accessibilityRole="button">
              <Text style={styles.stopText}>Stop rotation</Text>
            </TouchableOpacity>
          )}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginTop: 1 },
  body: { flexGrow: 0 },
  bodyContent: { paddingBottom: 6 },
  explain: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionGap: { marginTop: 18 },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' },
  routineInfo: { flex: 1, minWidth: 0 },
  routineName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  routineMeta: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  arrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.3 },
  warning: { color: colors.warning, fontSize: 13, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  caption: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800' },
  stopBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  stopText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
});
