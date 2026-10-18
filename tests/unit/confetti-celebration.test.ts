import assert from 'node:assert/strict';
import test from 'node:test';
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

class FakeAnimatedValue {
  constructor(_value: number) {}

  interpolate = (config: unknown) => config;
}

mockModule('react-native', {
  View: 'View',
  Animated: {
    Value: FakeAnimatedValue,
    View: 'AnimatedView',
    timing: (_value: unknown, _config: unknown) => ({ start: (cb?: () => void) => cb?.() }),
  },
  Easing: { out: (fn: unknown) => fn, quad: (value: number) => value },
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
  Platform: { OS: 'ios' },
});

mockModule('expo-haptics', {
  impactAsync: async () => {},
  notificationAsync: async () => {},
  ImpactFeedbackStyle: { Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
});

test('ConfettiCelebration builds particles once per mount', async () => {
  const { ConfettiCelebration } = await import('../../src/components/ConfettiCelebration');
  const React = await import('react');

  const originalRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => {
    randomCalls += 1;
    return originalRandom();
  };

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  try {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(ConfettiCelebration, { count: 7 }));
    });
    const callsAfterMount = randomCalls;
    assert.ok(callsAfterMount > 0, 'particles are generated on mount');

    act(() => {
      renderer.update(React.createElement(ConfettiCelebration, { count: 7 }));
    });
    assert.equal(
      randomCalls,
      callsAfterMount,
      're-rendering does not regenerate particles (no render-phase rebuild)',
    );

    const tree = renderer.toJSON();
    const particleCount = Array.isArray(tree) ? tree.length : (tree?.children ?? []).length;
    assert.equal(particleCount, 7, 'all particles are rendered');
  } finally {
    Math.random = originalRandom;
  }
});
