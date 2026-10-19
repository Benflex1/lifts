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

const platform = { OS: 'ios' as string };
const focusCalls: number[] = [];

mockModule('react-native', {
  View: 'View',
  Text: 'Text',
  Platform: platform,
  findNodeHandle: () => 42,
  AccessibilityInfo: {
    setAccessibilityFocus: (tag: number) => {
      focusCalls.push(tag);
    },
  },
  StyleSheet: { create: (styles: unknown) => styles },
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('the modal hook moves iOS focus into the container when it opens (A11Y-04)', async () => {
  focusCalls.length = 0;
  platform.OS = 'ios';
  const { useModalAccessibility } = await import('../../src/hooks/useModalAccessibility');

  class FakeView extends React.Component {
    render() {
      return null;
    }
  }

  const Probe: React.FC<{ visible: boolean }> = ({ visible }) => {
    const ref = useModalAccessibility(visible);
    return React.createElement(FakeView as never, { ref });
  };

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe, { visible: false }));
  });
  assert.deepEqual(focusCalls, [], 'hidden modals must not take focus');

  act(() => {
    renderer.update(React.createElement(Probe, { visible: true }));
  });
  assert.deepEqual(focusCalls, [42], 'the container takes focus once when it opens');
});

test('the modal hook is a no-op off iOS (A11Y-04)', async () => {
  focusCalls.length = 0;
  platform.OS = 'web';
  const { useModalAccessibility } = await import('../../src/hooks/useModalAccessibility');

  const Probe: React.FC<{ visible: boolean }> = ({ visible }) => {
    const ref = useModalAccessibility(visible);
    return React.createElement('View', { ref });
  };

  act(() => {
    TestRenderer.create(React.createElement(Probe, { visible: true }));
  });
  assert.deepEqual(focusCalls, []);
});
