import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

const iconProxy = new Proxy({}, { get: (_target, name) => name }) as Record<string, unknown>;
const noop = () => {};

mockModule('react-native', {
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  TextInput: 'TextInput',
  Animated: {
    View: 'AnimatedView',
    Value: class AnimatedValue {
      constructor(_value: number) {}
      interpolate = (config: unknown) => config;
      setValue = noop;
    },
    timing: () => ({ start: noop }),
    spring: () => ({ start: noop }),
    parallel: () => ({ start: noop }),
  },
  Easing: {
    out: (value: unknown) => value,
    cubic: (value: unknown) => value,
    inOut: (value: unknown) => value,
  },
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (style: unknown) => style,
    absoluteFillObject: {},
  },
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
});
mockModule('lucide-react-native', iconProxy);
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
});
mockModule('expo-haptics', {
  notificationAsync: async () => {},
  NotificationFeedbackType: { Success: 'success' },
});
mockModule('../../src/utils/haptics', { bestEffortHaptic: noop });
mockModule('../../src/components/ui', {
  AppTouchable: 'TouchableOpacity',
  PRMark: 'PRMark',
  PR_RANK_COLORS: { 1: '#f59e0b', 2: '#94a3b8', 3: '#b45309' },
});
mockModule('../../src/context/SettingsContext', { useSettings: () => ({ unit: 'kg' }) });
mockModule('../../src/context/WorkoutContext', {
  useRestTimer: () => ({ isActive: true, remainingSeconds: 30, totalSeconds: 60 }),
  useWorkout: () => ({ adjustRestTimer: noop, stopRestTimer: noop }),
  useWorkoutClock: () => 90,
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = TestRenderer.ReactTestRenderer;

function render(element: React.ReactElement): Renderer {
  let renderer!: Renderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

test('the rest countdown is a polite live region with a timer role (A11Y-03)', async () => {
  const { RestTimerOverlay } = await import('../../src/components/RestTimerOverlay');
  const renderer = render(React.createElement(RestTimerOverlay, {}));
  const countdown = renderer.root.findAll(
    node =>
      node.props?.accessibilityRole === 'timer' && node.props?.accessibilityLiveRegion === 'polite',
  );
  assert.equal(countdown.length, 1);
  assert.equal(countdown[0].props.accessibilityLabel, 'Rest time remaining');
  assert.equal(countdown[0].props.accessibilityValue.text, '00:30');
});

test('the PR toast is an assertive live region (A11Y-03)', async () => {
  const { PRCelebrationToast } = await import('../../src/components/PRCelebrationToast');
  const event = {
    achievement: { rank: 1, metric: 'weight', scope: 'all', value: 100, isTie: false },
    exerciseName: 'Bench Press',
    weightKg: 100,
    reps: 5,
  };
  const renderer = render(
    React.createElement(PRCelebrationToast, {
      event: event as never,
      unit: 'kg',
      onDismiss: noop,
    }),
  );
  const alerts = renderer.root.findAll(
    node =>
      node.props?.accessibilityRole === 'alert' &&
      node.props?.accessibilityLiveRegion === 'assertive',
  );
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].props.accessibilityLabel, /New personal record: Bench Press/);
});

test('the workout clock exposes a timer value without a live region (A11Y-03)', async () => {
  const { WorkoutHeader } = await import('../../src/screens/activeWorkout/WorkoutHeader');
  const props = {
    workoutName: 'Push Day',
    gymName: 'Home',
    showGym: true,
    isFinishing: false,
    unit: 'kg',
    liveVolume: 1200,
    completedSetsCount: 2,
    totalSetsCount: 8,
    topInset: 44,
    onMinimize: noop,
    onOpenMenu: noop,
    onFinish: noop,
    onOpenDuration: noop,
  };
  const renderer = render(React.createElement(WorkoutHeader, props as never));

  const durationButton = renderer.root.findAll(
    node =>
      node.type === ('TouchableOpacity' as any) &&
      node.props?.accessibilityLabel === 'Workout duration',
  );
  assert.equal(durationButton.length, 1);
  assert.equal(durationButton[0].props.accessibilityValue.text, '01:30');
  assert.equal(durationButton[0].props.accessibilityLiveRegion, undefined);
});

test('weight, reps, and note inputs announce labels and current values (A11Y-03)', async () => {
  const { WeightInput } = await import('../../src/components/WeightInput');
  const { RepsInput } = await import('../../src/components/RepsInput');
  const { ExerciseNoteInput } = await import('../../src/components/ExerciseNoteInput');

  const weight = render(
    React.createElement(WeightInput, {
      value: 100,
      onCommit: noop,
      accessibilityLabel: 'Weight for set 3',
    }),
  );
  const weightInput = weight.root.findAll(
    node =>
      node.type === ('TextInput' as any) &&
      node.props?.accessibilityLabel === 'Weight for set 3 in kg',
  );
  assert.equal(weightInput.length, 1);
  assert.equal(weightInput[0].props.accessibilityValue.text, '100');

  const reps = render(
    React.createElement(RepsInput, {
      value: 8,
      onCommit: noop,
      accessibilityLabel: 'Reps for set 3',
    }),
  );
  const repsInput = reps.root.findAll(
    node =>
      node.type === ('TextInput' as any) && node.props?.accessibilityLabel === 'Reps for set 3',
  );
  assert.equal(repsInput.length, 1);
  assert.equal(repsInput[0].props.accessibilityValue.text, '8');

  const note = render(
    React.createElement(ExerciseNoteInput, {
      exerciseId: 'ae-1',
      onCommit: noop,
      accessibilityLabel: 'Note for Bench Press',
    }),
  );
  const noteInput = note.root.findAll(
    node =>
      node.type === ('TextInput' as any) &&
      node.props?.accessibilityLabel === 'Note for Bench Press',
  );
  assert.equal(noteInput.length, 1);
  assert.equal(noteInput[0].props.accessibilityValue.text, 'empty');
});
