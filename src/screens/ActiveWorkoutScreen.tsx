import React from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { AppTouchable } from '../components/ui';
import { X } from 'lucide-react-native';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { ExerciseReorderModal } from '../components/ExerciseReorderModal';
import { GymPickerModal } from '../components/GymPickerModal';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { PRCelebrationToast } from '../components/PRCelebrationToast';
import { RestTimeWheelModal } from '../components/RestTimeWheelModal';
import { RestTimerOverlay } from '../components/RestTimerOverlay';
import { SupersetModal } from '../components/SupersetModal';
import { WarmupModal } from '../components/WarmupModal';
import { WorkoutDurationModal } from '../components/WorkoutDurationModal';
import { Workout } from '../types';
import { colors } from '../theme';
import { ExerciseOptionsMenu } from './activeWorkout/ExerciseOptionsMenu';
import { ExerciseStream } from './activeWorkout/ExerciseStream';
import { SetOptionsModal } from './activeWorkout/SetOptionsModal';
import { WorkoutHeader } from './activeWorkout/WorkoutHeader';
import { WorkoutOptionsMenu } from './activeWorkout/WorkoutOptionsMenu';
import { useActiveWorkoutController } from './activeWorkout/useActiveWorkoutController';
import { styles } from './activeWorkoutStyles';

/**
 * ARCH-01: composition only. Screen state and handlers live in `useActiveWorkoutController`;
 * the header, exercise stream, option menus, and modals are the extracted children.
 */
export const ActiveWorkoutScreen: React.FC<{ onFinish: (workout: Workout) => void }> = ({
  onFinish,
}) => {
  const { activeWorkout, header, stream, overlays, modals } = useActiveWorkoutController({
    onFinish,
  });

  if (!activeWorkout) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screenContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WorkoutHeader {...header} />

      <ExerciseStream {...stream} />

      {/* Floating Rest Timer Overlay */}
      <RestTimerOverlay nextUpText={overlays.nextUpCue} bottomOffset={overlays.bottomOffset} />

      {/* Non-blocking Floating Superset Cue when timer is not active */}
      {!overlays.isRestTimerActive && overlays.nextUpCue && (
        <View style={[styles.supersetFloatingCue, { bottom: overlays.bottomOffset }]}>
          <View style={styles.supersetCueBadge}>
            <Text style={styles.supersetCueBadgeText}>NEXT UP</Text>
          </View>
          <Text style={styles.supersetCueText} numberOfLines={1}>
            {overlays.nextUpCue}
          </Text>
          <AppTouchable
            onPress={overlays.onDismissNextUpCue}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss next up cue"
          >
            <X size={16} color={colors.textSecondary} />
          </AppTouchable>
        </View>
      )}

      {/* Floating PR Celebration Toast */}
      <PRCelebrationToast
        event={overlays.prCelebrationEvent}
        unit={overlays.unit}
        onDismiss={overlays.onDismissPR}
      />

      {/* Warmup Progression Calculator Modal */}
      <WarmupModal {...modals.warmup} />

      {/* Superset Selection Modal */}
      <SupersetModal {...modals.superset} />

      {/* Exercise Picker Modal */}
      <ExercisePickerModal {...modals.exercisePicker} />

      {/* Exercise Detail Modal */}
      <ExerciseDetailModal {...modals.detail} />

      {/* Active Workout Gym Picker */}
      <GymPickerModal {...modals.gymPicker} />

      {/* Plate Calculator Modal */}
      <PlateCalculatorModal {...modals.plateCalculator} />

      {/* Rest Time Wheel Modal */}
      <RestTimeWheelModal {...modals.restWheel} />

      {/* Set Options & Fast 1-Tap RPE Modal */}
      <SetOptionsModal {...modals.setOptions} />

      {/* Exercise Options Menu Modal */}
      <ExerciseOptionsMenu {...modals.exerciseMenu} />

      {/* Workout Options Menu Modal */}
      <WorkoutOptionsMenu {...modals.workoutMenu} />

      {/* Workout Duration Adjustment & 4hr+ Safety Modal */}
      <WorkoutDurationModal {...modals.duration} />

      {/* Dedicated Exercise Reorder Modal */}
      <ExerciseReorderModal {...modals.reorder} />
    </KeyboardAvoidingView>
  );
};
