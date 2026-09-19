import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { GripVertical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { ExerciseLayout } from '../workout/active-exercises';

interface DraggableExerciseCardProps {
  itemId: string;
  exerciseName: string;
  onLayout: (itemId: string, layout: ExerciseLayout) => void;
  onDrop: (itemId: string, deltaY: number) => void;
  onDragActiveChange: (active: boolean) => void;
  children: React.ReactNode | ((props: { panHandlers: any; isDragging: boolean }) => React.ReactNode);
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
  const dragY = useRef(new Animated.Value(0)).current;
  const itemIdRef = useRef(itemId);
  const onDropRef = useRef(onDrop);
  const onDragActiveChangeRef = useRef(onDragActiveChange);

  useEffect(() => {
    itemIdRef.current = itemId;
    onDropRef.current = onDrop;
    onDragActiveChangeRef.current = onDragActiveChange;
    dragY.stopAnimation();
    dragY.setValue(0);
    setIsDragging(false);
    draggingRef.current = false;
  }, [itemId, onDrop, onDragActiveChange]);

  const endDrag = (deltaY: number, shouldDrop: boolean) => {
    const wasDragging = draggingRef.current;
    draggingRef.current = false;
    setIsDragging(false);
    onDragActiveChangeRef.current(false);

    dragY.stopAnimation();
    dragY.setValue(0);

    if (wasDragging && shouldDrop) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      // Give React Native's gesture responder a frame to complete before state update
      setTimeout(() => {
        onDropRef.current(itemIdRef.current, deltaY);
      }, 16);
    }
  };

  // Safety watchdog: prevent infinite dragging lock
  useEffect(() => {
    let timer: any;
    if (isDragging) {
      timer = setTimeout(() => {
        endDrag(0, false);
      }, 10000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isDragging]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
        onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          draggingRef.current = true;
          setIsDragging(true);
          onDragActiveChangeRef.current(true);
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }
        },
        onPanResponderMove: (_, gestureState) => {
          dragY.setValue(gestureState.dy);
        },
        onPanResponderRelease: (_, gestureState) => {
          endDrag(gestureState.dy, true);
        },
        onPanResponderTerminate: () => {
          endDrag(0, false);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    []
  );

  useEffect(() => () => endDrag(0, false), []);

  const isFunctionChild = typeof children === 'function';

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
        {
          transform: [
            { translateY: dragY },
            { scale: isDragging ? 1.02 : 1 },
          ],
        },
      ]}
    >
      {isFunctionChild ? (
        children({ panHandlers: panResponder.panHandlers, isDragging })
      ) : (
        <>
          {children}
          <View
            {...panResponder.panHandlers}
            style={[styles.dragHandle, isDragging && styles.dragHandleActive]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Drag ${exerciseName} to reorder`}
            accessibilityHint="Drag up or down to reorder"
          >
            <GripVertical size={18} color={isDragging ? '#FFFFFF' : '#9CA3AF'} />
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    alignSelf: 'stretch',
  },
  draggingCard: {
    zIndex: 999,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    opacity: 0.95,
  },
  dragHandle: {
    position: 'absolute',
    top: 18,
    right: 46,
    zIndex: 20,
    width: 30,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleActive: {
    backgroundColor: '#1E293B',
  },
});
