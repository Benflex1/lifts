import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useDialog } from '../context/DialogContext';
import {
  X,
  Plus,
  Trash2,
  Dumbbell,
  Clock,
  ChevronUp,
  ChevronDown,
  Minus,
  Folder,
  Layers,
  Sparkles,
  ArrowRightLeft,
  Copy,
  Timer,
  Check,
  MoreHorizontal,
} from 'lucide-react-native';
import { Exercise, Routine } from '../types';
import { ExercisePickerModal } from './ExercisePickerModal';
import { ExerciseVisual } from './ExerciseVisual';
import { RestTimeWheelModal } from './RestTimeWheelModal';
import { getExerciseRowViewModel } from '../utils/exercise-ui';
import { saveRoutine } from '../database/db';
import { validateTargetReps } from '../workout/sets';
import { SupersetModal } from './SupersetModal';
import {
  getSupersetMetadata,
  linkExercisesInGroup,
  unlinkExerciseFromGroup,
  setSupersetGroupInList,
} from '../workout/supersets';
import { colors } from '../theme';
import { ActionSheet, IconButton } from './ui';

interface Props {
  visible: boolean;
  routineToEdit?: Routine | null;
  existingFolders?: string[];
  onClose: () => void;
  onSaved: () => void;
}

interface RoutineDraftExercise {
  id: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
  restTimerSeconds: number;
  supersetId?: string;
}

const PRESET_FOLDERS = [
  'Push Pull Legs',
  'Upper / Lower',
  'Full Body',
  'Arnold Split',
  'Chest & Triceps',
  'Back & Biceps',
  'Legs & Core',
];

interface RepPresetOption {
  label: string;
  description: string;
}

const REP_PRESET_OPTIONS: RepPresetOption[] = [
  { label: '5', description: 'Heavy Strength (e.g. 5x5)' },
  { label: '6-8', description: 'Strength & Hypertrophy' },
  { label: '8-10', description: 'Hypertrophy / Mass' },
  { label: '8-12', description: 'Standard Hypertrophy' },
  { label: '10-12', description: 'High Volume Hypertrophy' },
  { label: '12-15', description: 'Endurance & Muscle Pump' },
  { label: '15-20', description: 'High Rep Conditioning' },
  { label: 'AMRAP', description: 'As Many Reps As Possible' },
];

export const RoutineEditorModal: React.FC<Props> = ({
  visible,
  routineToEdit,
  existingFolders = [],
  onClose,
  onSaved,
}) => {
  const { notify } = useDialog();
  const [name, setName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [notes, setNotes] = useState('');
  const [draftExercises, setDraftExercises] = useState<RoutineDraftExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');
  const [restWheelIndex, setRestWheelIndex] = useState<number | null>(null);
  const [repDropdownIndex, setRepDropdownIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);

  useEffect(() => {
    if (routineToEdit) {
      setName(routineToEdit.name);
      setFolderName(routineToEdit.folderName || '');
      setNotes(routineToEdit.notes || '');
      setDraftExercises(
        routineToEdit.exercises.map((e, idx) => ({
          id: e.id || `rde-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          exercise: e.exercise,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          restTimerSeconds: e.restTimerSeconds,
          supersetId: e.supersetId,
        }))
      );
    } else {
      setName('');
      setFolderName('');
      setNotes('');
      setDraftExercises([]);
    }
  }, [routineToEdit, visible]);

  const [supersetModalExerciseId, setSupersetModalExerciseId] = useState<string | null>(null);

  const supersetMetaMap = useMemo(
    () => getSupersetMetadata(draftExercises),
    [draftExercises]
  );

  const supersetModalExercises = useMemo(() => {
    return draftExercises.map((e) => ({
      id: e.id,
      name: e.exercise.name,
      category: e.exercise.category,
      equipment: e.exercise.equipment,
      supersetId: e.supersetId,
      targetSets: e.targetSets,
    }));
  }, [draftExercises]);

  const handleSaveSupersetGroup = (selectedIds: string[]) => {
    const fallbackId = `ss-routine-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDraftExercises((prev) => setSupersetGroupInList(prev, selectedIds, fallbackId));
  };

  const handleUngroupSupersetById = (exerciseId: string) => {
    const targetIdx = draftExercises.findIndex((e) => e.id === exerciseId);
    if (targetIdx !== -1) {
      setDraftExercises((prev) => unlinkExerciseFromGroup(prev, targetIdx));
    }
  };

  const handleLinkSuperset = (index: number) => {
    if (index >= draftExercises.length - 1) return;
    const fallbackId = `ss-routine-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDraftExercises(prev => linkExercisesInGroup(prev, index, index + 1, fallbackId));
  };

  const handleUnlinkSuperset = (index: number) => {
    setDraftExercises(prev => unlinkExerciseFromGroup(prev, index));
  };

  const handleAddExercise = (exercise: Exercise) => {
    setDraftExercises(prev => [
      ...prev,
      {
        id: `rde-${Date.now()}-${prev.length}-${Math.random().toString(36).slice(2, 7)}`,
        exercise,
        targetSets: 3,
        targetReps: '8-12',
        restTimerSeconds: 0,
      },
    ]);
  };

  const handleStartReplace = (index: number) => {
    setReplacingIndex(index);
    setShowPicker(true);
  };

  const handleExerciseSelected = (exercise: Exercise) => {
    if (replacingIndex !== null) {
      setDraftExercises(prev =>
        prev.map((item, idx) => (idx === replacingIndex ? { ...item, exercise } : item))
      );
      setReplacingIndex(null);
    } else {
      handleAddExercise(exercise);
    }
  };

  const handleAddMultipleExercises = (exercises: Exercise[]) => {
    if (replacingIndex !== null && exercises.length > 0) {
      setDraftExercises(prev =>
        prev.map((item, idx) => (idx === replacingIndex ? { ...item, exercise: exercises[0] } : item))
      );
      setReplacingIndex(null);
    } else {
      const newItems: RoutineDraftExercise[] = exercises.map((ex, i) => ({
        id: `rde-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        exercise: ex,
        targetSets: 3,
        targetReps: '8-12',
        restTimerSeconds: 0,
      }));
      setDraftExercises(prev => [...prev, ...newItems]);
    }
  };

  const handleDuplicateExercise = (index: number) => {
    setDraftExercises(prev => {
      const item = prev[index];
      if (!item) return prev;
      const duplicate: RoutineDraftExercise = {
        id: `rde-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        exercise: item.exercise,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        restTimerSeconds: item.restTimerSeconds,
        supersetId: undefined,
      };
      const next = [...prev];
      next.splice(index + 1, 0, duplicate);
      return next;
    });
  };

  const handleSaveRestWheel = (seconds: number, applyToAll?: boolean) => {
    if (applyToAll) {
      setDraftExercises(prev => prev.map(item => ({ ...item, restTimerSeconds: seconds })));
    } else if (restWheelIndex !== null) {
      setDraftExercises(prev =>
        prev.map((item, idx) => (idx === restWheelIndex ? { ...item, restTimerSeconds: seconds } : item))
      );
    }
  };

  const handleRemoveExercise = (index: number) => {
    setDraftExercises(prev => {
      const target = prev[index];
      const oldId = target?.supersetId;
      const updated = prev.filter((_, idx) => idx !== index);
      if (oldId) {
        const remaining = updated.filter(item => item.supersetId === oldId);
        if (remaining.length < 2) {
          return updated.map(item =>
            item.supersetId === oldId ? { ...item, supersetId: undefined } : item
          );
        }
      }
      return updated;
    });
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setDraftExercises(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= draftExercises.length - 1) return;
    setDraftExercises(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  };

  const handleSetTargetSets = (index: number, sets: number) => {
    setDraftExercises(prev =>
      prev.map((item, idx) => (idx === index ? { ...item, targetSets: sets } : item))
    );
  };

  const handleUpdateSets = (index: number, delta: number) => {
    setDraftExercises(prev =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = Math.max(1, Math.min(20, item.targetSets + delta));
        return { ...item, targetSets: updated };
      })
    );
  };

  const handleUpdateReps = (index: number, reps: string) => {
    setDraftExercises(prev =>
      prev.map((item, idx) => (idx === index ? { ...item, targetReps: reps } : item))
    );
  };


  const handleSelectFolder = (f: string) => {
    if (folderName.toLowerCase() === f.toLowerCase()) {
      setFolderName('');
    } else {
      setFolderName(f);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      notify({ title: 'Error', message: 'Please enter a routine name.' });
      return;
    }
    if (draftExercises.length === 0) {
      notify({ title: 'Error', message: 'Please add at least one exercise.' });
      return;
    }

    for (const e of draftExercises) {
      const repVal = validateTargetReps(e.targetReps);
      if (!repVal.isValid) {
        notify({
          title: 'Invalid Target Reps',
          message: `"${e.exercise.name}": ${repVal.error}. Example valid formats: 10, 8-12, 12, 10, 8, or AMRAP`,
        });
        return;
      }
    }

    await saveRoutine(
      name.trim(),
      folderName.trim(),
      draftExercises.map(e => ({
        exerciseId: e.exercise.id,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        restTimerSeconds: e.restTimerSeconds,
        supersetId: e.supersetId,
      })),
      notes.trim(),
      routineToEdit?.id
    );

    onSaved();
    onClose();
  };

  // Combine unique folders
  const allFolderSuggestions = Array.from(
    new Set([...existingFolders.filter(Boolean), ...PRESET_FOLDERS])
  );

  // Live Summary
  const totalSets = draftExercises.reduce((sum, e) => sum + (e.targetSets || 0), 0);
  const estimatedMins = Math.round(totalSets * 2.2);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {routineToEdit ? 'Edit Routine' : 'Create Routine'}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn}>
            <Text style={styles.saveHeaderBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Routine Name & Folder */}
          <View style={styles.inputCard}>
            <Text style={styles.fieldLabel}>ROUTINE NAME *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Chest & Triceps Blast"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>FOLDER / CATEGORY</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Select preset below or type custom folder..."
              placeholderTextColor={colors.textMuted}
              value={folderName}
              onChangeText={setFolderName}
            />

            {/* Folder Preset Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.folderPresetScroll}
              style={{ marginTop: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {allFolderSuggestions.map(f => {
                const isSelected = folderName.toLowerCase() === f.toLowerCase();
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.folderPresetChip, isSelected && styles.folderPresetChipActive]}
                    onPress={() => handleSelectFolder(f)}
                  >
                    <Folder
                      size={11}
                      color={isSelected ? colors.text : colors.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[styles.folderPresetText, isSelected && styles.folderPresetTextActive]}
                    >
                      {f}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={[styles.textInput, { height: 64, textAlignVertical: 'top' }]}
              placeholder="e.g. Warm up rotator cuffs. Focus on mind-muscle connection."
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          {/* Routine Overview Summary Banner */}
          {draftExercises.length > 0 && (
            <View style={styles.summaryBar}>
              <View style={styles.summaryBadge}>
                <Layers size={14} color={colors.textMuted} />
                <Text style={styles.summaryBadgeText}>{draftExercises.length} Exercises</Text>
              </View>
              <Text style={styles.summaryDot}>·</Text>
              <View style={styles.summaryBadge}>
                <Dumbbell size={14} color={colors.textMuted} />
                <Text style={styles.summaryBadgeText}>{totalSets} Total Sets</Text>
              </View>
              <Text style={styles.summaryDot}>·</Text>
              <View style={styles.summaryBadge}>
                <Clock size={14} color={colors.textMuted} />
                <Text style={styles.summaryBadgeText}>~{estimatedMins} min</Text>
              </View>
            </View>
          )}

          {/* Exercises Section Header */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionTitle}>Exercises ({draftExercises.length})</Text>
              {draftExercises.length > 1 && (
                <View style={styles.viewToggleGroup}>
                  <TouchableOpacity
                    style={[styles.viewToggleBtn, viewMode === 'detailed' && styles.viewToggleBtnActive]}
                    onPress={() => setViewMode('detailed')}
                  >
                    <Text style={[styles.viewToggleText, viewMode === 'detailed' && styles.viewToggleTextActive]}>
                      Detailed
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.viewToggleBtn, viewMode === 'compact' && styles.viewToggleBtnActive]}
                    onPress={() => setViewMode('compact')}
                  >
                    <Text style={[styles.viewToggleText, viewMode === 'compact' && styles.viewToggleTextActive]}>
                      Compact
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.addExBtn}
              onPress={() => {
                setReplacingIndex(null);
                setShowPicker(true);
              }}
            >
              <Plus size={16} color={colors.primary} />
              <Text style={styles.addExBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Compact View Mode */}
          {viewMode === 'compact' && draftExercises.length > 0 && (
            <View style={styles.compactList}>
              {draftExercises.map((item, idx) => {
                const ssMeta = supersetMetaMap.get(item.id);
                return (
                  <React.Fragment key={item.id}>
                    {ssMeta?.isFirst && (
                      <View style={[styles.supersetGroupHeader, { borderLeftColor: ssMeta.color }]}>
                        <TouchableOpacity
                          style={[
                            styles.supersetPill,
                            { backgroundColor: ssMeta.color + '25', borderColor: ssMeta.color },
                          ]}
                          onPress={() => setSupersetModalExerciseId(item.id)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${ssMeta.label}`}
                        >
                          <Layers size={13} color={ssMeta.color} />
                          <Text style={[styles.supersetPillText, { color: ssMeta.color }]}>
                            {ssMeta.label}
                          </Text>
                        </TouchableOpacity>
                        <Text style={styles.supersetCountText}>
                          {ssMeta.totalInGroup} Exercises · Alternating Sets
                        </Text>
                      </View>
                    )}

                    <View
                      style={[
                        styles.compactRow,
                        ssMeta && { borderLeftColor: ssMeta.color, borderLeftWidth: 3.5 },
                      ]}
                    >
                      <View style={styles.compactOrderBadge}>
                        <Text style={styles.compactOrderText}>#{idx + 1}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.compactInfo}
                        onPress={() => handleStartReplace(idx)}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.compactName} numberOfLines={1}>
                            {item.exercise.name}
                          </Text>
                          {ssMeta && (
                            <View style={[styles.ssPositionBadge, { borderColor: ssMeta.color }]}>
                              <Text style={[styles.ssPositionText, { color: ssMeta.color }]}>
                                {ssMeta.positionInGroup}/{ssMeta.totalInGroup}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.compactMetaRow}>
                          <Text style={styles.compactMeta}>
                            {item.targetSets} sets × {item.targetReps} •
                          </Text>
                          {item.exercise.secondaryMuscles && item.exercise.secondaryMuscles.length > 0 && (
                            <Text style={styles.compactSecondaryMeta} numberOfLines={1}>
                              +{item.exercise.secondaryMuscles.length} secondary
                            </Text>
                          )}
                          <TouchableOpacity
                            style={styles.compactRestBadge}
                            onPress={() => setRestWheelIndex(idx)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Timer size={11} color={colors.success} />
                            <Text style={styles.compactRestText}>
                              {item.restTimerSeconds > 0
                                ? `${Math.floor(item.restTimerSeconds / 60)}m ${item.restTimerSeconds % 60}s`
                                : 'Off'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.compactActions}>
                        <TouchableOpacity
                          style={styles.compactActionBtn}
                          onPress={() => setSupersetModalExerciseId(item.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          accessibilityLabel={ssMeta ? `Edit ${ssMeta.label}` : 'Create superset'}
                        >
                          <Layers size={14} color={ssMeta ? ssMeta.color : colors.purple} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.compactActionBtn}
                          onPress={() => handleStartReplace(idx)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <ArrowRightLeft size={14} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.compactActionBtn}
                          onPress={() => handleDuplicateExercise(idx)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Copy size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.compactActionBtn, idx === 0 && styles.iconActionDisabled]}
                          disabled={idx === 0}
                          onPress={() => handleMoveUp(idx)}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        >
                          <ChevronUp size={16} color={idx === 0 ? colors.control : colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.compactActionBtn,
                            idx === draftExercises.length - 1 && styles.iconActionDisabled,
                          ]}
                          disabled={idx === draftExercises.length - 1}
                          onPress={() => handleMoveDown(idx)}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        >
                          <ChevronDown
                            size={16}
                            color={idx === draftExercises.length - 1 ? colors.control : colors.textSecondary}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.compactDeleteBtn}
                          onPress={() => handleRemoveExercise(idx)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Trash2 size={14} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {ssMeta && !ssMeta.isLast && (
                      <View style={styles.supersetConnectorWrap}>
                        <View style={[styles.supersetConnectorLine, { backgroundColor: ssMeta.color }]} />
                        <Text style={[styles.supersetConnectorText, { color: ssMeta.color }]}>
                          NEXT IN {ssMeta.label}
                        </Text>
                        <View style={[styles.supersetConnectorLine, { backgroundColor: ssMeta.color }]} />
                      </View>
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* Detailed View Mode */}
          {viewMode === 'detailed' &&
            draftExercises.map((item, idx) => {
              const ssMeta = supersetMetaMap.get(item.id);
              const rowViewModel = getExerciseRowViewModel(item.exercise);
              return (
                <React.Fragment key={item.id}>
                  {ssMeta?.isFirst && (
                    <View style={[styles.supersetGroupHeader, { borderLeftColor: ssMeta.color }]}>
                      <TouchableOpacity
                        style={[
                          styles.supersetPill,
                          { backgroundColor: ssMeta.color + '25', borderColor: ssMeta.color },
                        ]}
                        onPress={() => setSupersetModalExerciseId(item.id)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${ssMeta.label}`}
                      >
                        <Layers size={13} color={ssMeta.color} />
                        <Text style={[styles.supersetPillText, { color: ssMeta.color }]}>
                          {ssMeta.label}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.supersetCountText}>
                        {ssMeta.totalInGroup} Exercises · Alternating Sets
                      </Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.exerciseCard,
                      ssMeta && { borderLeftColor: ssMeta.color, borderLeftWidth: 3.5 },
                    ]}
                  >
                    {/* Exercise Card Header */}
                    <View style={styles.cardTopRow}>
                      <TouchableOpacity
                        style={styles.cardHeaderInfo}
                        onPress={() => handleStartReplace(idx)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Swap ${item.exercise.name}`}
                      >
                        <ExerciseVisual
                          exercise={item.exercise}
                          size="compact"
                          accessibilityLabel={rowViewModel.visualAccessibilityLabel}
                        />
                        <View style={styles.cardHeaderText}>
                          <Text style={styles.cardExName} numberOfLines={2}>
                            {item.exercise.name}
                          </Text>
                          <View style={styles.cardMetaRow}>
                            <Text style={styles.orderBadgeText}>#{idx + 1}</Text>
                            {ssMeta && (
                              <View style={[styles.ssPositionBadge, { borderColor: ssMeta.color }]}>
                                <Text style={[styles.ssPositionText, { color: ssMeta.color }]}>
                                  {ssMeta.positionInGroup}/{ssMeta.totalInGroup}
                                </Text>
                              </View>
                            )}
                            <Text style={styles.cardExMeta} numberOfLines={1}>
                              {[item.exercise.primaryMuscles.join(', '), item.exercise.equipment]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>

                      <IconButton
                        icon={MoreHorizontal}
                        tone="ghost"
                        size={34}
                        onPress={() => setMenuIndex(idx)}
                        accessibilityLabel={`${item.exercise.name} options`}
                      />
                    </View>

                    {/* Sets + Reps */}
                    {(() => {
                      const repVal = validateTargetReps(item.targetReps);
                      const isRepInvalid = !repVal.isValid && item.targetReps.trim().length > 0;
                      return (
                        <>
                          <View style={styles.configGrid}>
                            <View style={styles.configCell}>
                              <Text style={styles.configLabel}>Sets</Text>
                              <View style={styles.cleanStepperContainer}>
                                <TouchableOpacity
                                  style={[styles.cleanStepBtn, item.targetSets <= 1 && styles.cleanStepBtnDisabled]}
                                  onPress={() => handleUpdateSets(idx, -1)}
                                  disabled={item.targetSets <= 1}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  accessibilityRole="button"
                                  accessibilityLabel="Remove a set"
                                >
                                  <Minus size={15} color={item.targetSets > 1 ? colors.text : colors.textFaint} />
                                </TouchableOpacity>
                                <TextInput
                                  style={styles.cleanStepInput}
                                  keyboardType="number-pad"
                                  value={String(item.targetSets)}
                                  onChangeText={text => {
                                    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
                                    if (!isNaN(num) && num > 0 && num <= 50) {
                                      handleSetTargetSets(idx, num);
                                    } else if (text === '') {
                                      handleSetTargetSets(idx, 1);
                                    }
                                  }}
                                  selectTextOnFocus={true}
                                  maxLength={2}
                                  accessibilityLabel="Target sets"
                                />
                                <TouchableOpacity
                                  style={styles.cleanStepBtn}
                                  onPress={() => handleUpdateSets(idx, 1)}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  accessibilityRole="button"
                                  accessibilityLabel="Add a set"
                                >
                                  <Plus size={15} color={colors.text} />
                                </TouchableOpacity>
                              </View>
                            </View>

                            <View style={styles.configCell}>
                              <Text style={styles.configLabel}>Reps</Text>
                              <View
                                style={[
                                  styles.customRepInputWrapper,
                                  isRepInvalid && styles.customRepInputWrapperError,
                                ]}
                              >
                                <TextInput
                                  style={styles.primaryRepInput}
                                  placeholder="8-12"
                                  placeholderTextColor={colors.textMuted}
                                  value={item.targetReps}
                                  onChangeText={txt => handleUpdateReps(idx, txt)}
                                  selectTextOnFocus={true}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                  accessibilityLabel="Target reps"
                                />
                                <TouchableOpacity
                                  style={styles.presetDropdownBtn}
                                  onPress={() => setRepDropdownIndex(idx)}
                                  activeOpacity={0.7}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  accessibilityRole="button"
                                  accessibilityLabel="Rep presets"
                                >
                                  <Sparkles size={15} color={colors.primaryLight} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                          {isRepInvalid ? (
                            <Text style={styles.repErrorText}>{repVal.error}</Text>
                          ) : null}
                        </>
                      );
                    })()}

                    {/* Rest timer + superset pills */}
                    <View style={styles.pillRow}>
                      <TouchableOpacity
                        style={styles.restWheelTriggerBtn}
                        onPress={() => setRestWheelIndex(idx)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Change rest timer"
                      >
                        <Timer size={13} color={colors.primaryLight} />
                        <Text style={styles.restWheelTriggerText}>
                          {item.restTimerSeconds > 0
                            ? `Rest ${Math.floor(item.restTimerSeconds / 60)}:${String(item.restTimerSeconds % 60).padStart(2, '0')}`
                            : 'Rest off'}
                        </Text>
                      </TouchableOpacity>

                      {ssMeta ? (
                        <>
                          <TouchableOpacity
                            style={[styles.ssActiveBadge, { backgroundColor: ssMeta.color + '1A' }]}
                            onPress={() => setSupersetModalExerciseId(item.id)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${ssMeta.label}`}
                          >
                            <Layers size={13} color={ssMeta.color} />
                            <Text style={[styles.ssActiveBadgeText, { color: ssMeta.color }]}>
                              {ssMeta.label}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.ssUnlinkBtn}
                            onPress={() => handleUnlinkSuperset(idx)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityRole="button"
                          >
                            <Text style={styles.ssUnlinkBtnText}>Ungroup</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          style={styles.ssLinkBtn}
                          onPress={() => setSupersetModalExerciseId(item.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityRole="button"
                        >
                          <Layers size={13} color={colors.textSecondary} />
                          <Text style={styles.ssLinkBtnText}>Superset</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {ssMeta && !ssMeta.isLast && (
                    <View style={styles.supersetConnectorWrap}>
                      <View style={[styles.supersetConnectorLine, { backgroundColor: ssMeta.color }]} />
                      <Text style={[styles.supersetConnectorText, { color: ssMeta.color }]}>
                        NEXT IN {ssMeta.label}
                      </Text>
                      <View style={[styles.supersetConnectorLine, { backgroundColor: ssMeta.color }]} />
                    </View>
                  )}
                </React.Fragment>
              );
            })}

          {draftExercises.length === 0 && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Dumbbell size={28} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No exercises in routine</Text>
              <Text style={styles.emptySubtitle}>
                Add barbell, dumbbell, or machine exercises to configure sets, rep targets, and rest timers.
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => {
                  setReplacingIndex(null);
                  setShowPicker(true);
                }}
              >
                <Plus size={18} color={colors.text} />
                <Text style={styles.emptyAddBtnText}>Add Exercises</Text>
              </TouchableOpacity>
            </View>
          )}

          {draftExercises.length > 0 && (
            <TouchableOpacity
              style={styles.bottomAddBtn}
              onPress={() => {
                setReplacingIndex(null);
                setShowPicker(true);
              }}
            >
              <Plus size={18} color={colors.primary} />
              <Text style={styles.bottomAddBtnText}>Add Exercises</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <ExercisePickerModal
          visible={showPicker}
          title={
            replacingIndex !== null
              ? `Replace "${draftExercises[replacingIndex]?.exercise.name}"`
              : 'Add Exercises'
          }
          multiSelect={replacingIndex === null}
          onClose={() => {
            setShowPicker(false);
            setReplacingIndex(null);
          }}
          onSelectExercise={handleExerciseSelected}
          onSelectMultiple={handleAddMultipleExercises}
        />

        <ActionSheet
          visible={menuIndex !== null && draftExercises[menuIndex] !== undefined}
          title={menuIndex !== null ? draftExercises[menuIndex]?.exercise.name : undefined}
          onClose={() => setMenuIndex(null)}
          actions={
            menuIndex === null
              ? []
              : [
                  { key: 'swap', label: 'Swap Exercise', icon: ArrowRightLeft, onPress: () => handleStartReplace(menuIndex) },
                  { key: 'duplicate', label: 'Duplicate', icon: Copy, onPress: () => handleDuplicateExercise(menuIndex) },
                  ...(menuIndex > 0
                    ? [{ key: 'up', label: 'Move Up', icon: ChevronUp, onPress: () => handleMoveUp(menuIndex) }]
                    : []),
                  ...(menuIndex < draftExercises.length - 1
                    ? [{ key: 'down', label: 'Move Down', icon: ChevronDown, onPress: () => handleMoveDown(menuIndex) }]
                    : []),
                  {
                    key: 'remove',
                    label: 'Remove from Routine',
                    icon: Trash2,
                    destructive: true,
                    onPress: () => handleRemoveExercise(menuIndex),
                  },
                ]
          }
        />

        {/* Rest Time Wheel Modal */}
        <RestTimeWheelModal
          visible={restWheelIndex !== null}
          initialSeconds={
            restWheelIndex !== null ? draftExercises[restWheelIndex]?.restTimerSeconds : 0
          }
          exerciseName={
            restWheelIndex !== null ? draftExercises[restWheelIndex]?.exercise.name : undefined
          }
          showApplyToAll={draftExercises.length > 1}
          onClose={() => setRestWheelIndex(null)}
          onSave={handleSaveRestWheel}
        />

        {/* Rep Target Presets Dropdown Modal */}
        <Modal
          visible={repDropdownIndex !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setRepDropdownIndex(null)}
        >
          <TouchableOpacity
            style={styles.dropdownModalOverlay}
            activeOpacity={1}
            onPress={() => setRepDropdownIndex(null)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.dropdownModalCard}
              onPress={e => e.stopPropagation?.()}
            >
              <View style={styles.dropdownHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownTitle}>Rep Target Presets</Text>
                  {repDropdownIndex !== null && draftExercises[repDropdownIndex] && (
                    <Text style={styles.dropdownSubtitle} numberOfLines={1}>
                      {draftExercises[repDropdownIndex].exercise.name}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.dropdownCloseBtn}
                  onPress={() => setRepDropdownIndex(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.dropdownList} bounces={false}>
                {REP_PRESET_OPTIONS.map(preset => {
                  const isSelected =
                    repDropdownIndex !== null &&
                    draftExercises[repDropdownIndex]?.targetReps === preset.label;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.dropdownOptionRow, isSelected && styles.dropdownOptionRowActive]}
                      onPress={() => {
                        if (repDropdownIndex !== null) {
                          handleUpdateReps(repDropdownIndex, preset.label);
                          setRepDropdownIndex(null);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.dropdownPill, isSelected && styles.dropdownPillActive]}>
                        <Text style={[styles.dropdownPillText, isSelected && styles.dropdownPillTextActive]}>
                          {preset.label}
                        </Text>
                      </View>
                      <Text style={[styles.dropdownDesc, isSelected && styles.dropdownDescActive]}>
                        {preset.description}
                      </Text>
                      {isSelected ? (
                        <Check size={18} color={colors.success} />
                      ) : (
                        <View style={{ width: 18 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.dropdownFooter}>
                <Text style={styles.dropdownFooterText}>
                  Tip: You can also type any custom target (e.g. "12, 10, 8" or "To failure") directly into the exercise card.
                </Text>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Superset Manager Modal */}
        <SupersetModal
          visible={supersetModalExerciseId !== null}
          currentExerciseId={supersetModalExerciseId}
          exercises={supersetModalExercises}
          onClose={() => setSupersetModalExerciseId(null)}
          onSaveSuperset={handleSaveSupersetGroup}
          onUngroupSuperset={handleUngroupSupersetById}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  saveHeaderBtn: {
    backgroundColor: colors.success,
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  saveHeaderBtnText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  folderPresetScroll: {
    gap: 6,
    paddingVertical: 4,
  },
  folderPresetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.border,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.control,
  },
  folderPresetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  folderPresetText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  folderPresetTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 10,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryDot: {
    color: colors.textFaint,
    fontSize: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  viewToggleBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.border,
  },
  viewToggleText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  viewToggleTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  compactList: {
    marginBottom: 12,
    gap: 8,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  compactOrderBadge: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactOrderText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  compactInfo: {
    flex: 1,
  },
  compactName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  compactMeta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  compactSecondaryMeta: {
    color: colors.textMuted,
    fontSize: 11,
    flexShrink: 1,
  },
  compactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  compactActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  addExBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  orderBadgeText: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
  },
  cardHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardExName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardExMeta: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  iconActionDisabled: {
    opacity: 0.3,
  },
  configLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
  },
  cleanStepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceHigh,
    borderRadius: 12,
    padding: 3,
    height: 42,
  },
  cleanStepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.control,
    borderRadius: 10,
  },
  cleanStepBtnDisabled: {
    opacity: 0.35,
  },
  cleanStepInput: {
    flex: 1,
    minWidth: 0,
    width: 0,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    padding: 0,
  },
  customRepInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingLeft: 12,
    paddingRight: 3,
    height: 42,
  },
  customRepInputWrapperError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  repErrorText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '500',
    marginTop: -4,
    marginBottom: 6,
    marginLeft: 93,
  },
  primaryRepInput: {
    flex: 1,
    minWidth: 0,
    width: 0,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 0,
  },
  presetDropdownBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
  },
  restWheelTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  restWheelTriggerText: {
    color: colors.primaryLight,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  compactRestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.successSoft,
    gap: 4,
  },
  compactRestText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdownModalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  dropdownSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dropdownCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownList: {
    maxHeight: 340,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginVertical: 3,
    backgroundColor: 'transparent',
  },
  dropdownOptionRowActive: {
    backgroundColor: colors.surfaceAlt,
  },
  dropdownPill: {
    minWidth: 56,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dropdownPillActive: {
    backgroundColor: colors.primary,
  },
  dropdownPillText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownPillTextActive: {
    color: colors.text,
  },
  dropdownDesc: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  dropdownDescActive: {
    color: colors.text,
    fontWeight: '600',
  },
  dropdownFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surfaceSunken,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dropdownFooterText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  emptyAddBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  bottomAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    marginTop: 8,
  },
  bottomAddBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Supersets in Routine Editor
  supersetGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    marginBottom: 8,
    marginTop: 4,
  },
  supersetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  supersetPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  supersetCountText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  supersetConnectorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 4,
  },
  supersetConnectorLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
    opacity: 0.6,
  },
  supersetConnectorText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  ssPositionBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  ssPositionText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ssActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  ssActiveBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ssUnlinkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  ssUnlinkBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  ssLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  ssLinkBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  configGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  configCell: {
    flex: 1,
    gap: 6,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
});
