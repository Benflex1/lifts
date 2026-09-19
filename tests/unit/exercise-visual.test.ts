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
  let state = false;
  const React = {
    createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
      return { type, props: { ...(props ?? {}), ...(children.length === 1 ? { children: children[0] } : { children }) } };
    },
    useState(initial: boolean) {
      state = state || initial;
      return [state, (next: boolean) => { state = next; }] as const;
    },
    useEffect() {},
  };
  return { React, reset: () => { state = false; } };
};

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

    const harness = createReactHarness();
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
    const firstRender = remoteComponent.type(remoteComponent.props) as { type: unknown; props: Record<string, unknown> };
    assert.equal(firstRender.type, Image);
    assert.equal(typeof firstRender.props.onError, 'function');

    (firstRender.props.onError as () => void)();
    const fallback = remoteComponent.type(remoteComponent.props) as { type: (props: Record<string, unknown>) => unknown; props: Record<string, unknown> };
    assert.notEqual(fallback.type, Image);
    const fallbackSvg = fallback.type(fallback.props) as { type: unknown };
    assert.equal(fallbackSvg.type, SvgComponent);
    harness.reset();
  });

});
