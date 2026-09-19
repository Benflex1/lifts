import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  LayoutAnimation,
  Animated,
  PanResponder,
} from 'react-native';
import {
  X,
  ArrowUp,
  ArrowDown,
  Dumbbell,
  Check,
  GripVertical,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveExercise } from '../types';
import { ExerciseVisual } from './ExerciseVisual';

interface ExerciseReorderModalProps {
  visible: boolean;
  exercises: ActiveExercise[];
  onMoveExercise: (activeExerciseId: string, direction: -1 | 1) => void;
  onMoveExerciseToIndex?: (activeExerciseId: string, targetIndex: number) => void;
  onClose: () => void;
}

const ROW_HEIGHT = 68;

interface ReorderRowProps {
  item: ActiveExercise;
  index: number;
  totalCount: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (activeExerciseId: string, direction: -1 | 1) => void;
  onDropToIndex?: (activeExerciseId: string, targetIndex: number) => void;
}

const ReorderRow: React.FC<ReorderRowProps> = ({
  item,
  index,
  totalCount,
  isFirst,
  isLast,
  onMove,
  onDropToIndex,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragY = useRef(new Animated.Value(0)).current;

  const indexRef = useRef(index);
  indexRef.current = index;
  const totalCountRef = useRef(totalCount);
  totalCountRef.current = totalCount;
  const itemRef = useRef(item);
  itemRef.current = item;
  const onDropToIndexRef = useRef(onDropToIndex);
  onDropToIndexRef.current = onDropToIndex;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        setIsDragging(true);
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
      },
      onPanResponderMove: (_, gestureState) => {
        dragY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);
        const steps = Math.round(gestureState.dy / ROW_HEIGHT);
        const currentIndex = indexRef.current;
        const count = totalCountRef.current;
        const dropHandler = onDropToIndexRef.current;
        const currentItemId = itemRef.current.id;

        if (steps !== 0 && dropHandler) {
          const targetIndex = Math.max(0, Math.min(count - 1, currentIndex + steps));
          if (targetIndex !== currentIndex) {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            }
            dropHandler(currentItemId, targetIndex);
          }
        }
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 18,
        }).start();
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  const completedCount = item.sets.filter((s) => s.isCompleted).length;
  const totalSets = item.sets.length;

  return (
    <Animated.View
      style={[
        styles.exerciseRow,
        isDragging && styles.exerciseRowDragging,
        {
          transform: [
            { translateY: dragY },
            { scale: isDragging ? 1.03 : 1 },
          ],
        },
      ]}
    >
      {/* Position Badge */}
      <View style={styles.indexBadge}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>

      {/* Thumbnail */}
      <View style={styles.avatar}>
        {item.exercise ? (
          <ExerciseVisual exercise={item.exercise} size="compact" />
        ) : (
          <Dumbbell size={18} color="#38BDF8" />
        )}
      </View>

      {/* Information */}
      <View style={styles.infoCol}>
        <Text style={styles.exerciseName} numberOfLines={1}>
          {item.exercise?.name || 'Exercise'}
        </Text>
        <Text style={styles.exerciseMeta} numberOfLines={1}>
          {completedCount}/{totalSets} sets
          {item.exercise?.equipment ? ` • ${item.exercise.equipment}` : ''}
        </Text>
      </View>

      {/* Action Chevrons & Drag Handle */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.arrowBtn, isFirst && styles.arrowBtnDisabled]}
          disabled={isFirst}
          onPress={() => onMove(item.id, -1)}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={`Move ${item.exercise?.name || 'exercise'} up`}
        >
          <ArrowUp size={16} color={isFirst ? '#4B5563' : '#38BDF8'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.arrowBtn, isLast && styles.arrowBtnDisabled]}
          disabled={isLast}
          onPress={() => onMove(item.id, 1)}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={`Move ${item.exercise?.name || 'exercise'} down`}
        >
          <ArrowDown size={16} color={isLast ? '#4B5563' : '#38BDF8'} />
        </TouchableOpacity>

        {/* Drag Handle */}
        <View
          {...panResponder.panHandlers}
          style={[styles.dragHandle, isDragging && styles.dragHandleActive]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Drag ${item.exercise?.name || 'exercise'} to reorder`}
        >
          <GripVertical size={18} color={isDragging ? '#38BDF8' : '#9CA3AF'} />
        </View>
      </View>
    </Animated.View>
  );
};

export const ExerciseReorderModal: React.FC<ExerciseReorderModalProps> = ({
  visible,
  exercises,
  onMoveExercise,
  onMoveExerciseToIndex,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  const handleMove = (activeExerciseId: string, direction: -1 | 1) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    onMoveExercise(activeExerciseId, direction);
  };

  const handleDropToIndex = (activeExerciseId: string, targetIndex: number) => {
    if (onMoveExerciseToIndex) {
      onMoveExerciseToIndex(activeExerciseId, targetIndex);
    } else {
      const currentIndex = exercises.findIndex((e) => e.id === activeExerciseId);
      if (currentIndex >= 0 && currentIndex !== targetIndex) {
        const diff = targetIndex - currentIndex;
        handleMove(activeExerciseId, diff > 0 ? 1 : -1);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Reorder Exercises</Text>
              <Text style={styles.subtitle}>
                Tap arrows or drag the handle to change order
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close exercise reorder modal"
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* List of exercises */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {exercises.map((item, index) => {
              const isFirst = index === 0;
              const isLast = index === exercises.length - 1;

              return (
                <ReorderRow
                  key={item.id}
                  item={item}
                  index={index}
                  totalCount={exercises.length}
                  isFirst={isFirst}
                  isLast={isLast}
                  onMove={handleMove}
                  onDropToIndex={handleDropToIndex}
                />
              );
            })}
          </ScrollView>

          {/* Bottom Primary Done Button */}
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Done reordering"
          >
            <Check size={18} color="#0D0E12" strokeWidth={2.5} />
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#14171F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#20242E',
    maxHeight: '85%',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#20242E',
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 18,
    backgroundColor: '#1E232E',
  },
  scrollList: {
    maxHeight: 460,
  },
  scrollContent: {
    paddingVertical: 12,
    gap: 8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 10,
    height: ROW_HEIGHT,
  },
  exerciseRowDragging: {
    borderColor: '#38BDF8',
    backgroundColor: '#1E232E',
    zIndex: 999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  indexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#20242E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  indexText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#20242E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  infoCol: {
    flex: 1,
    paddingRight: 8,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  exerciseMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1E232E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2D3342',
  },
  arrowBtnDisabled: {
    backgroundColor: '#14171F',
    borderColor: '#1E232E',
    opacity: 0.35,
  },
  dragHandle: {
    width: 32,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E232E',
    marginLeft: 2,
  },
  dragHandleActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#38BDF8',
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 12,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0D0E12',
  },
});
