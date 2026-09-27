import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Dumbbell,
  Layers,
  MapPin,
  AlertTriangle,
  ArrowRight,
  Search,
  Plus,
  Edit3,
  HelpCircle,
  Sparkles,
} from 'lucide-react-native';
import { Exercise, Gym } from '../types';
import { CsvImportPreview, ExerciseAssignmentItem } from '../utils/importer/types';
import { ExercisePickerModal } from './ExercisePickerModal';
import { colors } from '../theme';

interface CsvImportModalProps {
  visible: boolean;
  preview: CsvImportPreview | null;
  fileName: string;
  gyms: Gym[];
  selectedGymId: string;
  onSelectGymId: (id: string) => void;
  skipDuplicates: boolean;
  onToggleSkipDuplicates: (skip: boolean) => void;
  onConfirmImport: () => Promise<void>;
  onClose: () => void;
  isImporting: boolean;
  onAssignExercise?: (rawName: string, exercise: Exercise) => void;
  onSetCustomExercise?: (rawName: string) => void;
}

type AssignmentFilter = 'needs_review' | 'all' | 'matched';

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  visible,
  preview,
  fileName,
  gyms,
  selectedGymId,
  onSelectGymId,
  skipDuplicates,
  onToggleSkipDuplicates,
  onConfirmImport,
  onClose,
  isImporting,
  onAssignExercise,
  onSetCustomExercise,
}) => {
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('needs_review');
  const [pickerTargetRawName, setPickerTargetRawName] = useState<string | null>(null);

  if (!visible || !preview) return null;

  const currentGym = gyms.find(g => g.id === selectedGymId) || gyms[0];
  const assignments = preview.exerciseAssignments || [];

  const unassignedCustomCount = assignments.filter(a => a.isCustom || !a.isAutoMatched).length;
  const matchedCount = assignments.filter(a => !a.isCustom && a.isAutoMatched).length;

  const displayedAssignments = assignments.filter(item => {
    if (assignmentFilter === 'needs_review') {
      return item.isCustom || !item.isAutoMatched;
    }
    if (assignmentFilter === 'matched') {
      return !item.isCustom && item.isAutoMatched;
    }
    return true;
  });

  return (
    <>
      <Modal
        visible={visible && pickerTargetRawName === null}
        animationType="slide"
        transparent={true}
        onRequestClose={isImporting ? undefined : onClose}
      >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <FileSpreadsheet size={22} color={colors.primary} />
              <Text style={styles.headerTitle}>Import Workouts</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isImporting}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close import modal"
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Source & File Badge */}
            <View style={styles.sourceCard}>
              <View style={styles.sourceInfo}>
                <Text style={styles.fileNameText} numberOfLines={1}>
                  {fileName}
                </Text>
                <View style={styles.sourceBadge}>
                  <Text style={styles.sourceBadgeText}>
                    Detected: {preview.formatLabel} Format
                  </Text>
                </View>
              </View>
            </View>

            {/* Metrics Overview */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricBox}>
                <Calendar size={18} color={colors.primary} />
                <Text style={styles.metricVal}>
                  {skipDuplicates ? preview.newWorkoutsCount : preview.totalWorkouts}
                </Text>
                <Text style={styles.metricLabel}>Workouts</Text>
              </View>

              <View style={styles.metricBox}>
                <Layers size={18} color={colors.success} />
                <Text style={styles.metricVal}>{preview.totalSets}</Text>
                <Text style={styles.metricLabel}>Total Sets</Text>
              </View>

              <View style={styles.metricBox}>
                <Dumbbell size={18} color={colors.warning} />
                <Text style={styles.metricVal}>{assignments.length}</Text>
                <Text style={styles.metricLabel}>Exercises</Text>
              </View>
            </View>

            {/* Date Span */}
            {preview.dateRange && (
              <View style={styles.dateSpanCard}>
                <Calendar size={16} color={colors.textSecondary} />
                <Text style={styles.dateSpanText}>
                  Date span: {preview.dateRange.start} → {preview.dateRange.end}
                </Text>
              </View>
            )}

            {/* Exercise Review & Assignment Card */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Dumbbell size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>Exercise Library Assignment</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Matched against 870+ built-in exercises. For unassigned ones, choose to assign to a library exercise or create a custom one.
              </Text>

              {/* Status Pills */}
              <View style={styles.mappingPillRow}>
                <View style={[styles.statusPill, { backgroundColor: colors.successSoft, borderColor: colors.successSoft }]}>
                  <CheckCircle2 size={14} color={colors.success} />
                  <Text style={[styles.statusPillText, { color: colors.success }]}>
                    {preview.matchedExercisesCount} Matched
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    unassignedCustomCount > 0
                      ? { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }
                      : { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
                  ]}
                >
                  <Plus size={14} color={unassignedCustomCount > 0 ? colors.warning : colors.textSecondary} />
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: unassignedCustomCount > 0 ? colors.warning : colors.textSecondary },
                    ]}
                  >
                    {preview.newCustomExercisesCount} Custom
                  </Text>
                </View>
              </View>

              {/* Filter Tabs */}
              <View style={styles.filterChipRow}>
                {unassignedCustomCount > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      assignmentFilter === 'needs_review' && styles.filterChipActiveWarning,
                    ]}
                    onPress={() => setAssignmentFilter('needs_review')}
                  >
                    <AlertTriangle size={13} color={assignmentFilter === 'needs_review' ? colors.text : colors.warning} />
                    <Text
                      style={[
                        styles.filterChipText,
                        assignmentFilter === 'needs_review'
                          ? styles.filterChipTextActive
                          : { color: colors.warning },
                      ]}
                    >
                      Needs Review ({unassignedCustomCount})
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    assignmentFilter === 'all' && styles.filterChipActive,
                  ]}
                  onPress={() => setAssignmentFilter('all')}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      assignmentFilter === 'all' && styles.filterChipTextActive,
                    ]}
                  >
                    All ({assignments.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    assignmentFilter === 'matched' && styles.filterChipActive,
                  ]}
                  onPress={() => setAssignmentFilter('matched')}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      assignmentFilter === 'matched' && styles.filterChipTextActive,
                    ]}
                  >
                    Matched ({matchedCount})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Assignment Items List */}
              <View style={styles.assignmentList}>
                {displayedAssignments.length === 0 ? (
                  <View style={styles.emptyFilterBox}>
                    <Text style={styles.emptyFilterText}>
                      {assignmentFilter === 'needs_review'
                        ? 'All exercises have been assigned to library movements!'
                        : 'No exercises match this filter.'}
                    </Text>
                  </View>
                ) : (
                  displayedAssignments.map(item => {
                    const isCustom = item.isCustom;
                    return (
                      <View
                        key={item.rawName}
                        style={[
                          styles.assignmentCard,
                          isCustom && styles.assignmentCardWarning,
                        ]}
                      >
                        {/* Top: Raw Name & Tally */}
                        <View style={styles.assignmentTopRow}>
                          <Text style={styles.assignmentRawName} numberOfLines={1}>
                            {item.rawName}
                          </Text>
                          <Text style={styles.assignmentStatsBadge}>
                            {item.workoutCount}w • {item.setCount} sets
                          </Text>
                        </View>

                        {/* Middle: Mapping Status */}
                        <View style={styles.assignmentTargetRow}>
                          {isCustom ? (
                            <View style={styles.customTargetBadge}>
                              <Plus size={13} color={colors.warning} />
                              <Text style={styles.customTargetText}>
                                Will create as Custom Exercise ({item.assignedExercise.equipment || 'other'})
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.matchedTargetBadge}>
                              <CheckCircle2 size={13} color={colors.success} />
                              <Text style={styles.matchedTargetText} numberOfLines={1}>
                                {item.assignedExercise.name}
                              </Text>
                              <View style={styles.equipmentTag}>
                                <Text style={styles.equipmentTagText}>
                                  {item.assignedExercise.equipment || 'any'}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>

                        {/* Bottom: Action Buttons */}
                        <View style={styles.assignmentActionsRow}>
                          {isCustom ? (
                            <>
                              <TouchableOpacity
                                style={styles.actionBtnPrimary}
                                onPress={() => setPickerTargetRawName(item.rawName)}
                                accessibilityRole="button"
                                accessibilityLabel={`Assign ${item.rawName} to existing library exercise`}
                              >
                                <Search size={14} color={colors.text} />
                                <Text style={styles.actionBtnPrimaryText}>Select Library Exercise</Text>
                              </TouchableOpacity>

                              <View style={styles.actionBtnStatic}>
                                <CheckCircle2 size={13} color={colors.textSecondary} />
                                <Text style={styles.actionBtnStaticText}>Create Custom</Text>
                              </View>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.actionBtnSecondary}
                                onPress={() => setPickerTargetRawName(item.rawName)}
                                accessibilityRole="button"
                                accessibilityLabel={`Change assignment for ${item.rawName}`}
                              >
                                <Edit3 size={13} color={colors.primaryLight} />
                                <Text style={styles.actionBtnSecondaryText}>Change Exercise</Text>
                              </TouchableOpacity>

                              {onSetCustomExercise && (
                                <TouchableOpacity
                                  style={styles.actionBtnSubtle}
                                  onPress={() => onSetCustomExercise(item.rawName)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Create ${item.rawName} as custom exercise instead`}
                                >
                                  <Plus size={13} color={colors.textSecondary} />
                                  <Text style={styles.actionBtnSubtleText}>Make Custom</Text>
                                </TouchableOpacity>
                              )}
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            {/* Gym Assignment */}
            {gyms.length > 0 && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <MapPin size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Assign To Gym Profile</Text>
                </View>
                <Text style={styles.sectionSubtitle}>
                  Machine and cable exercises from this import will be scoped to this gym.
                </Text>
                <View style={styles.gymList}>
                  {gyms.map(gym => {
                    const isSelected = gym.id === selectedGymId;
                    return (
                      <TouchableOpacity
                        key={gym.id}
                        style={[
                          styles.gymOption,
                          isSelected && styles.gymOptionSelected,
                        ]}
                        onPress={() => onSelectGymId(gym.id)}
                        disabled={isImporting}
                      >
                        <View style={[styles.gymColorDot, { backgroundColor: gym.color || colors.primary }]} />
                        <Text
                          style={[
                            styles.gymOptionText,
                            isSelected && styles.gymOptionTextSelected,
                          ]}
                        >
                          {gym.name} {gym.isDefault ? '(Default)' : ''}
                        </Text>
                        {isSelected && <CheckCircle2 size={16} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Duplicate Handling Toggle */}
            {preview.duplicateWorkoutsCount > 0 && (
              <View style={styles.duplicateCard}>
                <View style={styles.duplicateHeader}>
                  <AlertTriangle size={18} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.duplicateTitle}>
                      {preview.duplicateWorkoutsCount} Existing Workouts Found
                    </Text>
                    <Text style={styles.duplicateSub}>
                      Workouts matching dates and timestamps already exist in your history.
                    </Text>
                  </View>
                  <Switch
                    value={skipDuplicates}
                    onValueChange={onToggleSkipDuplicates}
                    disabled={isImporting}
                    trackColor={{ false: colors.control, true: colors.primary }}
                    thumbColor={skipDuplicates ? colors.text : colors.textSecondary}
                  />
                </View>
                <Text style={styles.duplicateHint}>
                  {skipDuplicates
                    ? 'Duplicate workouts will be skipped to prevent double-counting.'
                    : 'All workouts will be imported with new IDs.'}
                </Text>
              </View>
            )}

            {/* Sample Preview List */}
            {preview.sampleWorkouts.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Preview (First {preview.sampleWorkouts.length} Workouts)</Text>
                {preview.sampleWorkouts.map((w, idx) => (
                  <View key={idx} style={styles.sampleItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sampleName}>{w.name}</Text>
                      <Text style={styles.sampleMeta}>
                        {w.date} • {w.exerciseCount} exercises • {w.setCount} sets
                      </Text>
                    </View>
                    <Text style={styles.sampleVol}>{Math.round(w.volumeKg)} kg</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={isImporting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                (isImporting || (skipDuplicates && preview.newWorkoutsCount === 0)) && styles.confirmBtnDisabled,
              ]}
              onPress={onConfirmImport}
              disabled={isImporting || (skipDuplicates && preview.newWorkoutsCount === 0)}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
                  <Text style={styles.confirmBtnText}>
                    Import {skipDuplicates ? preview.newWorkoutsCount : preview.totalWorkouts} Workouts
                  </Text>
                  <ArrowRight size={18} color={colors.text} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      </Modal>

      {/* Exercise Picker Modal for manual exercise selection */}
      {pickerTargetRawName && onAssignExercise && (
        <ExercisePickerModal
          visible={pickerTargetRawName !== null}
          title={`Assign "${pickerTargetRawName}"`}
          multiSelect={false}
          onClose={() => setPickerTargetRawName(null)}
          onSelectExercise={selectedExercise => {
            onAssignExercise(pickerTargetRawName, selectedExercise);
            setPickerTargetRawName(null);
          }}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    display: 'flex',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    padding: 18,
    gap: 14,
  },
  sourceCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sourceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fileNameText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  sourceBadge: {
    backgroundColor: colors.primarySoft,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  sourceBadgeText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: 4,
  },
  metricVal: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  dateSpanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSunken,
    padding: 10,
    borderRadius: 8,
  },
  dateSpanText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 18,
  },
  mappingPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipActiveWarning: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  assignmentList: {
    gap: 10,
  },
  emptyFilterBox: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 8,
  },
  emptyFilterText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  assignmentCard: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  assignmentCardWarning: {
    borderColor: colors.warningSoft,
    backgroundColor: colors.warningSoft,
  },
  assignmentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assignmentRawName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 10,
  },
  assignmentStatsBadge: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: colors.border,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  assignmentTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchedTargetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  matchedTargetText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  equipmentTag: {
    backgroundColor: colors.successSoft,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  equipmentTagText: {
    color: colors.successLight,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  customTargetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  customTargetText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },
  assignmentActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    minHeight: 38,
  },
  actionBtnPrimaryText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    minHeight: 38,
  },
  actionBtnSecondaryText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtnSubtle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    minHeight: 38,
  },
  actionBtnSubtleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtnStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  actionBtnStaticText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  gymList: {
    gap: 8,
  },
  gymOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceSunken,
    gap: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gymOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
  },
  gymColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  gymOptionText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  gymOptionTextSelected: {
    color: colors.text,
    fontWeight: '700',
  },
  duplicateCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warningSoft,
  },
  duplicateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  duplicateTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  duplicateSub: {
    color: colors.textSoft,
    fontSize: 11,
    marginTop: 2,
  },
  duplicateHint: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 8,
  },
  sampleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  sampleName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  sampleMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  sampleVol: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.textSoft,
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnDisabled: {
    backgroundColor: colors.control,
    opacity: 0.6,
  },
  confirmBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
});
