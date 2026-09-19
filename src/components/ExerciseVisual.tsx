import * as React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Circle, G, Line, Path, Rect, Svg, SvgXml } from 'react-native-svg';
import { Exercise } from '../types';
import { ExerciseVisualDescriptor, ExerciseVisualTemplate, getExerciseVisual } from '../utils/exercise-media';
import { WORKOUT_GUIDE_PLANK_FRAME_1 } from './exercise-assets';
import { ExerciseVisualErrorBoundary } from './ExerciseVisualErrorBoundary';

export { ExerciseVisualErrorBoundary } from './ExerciseVisualErrorBoundary';

export type ExerciseVisualSize = 'compact' | 'standard' | 'hero';

export interface ExerciseVisualProps {
  exercise: Exercise;
  size?: ExerciseVisualSize;
  accessibilityLabel?: string;
  animated?: boolean;
  frameIndex?: 0 | 1;
  onFrameChange?: (index: 0 | 1) => void;
  intervalMs?: number;
}

const SIZE = {
  compact: 56,
  standard: 112,
  hero: 220,
} as const satisfies Record<ExerciseVisualSize, number>;

const ASSET_XML: Readonly<Record<string, string>> = Object.freeze({
  'workout-guide/plank/frame-1.svg': WORKOUT_GUIDE_PLANK_FRAME_1,
});

const COLORS = {
  background: '#181A20',
  border: '#262A34',
  silhouette: '#CBD5E1',
  silhouetteMuted: '#64748B',
  accent: '#38BDF8',
  secondary: '#10B981',
  equipment: '#F59E0B',
} as const;

const normalize = (value: unknown): string =>
  typeof value === 'string' ? value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim() : '';

const defaultAccessibilityLabel = (exercise: Exercise): string =>
  `${typeof exercise.name === 'string' && exercise.name.trim() ? exercise.name.trim() : 'Exercise'} exercise illustration`;

const muscleGroups = (exercise: Exercise): string => [
  ...(Array.isArray(exercise.primaryMuscles) ? exercise.primaryMuscles : []),
  ...(Array.isArray(exercise.secondaryMuscles) ? exercise.secondaryMuscles : []),
].map(normalize).join(' ');

const hasMuscle = (muscles: string, names: readonly string[]): boolean =>
  names.some(name => muscles.includes(name));

const renderEquipmentCue = (template: ExerciseVisualTemplate, equipment: string) => {
  const usesEquipment = equipment !== '' && !hasMuscle(equipment, ['body only', 'bodyweight', 'none']);
  if (!usesEquipment) return null;

  if (template === 'carry' || template === 'hinge' || template === 'squat') {
    return <Line x1="24" y1="55" x2="76" y2="55" stroke={COLORS.equipment} strokeWidth="3" strokeLinecap="round" />;
  }
  if (template === 'push' || template === 'pull') {
    return <Line x1="31" y1="45" x2="69" y2="45" stroke={COLORS.equipment} strokeWidth="3" strokeLinecap="round" />;
  }
  return <Circle cx="76" cy="76" r="6" fill={COLORS.equipment} />;
};

const GeneratedExerciseSvg: React.FC<{ exercise: Exercise; template: ExerciseVisualTemplate; dimension: number }> = ({
  exercise,
  template,
  dimension,
}) => {
  const muscles = muscleGroups(exercise);
  const upperHighlight = hasMuscle(muscles, ['chest', 'shoulder', 'triceps', 'biceps', 'lats', 'back', 'forearm']);
  const coreHighlight = hasMuscle(muscles, ['abdom', 'core', 'oblique']);
  const lowerHighlight = hasMuscle(muscles, ['quad', 'hamstring', 'glute', 'calf', 'adductor', 'abductor']);
  const equipment = normalize(exercise.equipment);
  const pose = template === 'hinge'
    ? 'M 50 33 Q 60 45 73 48 M 50 40 L 38 65 M 50 40 L 65 65'
    : template === 'stretch'
      ? 'M 50 34 Q 42 48 32 58 M 50 40 L 67 57 M 50 42 L 42 72 M 50 42 L 60 72'
      : template === 'core'
        ? 'M 31 58 Q 50 49 69 58 M 38 58 L 28 73 M 62 58 L 72 73'
        : 'M 50 34 L 50 58 M 50 40 L 30 52 M 50 40 L 70 52 M 50 58 L 38 78 M 50 58 L 62 78';

  return (
    <Svg width={dimension} height={dimension} viewBox="0 0 100 100" accessibilityRole="image">
      <Rect x="1" y="1" width="98" height="98" rx="14" fill={COLORS.background} stroke={COLORS.border} strokeWidth="2" />
      <G stroke={COLORS.silhouette} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Circle cx="50" cy="23" r="7" fill={COLORS.silhouette} stroke="none" />
        <Path d={pose} />
      </G>
      {upperHighlight && <Circle cx="50" cy="40" r="7" fill={COLORS.accent} opacity={0.8} />}
      {coreHighlight && <Circle cx="50" cy="50" r="6" fill={COLORS.secondary} opacity={0.85} />}
      {lowerHighlight && <G fill={COLORS.accent} opacity={0.7}><Circle cx="42" cy="63" r="5" /><Circle cx="58" cy="63" r="5" /></G>}
      {!upperHighlight && !coreHighlight && !lowerHighlight && <Circle cx="50" cy="50" r="5" fill={COLORS.silhouetteMuted} />}
      {renderEquipmentCue(template, equipment)}
    </Svg>
  );
};

const renderAsset = (descriptor: Extract<ExerciseVisualDescriptor, { kind: 'open-asset' }>, dimension: number) => {
  const xml = ASSET_XML[descriptor.assetKey];
  if (!xml) return null;
  return <SvgXml xml={xml} width={dimension} height={dimension} accessibilityRole="image" />;
};

const AnimatedRemoteExerciseImage: React.FC<{
  descriptor: Extract<ExerciseVisualDescriptor, { kind: 'remote-image' }>;
  dimension: number;
  animated?: boolean;
  frameIndex?: 0 | 1;
  onFrameChange?: (index: 0 | 1) => void;
  intervalMs?: number;
  onImageError: () => void;
}> = ({
  descriptor,
  dimension,
  animated = false,
  frameIndex,
  onFrameChange,
  intervalMs = 1200,
  onImageError,
}) => {
  const [internalFrame, setInternalFrame] = React.useState<0 | 1>(frameIndex ?? 0);

  React.useEffect(() => {
    if (frameIndex !== undefined) {
      setInternalFrame(frameIndex);
    }
  }, [frameIndex]);

  React.useEffect(() => {
    if (!animated) return;
    const timer = setInterval(() => {
      setInternalFrame((prev) => {
        const next: 0 | 1 = prev === 0 ? 1 : 0;
        onFrameChange?.(next);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [animated, intervalMs, onFrameChange]);

  const activeFrame = frameIndex !== undefined ? frameIndex : internalFrame;
  const [frame0Url, frame1Url] = descriptor.imageUrls;

  return (
    <View style={[styles.multiFrameContainer, { width: dimension, height: dimension }]}>
      <Image
        source={{ uri: frame0Url }}
        style={[
          styles.fillImage,
          { width: dimension, height: dimension },
          activeFrame === 0 ? styles.imageVisible : styles.imageHidden,
        ]}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={`${descriptor.alt} - Frame 1: Starting Position`}
        onError={onImageError}
      />
      <Image
        source={{ uri: frame1Url }}
        style={[
          styles.fillImage,
          { width: dimension, height: dimension },
          activeFrame === 1 ? styles.imageVisible : styles.imageHidden,
        ]}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={`${descriptor.alt} - Frame 2: Peak Contraction`}
        onError={onImageError}
      />
    </View>
  );
};

const RemoteExerciseImage: React.FC<{
  descriptor: Extract<ExerciseVisualDescriptor, { kind: 'remote-image' }>;
  exercise: Exercise;
  dimension: number;
  animated?: boolean;
  frameIndex?: 0 | 1;
  onFrameChange?: (index: 0 | 1) => void;
  intervalMs?: number;
}> = ({
  descriptor,
  exercise,
  dimension,
  animated = false,
  frameIndex,
  onFrameChange,
  intervalMs = 1200,
}) => {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [descriptor.imageUrl]);

  if (hasError) {
    return <GeneratedExerciseSvg exercise={exercise} template={descriptor.fallbackTemplate} dimension={dimension} />;
  }

  const hasTwoImages = Array.isArray(descriptor.imageUrls) && descriptor.imageUrls.length >= 2;
  const isMultiFrame = hasTwoImages && (animated || frameIndex !== undefined);

  if (!isMultiFrame) {
    return (
      <Image
        source={{ uri: descriptor.imageUrl }}
        style={{ width: dimension, height: dimension }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={descriptor.alt}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <AnimatedRemoteExerciseImage
      descriptor={descriptor}
      dimension={dimension}
      animated={animated}
      frameIndex={frameIndex}
      onFrameChange={onFrameChange}
      intervalMs={intervalMs}
      onImageError={() => setHasError(true)}
    />
  );
};

const ExerciseVisualContent: React.FC<{
  exercise: Exercise;
  dimension: number;
  animated?: boolean;
  frameIndex?: 0 | 1;
  onFrameChange?: (index: 0 | 1) => void;
  intervalMs?: number;
}> = ({ exercise, dimension, animated, frameIndex, onFrameChange, intervalMs }) => {
  const descriptor = getExerciseVisual(exercise);
  if (descriptor.kind === 'open-asset') {
    return renderAsset(descriptor, dimension) || <GeneratedExerciseSvg exercise={exercise} template="general" dimension={dimension} />;
  }
  if (descriptor.kind === 'remote-image') {
    return (
      <RemoteExerciseImage
        descriptor={descriptor}
        exercise={exercise}
        dimension={dimension}
        animated={animated}
        frameIndex={frameIndex}
        onFrameChange={onFrameChange}
        intervalMs={intervalMs}
      />
    );
  }
  return <GeneratedExerciseSvg exercise={exercise} template={descriptor.template} dimension={dimension} />;
};

export const ExerciseVisual: React.FC<ExerciseVisualProps> = ({
  exercise,
  size = 'standard',
  accessibilityLabel,
  animated,
  frameIndex,
  onFrameChange,
  intervalMs,
}) => {
  const dimension = SIZE[size];
  const label = accessibilityLabel || defaultAccessibilityLabel(exercise);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.container, { width: dimension, height: dimension, borderRadius: dimension / 7 }]}
    >
      <ExerciseVisualErrorBoundary dimension={dimension} accessibilityLabel={label}>
        <ExerciseVisualContent
          exercise={exercise}
          dimension={dimension}
          animated={animated}
          frameIndex={frameIndex}
          onFrameChange={onFrameChange}
          intervalMs={intervalMs}
        />
      </ExerciseVisualErrorBoundary>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  multiFrameContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  fillImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  imageVisible: {
    opacity: 1,
  },
  imageHidden: {
    opacity: 0,
  },
});
