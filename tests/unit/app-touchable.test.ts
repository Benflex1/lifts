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

mockModule('react-native', {
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  Modal: 'Modal',
  Animated: {
    Value: class AnimatedValue {
      constructor(_value: number) {}
    },
    timing: () => ({ start: () => {} }),
    sequence: () => ({ start: () => {} }),
    parallel: () => ({ start: () => {} }),
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { AppTouchable } =
  require('../../src/components/ui') as typeof import('../../src/components/ui');

test('AppTouchable forwards the required label and defaults the role to button (A11Y-05)', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(AppTouchable, { accessibilityLabel: 'Increase rest by 30 seconds' }),
    );
  });

  const node = renderer.root.findByType('TouchableOpacity' as any);
  assert.equal(node.props.accessibilityLabel, 'Increase rest by 30 seconds');
  assert.equal(node.props.accessibilityRole, 'button');
});

test('AppTouchable keeps a caller-supplied role and forwards presses (A11Y-05)', () => {
  let presses = 0;
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(AppTouchable, {
        accessibilityLabel: 'Legs filter',
        accessibilityRole: 'tab',
        onPress: () => {
          presses += 1;
        },
      }),
    );
  });

  const node = renderer.root.findByType('TouchableOpacity' as any);
  assert.equal(node.props.accessibilityRole, 'tab');
  act(() => {
    node.props.onPress();
  });
  assert.equal(presses, 1);
});

test('the label prop is required at the type level (A11Y-05)', () => {
  // @ts-expect-error accessibilityLabel is required by AppTouchableProps
  const element = React.createElement(AppTouchable, {});
  assert.ok(element);
});
