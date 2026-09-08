import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  isCompleted?: boolean;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 90;
const VELOCITY_THRESHOLD = 0.35;

export const SwipeableSetRow: React.FC<Props> = ({
  children,
  onDelete,
  isCompleted = false,
  disabled = false,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const isDeletingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (disabled || isDeletingRef.current) return false;
        // Only trigger on intentional leftward drag, ignoring vertical scrolling
        return (
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2 &&
          gestureState.dx < -12 &&
          Math.abs(gestureState.dy) < 15
        );
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        if (disabled || isDeletingRef.current) return false;
        return (
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2 &&
          gestureState.dx < -16 &&
          Math.abs(gestureState.dy) < 15
        );
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (isDeletingRef.current) return;
        if (gestureState.dx < 0) {
          // Swipe left with natural friction past -160px
          if (gestureState.dx >= -160) {
            translateX.setValue(gestureState.dx);
          } else {
            const extra = gestureState.dx + 160;
            translateX.setValue(-160 + extra * 0.4);
          }
        } else {
          // Slight resistance if dragged right
          translateX.setValue(gestureState.dx * 0.1);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isDeletingRef.current) return;

        const isPastThreshold =
          gestureState.dx < -SWIPE_THRESHOLD ||
          (gestureState.dx < -40 && gestureState.vx < -VELOCITY_THRESHOLD);

        if (isPastThreshold) {
          isDeletingRef.current = true;
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }

          Animated.timing(translateX, {
            toValue: -500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            bounciness: 4,
            speed: 16,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (!isDeletingRef.current) {
          Animated.spring(translateX, {
            toValue: 0,
            bounciness: 4,
            speed: 16,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Icon opacity and slight scale-in as user swipes
  const iconOpacity = translateX.interpolate({
    inputRange: [-70, -25, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  const iconScale = translateX.interpolate({
    inputRange: [-100, -40, 0],
    outputRange: [1, 0.85, 0.7],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Red Delete Background Layer (Revealed on Swipe Left) */}
      <View style={styles.deleteBackground}>
        <Animated.View
          style={[
            styles.deleteContent,
            {
              opacity: iconOpacity,
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Text style={styles.deleteText}>Delete</Text>
          <Trash2 size={18} color="#FFFFFF" />
        </Animated.View>
      </View>

      {/* Foreground Set Row Content */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.frontRow,
          {
            transform: [{ translateX }],
            backgroundColor: isCompleted ? '#12241E' : '#181A20',
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  deleteBackground: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  deleteContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  frontRow: {
    borderRadius: 8,
  },
});
