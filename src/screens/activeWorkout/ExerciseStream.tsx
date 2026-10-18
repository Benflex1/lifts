import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Dumbbell, Layers, Plus } from 'lucide-react-native';
import { ActiveExerciseCard } from '../../components/ActiveExerciseCard';
import { ExerciseSupersetMeta } from '../../workout/supersets';
import { WorkoutPRSummary } from '../../workout/pr';
import { ActiveExercise, Exercise, SetType, WorkoutSet } from '../../types';
import { WeightUnit } from '../../utils/units';
import { OverloadSuggestion } from '../../workout/overload';
import { colors } from '../../theme';
import { styles } from '../activeWorkoutStyles';

export interface ExerciseStreamCardHandlers {
  onToggleExpanded: (exerciseId: string) => void;
  onCommitNotes: (exerciseId: string, notes: string) => void;
  onOpenDetail: (exercise: Exercise | null) => void;
  onOpenMenu: (exercise: ActiveExercise) => void;
  onOpenRestWheel: (exercise: ActiveExercise) => void;
  onStartEditingNote: (exerciseId: string) => void;
  onUpdateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  onRemoveSet: (exerciseId: string, setId: string) => void;
  onAddSet: (exerciseId: string, type?: SetType) => void;
  onToggleSet: (exerciseId: string, setId: string) => void;
  onApplyPrevious: (exerciseId: string, set: WorkoutSet, targetReps?: string) => void;
  onOpenSetOptions: (exerciseId: string, exerciseName: string, set: WorkoutSet) => void;
  onInputFocus: (event: any, inputRef?: React.RefObject<any>) => void;
}

export interface ExerciseStreamProps {
  exercises: ActiveExercise[];
  supersetMetaMap: Map<string, ExerciseSupersetMeta>;
  expandedExercises: Record<string, boolean>;
  editingNoteExId: string | null;
  unit: WeightUnit;
  showRpeColumn: boolean;
  gymTrackingEnabled: boolean;
  prSummary: WorkoutPRSummary | null;
  keyboardHeight: number;
  scrollRef: React.RefObject<ScrollView | null>;
  overloadEnabled: boolean;
  isDeload: boolean;
  onApplyOverload: (exercise: ActiveExercise, suggestion: OverloadSuggestion) => void;
  onExplainOverload: (label: string, suggestion: OverloadSuggestion) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onAddExercise: () => void;
  onOpenSupersetEditor: (activeExerciseId: string) => void;
  cardHandlers: ExerciseStreamCardHandlers;
}

export const ExerciseStream: React.FC<ExerciseStreamProps> = ({
  exercises,
  supersetMetaMap,
  expandedExercises,
  editingNoteExId,
  unit,
  showRpeColumn,
  gymTrackingEnabled,
  prSummary,
  keyboardHeight,
  scrollRef,
  overloadEnabled,
  isDeload,
  onApplyOverload,
  onExplainOverload,
  onScroll,
  onAddExercise,
  onOpenSupersetEditor,
  cardHandlers,
}) => {
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scrollArea}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 300 : 220 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScroll={onScroll}
      scrollEventThrottle={16}
      scrollEnabled={true}
    >
      {exercises.map((activeEx) => {
        const ssMeta = supersetMetaMap.get(activeEx.id);

        return (
          <React.Fragment key={activeEx.id}>
            {ssMeta?.isFirst && (
              <View style={[styles.supersetGroupHeader, { borderLeftColor: ssMeta.color }]}>
                <TouchableOpacity
                  style={[
                    styles.supersetPill,
                    { backgroundColor: ssMeta.color + '25', borderColor: ssMeta.color },
                  ]}
                  onPress={() => onOpenSupersetEditor(activeEx.id)}
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

            <ActiveExerciseCard
              exercise={activeEx}
              supersetMeta={ssMeta}
              isExpanded={expandedExercises[activeEx.id] ?? false}
              isNoteEditing={editingNoteExId === activeEx.id}
              unit={unit}
              showRpeColumn={showRpeColumn}
              gymTrackingEnabled={gymTrackingEnabled}
              prSummary={prSummary}
              overloadEnabled={overloadEnabled}
              isDeload={isDeload}
              onApplyOverload={onApplyOverload}
              onExplainOverload={onExplainOverload}
              onToggleExpanded={cardHandlers.onToggleExpanded}
              onCommitNotes={cardHandlers.onCommitNotes}
              onOpenDetail={cardHandlers.onOpenDetail}
              onOpenMenu={cardHandlers.onOpenMenu}
              onOpenRestWheel={cardHandlers.onOpenRestWheel}
              onStartEditingNote={cardHandlers.onStartEditingNote}
              onUpdateSet={cardHandlers.onUpdateSet}
              onRemoveSet={cardHandlers.onRemoveSet}
              onAddSet={cardHandlers.onAddSet}
              onToggleSet={cardHandlers.onToggleSet}
              onApplyPrevious={cardHandlers.onApplyPrevious}
              onOpenSetOptions={cardHandlers.onOpenSetOptions}
              onInputFocus={cardHandlers.onInputFocus}
            />

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

      {exercises.length === 0 && (
        <View style={styles.emptyWorkout}>
          <View style={styles.emptyWorkoutIcon}>
            <Dumbbell size={26} color={colors.primary} />
          </View>
          <Text style={styles.emptyWorkoutTitle}>Let's get moving</Text>
          <Text style={styles.emptyWorkoutText}>Add your first exercise to start logging sets.</Text>
        </View>
      )}

      {/* Add Exercise Big Button */}
      <TouchableOpacity
        style={[
          styles.addExerciseMainBtn,
          exercises.length === 0 && styles.addExerciseMainBtnSolid,
        ]}
        onPress={onAddExercise}
        accessibilityRole="button"
      >
        <Plus
          size={20}
          color={exercises.length === 0 ? colors.onPrimary : colors.primaryLight}
        />
        <Text
          style={[
            styles.addExerciseMainBtnText,
            exercises.length === 0 && { color: colors.onPrimary },
          ]}
        >
          Add Exercise
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
