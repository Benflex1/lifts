import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { GripVertical } from 'lucide-react-native';
import type { PanResponderInstance } from 'react-native';
import type { ExerciseLayout } from '../workout/active-exercises';

const DRAG_ACTIVATION_MS = 350;
const DRAG_CANCEL_DISTANCE = 10;

export interface DragHandleRenderProps {
  panHandlers: PanResponderInstance['panHandlers'];
  isDragging: boolean;
}

interface DraggableExerciseCardProps {
  itemId: string;
  exerciseName: string;
  onLayout: (itemId: string, layout: ExerciseLayout) => void;
  onDrop: (itemId: string, deltaY: number) => void;
  onDragActiveChange: (active: boolean) => void;
  children: React.ReactNode;
}

export function DraggableExerciseCard({
  itemId,
  exerciseName,
  onLayout,
  onDrop,
  onDragActiveChange,
  children,
}: DraggableExerciseCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const itemIdRef = useRef(itemId);
  const onDropRef = useRef(onDrop);
  const onDragActiveChangeRef = useRef(onDragActiveChange);

  useEffect(() => {
    itemIdRef.current = itemId;
    onDropRef.current = onDrop;
    onDragActiveChangeRef.current = onDragActiveChange;
  }, [itemId, onDrop, onDragActiveChange]);

  const clearActivationTimer = () => {
    if (activationTimerRef.current) {
      clearTimeout(activationTimerRef.current);
      activationTimerRef.current = null;
    }
  };

  const endDrag = (deltaY: number, shouldDrop: boolean) => {
    clearActivationTimer();
    const wasDragging = draggingRef.current;
    draggingRef.current = false;

    if (wasDragging) {
      onDragActiveChangeRef.current(false);
      if (shouldDrop) {
        onDropRef.current(itemIdRef.current, deltaY);
      }
    }

    setIsDragging(false);
    dragY.stopAnimation();
    dragY.setValue(0);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          clearActivationTimer();
          draggingRef.current = false;
          activationTimerRef.current = setTimeout(() => {
            draggingRef.current = true;
            setIsDragging(true);
            onDragActiveChangeRef.current(true);
          }, DRAG_ACTIVATION_MS);
        },
        onPanResponderMove: (_, gestureState) => {
          if (!draggingRef.current) {
            if (
              Math.abs(gestureState.dx) > DRAG_CANCEL_DISTANCE ||
              Math.abs(gestureState.dy) > DRAG_CANCEL_DISTANCE
            ) {
              clearActivationTimer();
            }
            return;
          }
          dragY.setValue(gestureState.dy);
        },
        onPanResponderRelease: (_, gestureState) => {
          endDrag(gestureState.dy, true);
        },
        onPanResponderTerminate: () => {
          endDrag(0, false);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    []
  );

  useEffect(() => () => endDrag(0, false), []);

  return (
    <Animated.View
      onLayout={(event) => {
        onLayout(itemId, {
          y: event.nativeEvent.layout.y,
          height: event.nativeEvent.layout.height,
        });
      }}
      style={[
        styles.card,
        isDragging && styles.draggingCard,
        { transform: [{ translateY: dragY }] },
      ]}
    >
      {children}
      <View
        {...panResponder.panHandlers}
        style={[styles.dragHandle, isDragging && styles.dragHandleActive]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Drag ${exerciseName} to reorder`}
        accessibilityHint="Press and hold, then drag up or down"
      >
        <GripVertical size={18} color={isDragging ? '#FFFFFF' : '#6B7280'} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
  },
  draggingCard: {
    zIndex: 10,
    elevation: 10,
    opacity: 0.92,
  },
  dragHandle: {
    position: 'absolute',
    top: 20,
    left: 2,
    zIndex: 20,
    width: 30,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20242E',
    borderWidth: 1,
    borderColor: '#2D3342',
  },
  dragHandleActive: {
    backgroundColor: '#2563EB',
    borderColor: '#60A5FA',
  },
});
