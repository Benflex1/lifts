import React, { useState, useEffect } from 'react';
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
} from 'lucide-react-native';
import { Exercise, Routine } from '../types';
import { ExercisePickerModal } from './ExercisePickerModal';
import { RestTimeWheelModal } from './RestTimeWheelModal';
import { saveRoutine } from '../database/db';
import { validateTargetReps } from '../workout/sets';

interface Props {
  visible: boolean;
  routineToEdit?: Routine | null;
  existingFolders?: string[];
  onClose: () => void;
  onSaved: () => void;
}

interface RoutineDraftExercise {
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
  restTimerSeconds: number;
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

  useEffect(() => {
    if (routineToEdit) {
      setName(routineToEdit.name);
      setFolderName(routineToEdit.folderName || '');
      setNotes(routineToEdit.notes || '');
      setDraftExercises(
        routineToEdit.exercises.map(e => ({
          exercise: e.exercise,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          restTimerSeconds: e.restTimerSeconds,
        }))
      );
    } else {
      setName('');
      setFolderName('');
      setNotes('');
      setDraftExercises([]);
    }
  }, [routineToEdit, visible]);

  const handleAddExercise = (exercise: Exercise) => {
    setDraftExercises(prev => [
      ...prev,
      {
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
      const newItems: RoutineDraftExercise[] = exercises.map(ex => ({
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
        exercise: item.exercise,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        restTimerSeconds: item.restTimerSeconds,
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
    setDraftExercises(prev => prev.filter((_, idx) => idx !== index));
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
            <X size={24} color="#9CA3AF" />
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
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>FOLDER / CATEGORY</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Select preset below or type custom folder..."
              placeholderTextColor="#6B7280"
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
                      color={isSelected ? '#FFFFFF' : '#9CA3AF'}
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
              placeholderTextColor="#6B7280"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          {/* Routine Overview Summary Banner */}
          {draftExercises.length > 0 && (
            <View style={styles.summaryBar}>
              <View style={styles.summaryBadge}>
                <Layers size={14} color="#3B82F6" />
                <Text style={styles.summaryBadgeText}>{draftExercises.length} Exercises</Text>
              </View>
              <Text style={styles.summaryDot}>•</Text>
              <View style={styles.summaryBadge}>
                <Dumbbell size={14} color="#10B981" />
                <Text style={styles.summaryBadgeText}>{totalSets} Total Sets</Text>
              </View>
              <Text style={styles.summaryDot}>•</Text>
              <View style={styles.summaryBadge}>
                <Clock size={14} color="#F59E0B" />
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
              <Plus size={16} color="#3B82F6" />
              <Text style={styles.addExBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Compact View Mode */}
          {viewMode === 'compact' && draftExercises.length > 0 && (
            <View style={styles.compactList}>
              {draftExercises.map((item, idx) => (
                <View key={`${item.exercise.id}-${idx}`} style={styles.compactRow}>
                  <View style={styles.compactOrderBadge}>
                    <Text style={styles.compactOrderText}>#{idx + 1}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.compactInfo}
                    onPress={() => handleStartReplace(idx)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.compactName} numberOfLines={1}>
                      {item.exercise.name}
                    </Text>
                    <View style={styles.compactMetaRow}>
                      <Text style={styles.compactMeta}>
                        {item.targetSets} sets × {item.targetReps} •
                      </Text>
                      <TouchableOpacity
                        style={styles.compactRestBadge}
                        onPress={() => setRestWheelIndex(idx)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Timer size={11} color="#10B981" />
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
                      onPress={() => handleStartReplace(idx)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <ArrowRightLeft size={14} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.compactActionBtn}
                      onPress={() => handleDuplicateExercise(idx)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Copy size={14} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.compactActionBtn, idx === 0 && styles.iconActionDisabled]}
                      disabled={idx === 0}
                      onPress={() => handleMoveUp(idx)}
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    >
                      <ChevronUp size={16} color={idx === 0 ? '#374151' : '#9CA3AF'} />
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
                        color={idx === draftExercises.length - 1 ? '#374151' : '#9CA3AF'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.compactDeleteBtn}
                      onPress={() => handleRemoveExercise(idx)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Trash2 size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Detailed View Mode */}
          {viewMode === 'detailed' &&
            draftExercises.map((item, idx) => (
              <View key={`${item.exercise.id}-${idx}`} style={styles.exerciseCard}>
                {/* Exercise Card Header */}
                <View style={styles.cardTopRow}>
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>#{idx + 1}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.cardHeaderInfo}
                    onPress={() => handleStartReplace(idx)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cardExName}>{item.exercise.name}</Text>
                    <Text style={styles.cardExMeta}>
                      {item.exercise.primaryMuscles.join(', ')} • {item.exercise.equipment}
                    </Text>
                  </TouchableOpacity>

                  {/* Action Buttons: Swap, Duplicate, Up, Down, Trash */}
                  <View style={styles.reorderActions}>
                    <TouchableOpacity
                      style={styles.actionPillBtn}
                      onPress={() => handleStartReplace(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <ArrowRightLeft size={13} color="#3B82F6" />
                      <Text style={styles.actionPillText}>Swap</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => handleDuplicateExercise(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Copy size={15} color="#9CA3AF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.iconActionBtn, idx === 0 && styles.iconActionDisabled]}
                      disabled={idx === 0}
                      onPress={() => handleMoveUp(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <ChevronUp size={18} color={idx === 0 ? '#374151' : '#9CA3AF'} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.iconActionBtn,
                        idx === draftExercises.length - 1 && styles.iconActionDisabled,
                      ]}
                      disabled={idx === draftExercises.length - 1}
                      onPress={() => handleMoveDown(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <ChevronDown
                        size={18}
                        color={idx === draftExercises.length - 1 ? '#374151' : '#9CA3AF'}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteActionBtn}
                      onPress={() => handleRemoveExercise(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Target Sets Row: Clean Stepper without Presets */}
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>TARGET SETS</Text>
                  <View style={styles.stepperRowContainer}>
                    <View style={styles.cleanStepperContainer}>
                      <TouchableOpacity
                        style={[styles.cleanStepBtn, item.targetSets <= 1 && styles.cleanStepBtnDisabled]}
                        onPress={() => handleUpdateSets(idx, -1)}
                        disabled={item.targetSets <= 1}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Minus size={15} color={item.targetSets > 1 ? '#FFFFFF' : '#4B5563'} />
                      </TouchableOpacity>

                      <View style={styles.cleanStepValueWrap}>
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
                        />
                        <Text style={styles.cleanStepUnit}>sets</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.cleanStepBtn}
                        onPress={() => handleUpdateSets(idx, 1)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Plus size={15} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Target Reps Row: Custom Main Input with Presets Dropdown */}
                {(() => {
                  const repVal = validateTargetReps(item.targetReps);
                  const isRepInvalid = !repVal.isValid && item.targetReps.trim().length > 0;
                  return (
                    <>
                      <View style={styles.configRow}>
                        <Text style={styles.configLabel}>TARGET REPS</Text>
                        <View style={styles.repsRowContainer}>
                          <View
                            style={[
                              styles.customRepInputWrapper,
                              isRepInvalid && styles.customRepInputWrapperError,
                            ]}
                          >
                            <TextInput
                              style={styles.primaryRepInput}
                              placeholder="e.g. 8-12"
                              placeholderTextColor="#6B7280"
                              value={item.targetReps}
                              onChangeText={txt => handleUpdateReps(idx, txt)}
                              selectTextOnFocus={true}
                              autoCapitalize="none"
                              autoCorrect={false}
                            />
                            <Text style={styles.repInputSuffix}>reps</Text>
                          </View>

                          <TouchableOpacity
                            style={styles.presetDropdownBtn}
                            onPress={() => setRepDropdownIndex(idx)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Sparkles size={13} color="#60A5FA" />
                            <Text style={styles.presetDropdownBtnText}>Presets</Text>
                            <ChevronDown size={13} color="#9CA3AF" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {isRepInvalid ? (
                        <Text style={styles.repErrorText}>{repVal.error}</Text>
                      ) : null}
                    </>
                  );
                })()}

                {/* Rest Timer Row with Precision Wheel Trigger */}
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>REST TIMER</Text>
                  <TouchableOpacity
                    style={styles.restWheelTriggerBtn}
                    onPress={() => setRestWheelIndex(idx)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.restWheelTriggerLeft}>
                      <Timer size={14} color="#10B981" />
                      <Text style={styles.restWheelTriggerText}>
                        {item.restTimerSeconds > 0
                          ? `${Math.floor(item.restTimerSeconds / 60)}m ${String(item.restTimerSeconds % 60).padStart(2, '0')}s`
                          : 'Timer Off'}
                      </Text>
                    </View>
                    <View style={styles.restWheelTriggerRight}>
                      <Text style={styles.restWheelTriggerHint}>Change</Text>
                      <ChevronDown size={13} color="#10B981" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

          {draftExercises.length === 0 && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Dumbbell size={28} color="#3B82F6" />
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
                <Plus size={18} color="#FFFFFF" />
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
              <Plus size={18} color="#3B82F6" />
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
                  <X size={18} color="#9CA3AF" />
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
                        <Check size={18} color="#10B981" />
                      ) : (
                        <View style={{ width: 18 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.dropdownFooter}>
                <Text style={styles.dropdownFooterText}>
                  💡 Tip: You can also type any custom target (e.g. "12, 10, 8" or "To failure") directly into the exercise card.
                </Text>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveHeaderBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  saveHeaderBtnText: {
    color: '#000000',
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
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#262A34',
    borderRadius: 10,
    color: '#FFFFFF',
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
    backgroundColor: '#262A34',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  folderPresetChipActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#3B82F6',
  },
  folderPresetText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  folderPresetTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161922',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#262E3E',
    gap: 10,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryBadgeText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryDot: {
    color: '#4B5563',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#14161D',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 2,
  },
  viewToggleBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: '#262A34',
  },
  viewToggleText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
  },
  viewToggleTextActive: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  compactList: {
    marginBottom: 12,
    gap: 8,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#262A34',
    gap: 10,
  },
  compactOrderBadge: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactOrderText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  compactInfo: {
    flex: 1,
  },
  compactName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  compactMeta: {
    color: '#9CA3AF',
    fontSize: 12,
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
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#2B191D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  addExBtnText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '700',
  },
  exerciseCard: {
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadgeText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardExName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardExMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  reorderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  actionPillText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '700',
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionDisabled: {
    opacity: 0.3,
  },
  deleteActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#2B191D',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#222631',
    gap: 8,
  },
  configLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    width: 85,
  },
  stepperRowContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  cleanStepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262A34',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 2,
  },
  cleanStepBtn: {
    width: 36,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#323745',
    borderRadius: 6,
  },
  cleanStepBtnDisabled: {
    opacity: 0.35,
    backgroundColor: '#222631',
  },
  cleanStepValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 68,
  },
  cleanStepInput: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 24,
    padding: 0,
  },
  cleanStepUnit: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 3,
  },
  repsRowContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customRepInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262A34',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 10,
    height: 38,
  },
  customRepInputWrapperError: {
    borderColor: '#EF4444',
    backgroundColor: '#2D1B22',
  },
  repErrorText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '500',
    marginTop: -4,
    marginBottom: 6,
    marginLeft: 93,
  },
  primaryRepInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
  },
  repInputSuffix: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 3,
  },
  presetDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 9,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F655',
    gap: 5,
  },
  presetDropdownBtnText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
  restWheelTriggerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#132822',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1C4A3F',
    height: 38,
  },
  restWheelTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  restWheelTriggerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  restWheelTriggerText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },
  restWheelTriggerHint: {
    color: '#10B981CC',
    fontSize: 11,
    fontWeight: '600',
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
    backgroundColor: '#132822',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1C4A3F',
    gap: 4,
  },
  compactRestText: {
    color: '#10B981',
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
    backgroundColor: '#181A20',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2D3442',
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  dropdownTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dropdownSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  dropdownCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#262A34',
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
    backgroundColor: '#1E293B',
  },
  dropdownPill: {
    minWidth: 56,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dropdownPillActive: {
    backgroundColor: '#2563EB',
  },
  dropdownPillText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownPillTextActive: {
    color: '#FFFFFF',
  },
  dropdownDesc: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  dropdownDescActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  dropdownFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#13151B',
    borderTopWidth: 1,
    borderTopColor: '#262A34',
  },
  dropdownFooterText: {
    color: '#6B7280',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262A34',
    borderStyle: 'dashed',
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1E2638',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#262E3E',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    marginTop: 8,
  },
  bottomAddBtnText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
});

