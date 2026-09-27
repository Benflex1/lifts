import React from 'react';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

const Dumbbell = () => null;

const isDumbbellIcon = (type: unknown) => {
  if (typeof type !== 'function' && (typeof type !== 'object' || type === null)) {
    return false;
  }

  const component = type as {
    name?: string;
    displayName?: string;
    render?: { name?: string; displayName?: string };
  };
  return [component.name, component.displayName, component.render?.name, component.render?.displayName]
    .includes('Dumbbell');
};

const createReactHarness = () => {
  let states: unknown[] = [];
  let index = 0;
  let effectCallbacks: Array<() => void | (() => void)> = [];
  let cleanupCallbacks: Array<() => void> = [];
  const React = {
    createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
      return { type, props: { ...(props ?? {}), ...(children.length === 1 ? { children: children[0] } : { children }) } };
    },
    useState<T>(initial: T) {
      const idx = index++;
      if (states[idx] === undefined) {
        states[idx] = initial;
      }
      return [
        states[idx] as T,
        (next: unknown) => {
          states[idx] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(states[idx]) : next;
        },
      ] as const;
    },
    useEffect(effect: () => void | (() => void)) {
      effectCallbacks.push(effect);
    },
  };
  return {
    React,
    reset: () => {
      for (const cleanup of cleanupCallbacks) cleanup();
      cleanupCallbacks = [];
      effectCallbacks = [];
      states = [];
      index = 0;
    },
    resetRender: () => { index = 0; },
    runEffects: () => {
      const cbs = effectCallbacks;
      effectCallbacks = [];
      for (const cb of cbs) {
        const cleanup = cb();
        if (typeof cleanup === 'function') {
          cleanupCallbacks.push(cleanup);
        }
      }
    },
  };
};

const harness = createReactHarness();

const Image = () => null;
const View = () => null;
const SvgComponent = () => null;
const SvgExports = {
  Svg: SvgComponent,
  Circle: SvgComponent,
  G: SvgComponent,
  Line: SvgComponent,
  Path: SvgComponent,
  Rect: SvgComponent,
  SvgXml: SvgComponent,
};

async function loadBoundary(t: { mock: { module: (specifier: string, options: { exports: object }) => void } }) {
  t.mock.module('react-native', {
    exports: { Image, View, StyleSheet: { create: (styles: unknown) => styles } },
  });
  t.mock.module('react-native-svg', { exports: SvgExports });
  t.mock.module('lucide-react-native', { exports: { Dumbbell } });
  return import('../../src/components/ExerciseVisualErrorBoundary');
}

describe('ExerciseVisual runtime guard', () => {
  it('renders the existing dumbbell icon at the requested size after a child error', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }
    const { ExerciseVisualErrorBoundary } = await loadBoundary(t);
    const boundary = new ExerciseVisualErrorBoundary({
      dimension: 56,
      accessibilityLabel: 'Broken lift illustration',
      children: null,
    });

    boundary.state = ExerciseVisualErrorBoundary.getDerivedStateFromError(new Error('broken SVG'));
    const fallback = boundary.render() as React.ReactElement;

    assert.ok(isDumbbellIcon(fallback.type));
    assert.equal(fallback.props.size, 56);
    assert.equal(fallback.props.accessibilityLabel, 'Broken lift illustration');
  });

  it('switches a remote image to the generated fallback after Image onError', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }

    t.mock.module('react', { exports: harness.React });
    t.mock.module('react-native', { exports: { Image, View, StyleSheet: { create: (styles: unknown) => styles } } });
    t.mock.module('react-native-svg', { exports: SvgExports });
    t.mock.module('../../src/components/ExerciseVisualErrorBoundary', {
      exports: { ExerciseVisualErrorBoundary: ({ children }: { children: unknown }) => children },
    });

    const { ExerciseVisual } = await import('../../src/components/ExerciseVisual');
    const bundled = (await import('../../src/database/seedData')).DEFAULT_EXERCISES[0];
    const root = ExerciseVisual({ exercise: bundled }) as unknown as { props: { children: { props: { children: { props: Record<string, unknown>; type: (props: Record<string, unknown>) => unknown } } } } };
    const remoteImage = root.props.children.props.children;

    const remoteComponent = remoteImage.type(remoteImage.props) as { type: (props: Record<string, unknown>) => unknown; props: Record<string, unknown> };
    harness.resetRender();
    const firstRender = remoteComponent.type(remoteComponent.props) as { type: unknown; props: Record<string, unknown> };
    assert.equal(firstRender.type, Image);
    assert.equal(typeof firstRender.props.onError, 'function');

    (firstRender.props.onError as () => void)();
    harness.resetRender();
    const fallback = remoteComponent.type(remoteComponent.props) as { type: (props: Record<string, unknown>) => unknown; props: Record<string, unknown> };
    assert.notEqual(fallback.type, Image);
    const fallbackSvg = fallback.type(fallback.props) as { type: unknown };
    assert.equal(fallbackSvg.type, SvgComponent);
    harness.reset();
  });

  it('preloads both frames and shows the requested frame when frameIndex is controlled', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }

    t.mock.module('react', { exports: harness.React });
    t.mock.module('react-native', { exports: { Image, View, StyleSheet: { create: (styles: unknown) => styles } } });
    t.mock.module('react-native-svg', { exports: SvgExports });
    t.mock.module('../../src/components/ExerciseVisualErrorBoundary', {
      exports: { ExerciseVisualErrorBoundary: ({ children }: { children: unknown }) => children },
    });

    const { ExerciseVisual } = await import('../../src/components/ExerciseVisual');
    const bundled = (await import('../../src/database/seedData')).DEFAULT_EXERCISES[0];
    const root = ExerciseVisual({ exercise: bundled, frameIndex: 1 }) as unknown as { props: { children: { props: { children: { props: Record<string, unknown>; type: (props: Record<string, unknown>) => unknown } } } } };
    const remoteImage = root.props.children.props.children;

    const remoteComponent = remoteImage.type(remoteImage.props) as { type: (props: Record<string, unknown>) => unknown; props: Record<string, unknown> };
    harness.resetRender();
    const animatedContainer = remoteComponent.type(remoteComponent.props) as { type: (props: Record<string, unknown>) => unknown; props: Record<string, unknown> };

    // Continue index without resetRender so child hook state occupies index 1
    const multiFrameRender = animatedContainer.type(animatedContainer.props) as {
      type: unknown;
      props: { children: Array<{ type: unknown; props: { source: { uri: string }; style: Array<{ opacity?: number }>; accessibilityLabel: string; onError: () => void } }> };
    };

    assert.equal(multiFrameRender.type, View);
    const [frame0, frame1] = multiFrameRender.props.children;
    assert.equal(frame0.type, Image);
    assert.equal(frame1.type, Image);
    assert.ok(frame0.props.source.uri.endsWith('/0.jpg'));
    assert.ok(frame1.props.source.uri.endsWith('/1.jpg'));

    // When frameIndex is 1, frame0 has opacity 0 and frame1 has opacity 1
    const frame0Opacity = frame0.props.style.find((s) => s?.opacity !== undefined)?.opacity;
    const frame1Opacity = frame1.props.style.find((s) => s?.opacity !== undefined)?.opacity;
    assert.equal(frame0Opacity, 0);
    assert.equal(frame1Opacity, 1);

    // If an image in the gallery fails to load, it falls back to generated SVG
    frame0.props.onError();
    harness.resetRender();
    const fallback = remoteComponent.type(remoteComponent.props) as { type: (props: Record<string, unknown>) => unknown; props: Record<string, unknown> };
    assert.notEqual(fallback.type, Image);
    const fallbackSvg = fallback.type(fallback.props) as { type: unknown };
    assert.equal(fallbackSvg.type, SvgComponent);
    harness.reset();
  });

  it('toggles internal frame and fires onFrameChange when animated is true', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }

    t.mock.timers.enable({ apis: ['setInterval'] });

    t.mock.module('react', { exports: harness.React });
    t.mock.module('react-native', { exports: { Image, View, StyleSheet: { create: (styles: unknown) => styles } } });
    t.mock.module('react-native-svg', { exports: SvgExports });
    t.mock.module('../../src/components/ExerciseVisualErrorBoundary', {
      exports: { ExerciseVisualErrorBoundary: ({ children }: { children: unknown }) => children },
    });

    const frameEvents: number[] = [];
    const handleFrameChange = (index: 0 | 1) => {
      frameEvents.push(index);
    };

    const { ExerciseVisual } = await import('../../src/components/ExerciseVisual');
    const bundled = (await import('../../src/database/seedData')).DEFAULT_EXERCISES[0];
    const root = ExerciseVisual({
      exercise: bundled,
      animated: true,
      intervalMs: 800,
      onFrameChange: handleFrameChange,
    }) as unknown as { props: { children: { props: { children: { props: Record<string, unknown>; type: (props: Record<string, unknown>) => unknown } } } } };
    const remoteImage = root.props.children.props.children;

    const remoteComponent = remoteImage.type(remoteImage.props) as { type: (props: Record<string, unknown>) => unknown; props: Record<string, unknown> };
    harness.resetRender();
    const animatedContainer = remoteComponent.type(remoteComponent.props) as { type: (props: Record<string, unknown>) => unknown; props: Record<string, unknown> };

    animatedContainer.type(animatedContainer.props);
    harness.runEffects();

    // Advance time by 800ms
    t.mock.timers.tick(800);
    assert.deepEqual(frameEvents, [1]);

    // Advance time by another 800ms
    t.mock.timers.tick(800);
    assert.deepEqual(frameEvents, [1, 0]);

    // Advance time by another 800ms
    t.mock.timers.tick(800);
    assert.deepEqual(frameEvents, [1, 0, 1]);

    harness.reset();
  });
});
