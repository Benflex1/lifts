import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { X, Check, Layers, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { getSupersetMetadata, SUPERSET_PALETTE } from '../workout/supersets';

export interface SupersetModalExerciseItem {
  id: string;
  name: string;
  category?: string;
  equipment?: string;
  supersetId?: string;
  targetSets?: number;
  setsCount?: number;
}

interface SupersetModalProps {
  visible: boolean;
  currentExerciseId: string | null;
  exercises: SupersetModalExerciseItem[];
  onClose: () => void;
  onSaveSuperset: (selectedExerciseIds: string[]) => void;
  onUngroupSuperset: (exerciseId: string) => void;
}

export const SupersetModal: React.FC<SupersetModalProps> = ({
  visible,
  currentExerciseId,
  exercises,
  onClose,
  onSaveSuperset,
  onUngroupSuperset,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Current exercise being edited
  const currentEx = useMemo(
    () => exercises.find((e) => e.id === currentExerciseId),
    [exercises, currentExerciseId]
  );

  const isInExistingSuperset = Boolean(currentEx?.supersetId);

  // Group metadata to show badges for existing supersets
  const supersetMetaMap = useMemo(() => {
    return getSupersetMetadata(exercises);
  }, [exercises]);

  const currentGroupMeta = currentExerciseId ? supersetMetaMap.get(currentExerciseId) : undefined;

  // Initialize selection when modal opens
  useEffect(() => {
    if (!visible || !currentExerciseId) return;

    if (currentEx?.supersetId) {
      // Pre-select all members of this exercise's superset group
      const existingMembers = exercises
        .filter((e) => e.supersetId === currentEx.supersetId)
        .map((e) => e.id);
      setSelectedIds(new Set(existingMembers));
    } else {
      // Pre-select the current exercise
      setSelectedIds(new Set([currentExerciseId]));
    }
  }, [visible, currentExerciseId, currentEx?.supersetId, exercises]);

  const toggleExercise = (id: string) => {
    if (Platform.OS !== 'web') {
      try {
        void Haptics.selectionAsync();
      } catch {}
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = () => {
    if (selectedIds.size < 2) return;
    if (Platform.OS !== 'web') {
      try {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }
    onSaveSuperset(Array.from(selectedIds));
    onClose();
  };

  const handleUngroup = () => {
    if (!currentExerciseId) return;
    if (Platform.OS !== 'web') {
      try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
    }
    onUngroupSuperset(currentExerciseId);
    onClose();
  };

  const canSave = selectedIds.size >= 2;
  const isGiant = selectedIds.size >= 3;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: currentGroupMeta ? `${currentGroupMeta.color}22` : '#8B5CF622' },
                ]}
              >
                <Layers
                  size={18}
                  color={currentGroupMeta ? currentGroupMeta.color : '#A855F7'}
                />
              </View>
              <View>
                <Text style={styles.title}>
                  {isInExistingSuperset
                    ? currentGroupMeta?.label || 'Edit Superset'
                    : 'Create Superset'}
                </Text>
                <Text style={styles.subtitle}>
                  Select exercises to perform back-to-back
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close superset modal"
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Exercise List */}
          <ScrollView style={styles.exerciseList} contentContainerStyle={styles.exerciseListContent}>
            {exercises.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const otherMeta = supersetMetaMap.get(item.id);
              const isOtherGroup =
                otherMeta &&
                (!currentEx?.supersetId || otherMeta.groupId !== currentEx.supersetId);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.exerciseRow,
                    isSelected && styles.exerciseRowSelected,
                  ]}
                  onPress={() => toggleExercise(item.id)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${item.name}, ${isSelected ? 'selected' : 'not selected'}`}
                >
                  {/* Checkbox */}
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                  </View>

                  {/* Exercise Info */}
                  <View style={styles.exerciseInfo}>
                    <Text style={[styles.exerciseName, isSelected && styles.exerciseNameSelected]}>
                      {item.name}
                    </Text>
                    <View style={styles.exerciseMetaRow}>
                      {Boolean(item.category || item.equipment) && (
                        <Text style={styles.exerciseMetaText}>
                          {[item.category, item.equipment].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      {Boolean(item.targetSets || item.setsCount) && (
                        <Text style={styles.exerciseSetsText}>
                          · {item.targetSets ? `${item.targetSets} sets planned` : `${item.setsCount} sets`}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Group Tag / Badge if in another group */}
                  {isOtherGroup && !isSelected && (
                    <View style={[styles.otherGroupBadge, { borderColor: otherMeta.color }]}>
                      <Text style={[styles.otherGroupBadgeText, { color: otherMeta.color }]}>
                        {otherMeta.label}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Summary / Tip Banner */}
          <View style={styles.summaryBar}>
            <Text style={styles.summaryText}>
              {selectedIds.size === 0
                ? 'Tap exercises to include them in the superset'
                : selectedIds.size === 1
                ? 'Select at least 1 more exercise to form a superset'
                : `⚡ ${isGiant ? 'Giant Set' : 'Superset'} with ${selectedIds.size} exercises`}
            </Text>
          </View>

          {/* Bottom Actions */}
          <View style={styles.footerActions}>
            {isInExistingSuperset && (
              <TouchableOpacity
                style={styles.ungroupBtn}
                onPress={handleUngroup}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Ungroup superset"
              >
                <Trash2 size={16} color="#EF4444" />
                <Text style={styles.ungroupBtnText}>Ungroup</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              disabled={!canSave}
              onPress={handleSave}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={isInExistingSuperset ? 'Save superset' : 'Create superset'}
            >
              <Layers size={16} color={canSave ? '#FFFFFF' : '#6B7280'} />
              <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>
                {isInExistingSuperset
                  ? `Save (${selectedIds.size})`
                  : `Create Superset (${selectedIds.size})`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#161922',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#262A36',
    overflow: 'hidden',
    display: 'flex',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262A36',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  subtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  exerciseList: {
    flexGrow: 0,
    maxHeight: 380,
  },
  exerciseListContent: {
    padding: 12,
    gap: 8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#1E2330',
    borderWidth: 1.5,
    borderColor: '#2D3345',
    gap: 12,
  },
  exerciseRowSelected: {
    backgroundColor: '#261C3D',
    borderColor: '#8B5CF6',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  exerciseNameSelected: {
    color: '#FFFFFF',
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  exerciseMetaText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  exerciseSetsText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 2,
  },
  otherGroupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#1E2330',
  },
  otherGroupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#12151D',
    borderTopWidth: 1,
    borderTopColor: '#262A36',
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C4B5FD',
    textAlign: 'center',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
    backgroundColor: '#161922',
    borderTopWidth: 1,
    borderTopColor: '#262A36',
  },
  ungroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    backgroundColor: '#261214',
  },
  ungroupBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#8B5CF6',
  },
  saveBtnDisabled: {
    backgroundColor: '#2A2D3A',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveBtnTextDisabled: {
    color: '#6B7280',
  },
});
