import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, Easing, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const CONFETTI_COLORS = [
  '#F59E0B', // Gold
  '#FBBF24', // Bright Gold
  '#94A3B8', // Silver
  '#E2E8F0', // Platinum
  '#F97316', // Bronze
  '#38BDF8', // Sky Blue
  '#8B5CF6', // Purple
  '#10B981', // Emerald
];

interface Particle {
  id: number;
  x: number;
  size: { width: number; height: number };
  color: string;
  borderRadius: number;
  rotateZ: Animated.AnimatedInterpolation<string>;
  translateX: Animated.AnimatedInterpolation<number>;
  translateY: Animated.AnimatedInterpolation<number>;
}

interface ConfettiCelebrationProps {
  onComplete?: () => void;
  count?: number;
}

export const ConfettiCelebration: React.FC<ConfettiCelebrationProps> = ({
  onComplete,
  count = 45,
}) => {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const timer = setTimeout(() => {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } catch (_) {}
      }, 160);
      return () => clearTimeout(timer);
    } catch (_) {}
  }, []);

  const particlesRef = useRef<Particle[]>([]);

  if (particlesRef.current.length === 0) {
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const startX = Math.random() * screenWidth;
      const driftX = (Math.random() - 0.5) * 80;
      const speedOffset = 0.8 + Math.random() * 0.4;
      const rotCycles = Math.floor(Math.random() * 3 + 1) * 360;

      const translateY = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-30, (screenHeight + 40) * speedOffset],
      });

      const translateX = animValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, driftX, driftX * 1.5],
      });

      const rotateZ = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', `${rotCycles}deg`],
      });

      const isRound = Math.random() > 0.6;
      const width = isRound ? Math.random() * 6 + 6 : Math.random() * 8 + 6;
      const height = isRound ? width : Math.random() * 12 + 8;

      particles.push({
        id: i,
        x: startX,
        size: { width, height },
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        borderRadius: isRound ? width / 2 : 2,
        rotateZ,
        translateX,
        translateY,
      });
    }
    particlesRef.current = particles;
  }

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: 1,
      duration: 2600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      onComplete?.();
    });
  }, [animValue, onComplete]);

  const opacity = animValue.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 0.9, 0],
  });

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      {particlesRef.current.map((p) => (
        <Animated.View
          key={p.id}
          style={[
            styles.particle,
            {
              left: p.x,
              width: p.size.width,
              height: p.size.height,
              backgroundColor: p.color,
              borderRadius: p.borderRadius,
              transform: [
                { translateY: p.translateY },
                { translateX: p.translateX },
                { rotateZ: p.rotateZ },
              ],
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
  },
  particle: {
    position: 'absolute',
    top: 0,
  },
});
