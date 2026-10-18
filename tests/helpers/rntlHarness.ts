import type * as RNTL from '@testing-library/react-native';
import React from 'react';

/**
 * DX-02: shared React Native Testing Library harness. React Native itself is a
 * Flow-typed source package that Node cannot load, so tests stub 'react-native'
 * with string host components and load RNTL's pure entry (no jest matchers).
 */

export function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

export const iconProxy = new Proxy({}, { get: (_target, name) => name }) as Record<string, unknown>;

/**
 * Renders FlatList rows directly so row-based UIs work under string-host stubs.
 * This is a flow-test helper, not a virtualization double: mount-count
 * assertions must not rely on it.
 */
export function FlatListTestDouble(props: {
  data?: unknown[] | null;
  renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
  ListHeaderComponent?: React.ReactElement | React.ComponentType | null;
  ListEmptyComponent?: React.ReactElement | React.ComponentType | null;
}) {
  const items = props.data ?? [];
  const renderSlot = (slot: React.ReactElement | React.ComponentType | null | undefined) => {
    if (slot == null) return null;
    return React.isValidElement(slot) ? slot : React.createElement(slot as React.ComponentType);
  };

  return React.createElement(
    'View',
    null,
    renderSlot(props.ListHeaderComponent),
    items.map((item, index) =>
      React.createElement(
        React.Fragment,
        { key: index },
        props.renderItem?.({ item, index }) ?? null,
      ),
    ),
    items.length === 0 ? renderSlot(props.ListEmptyComponent) : null,
  );
}

export function installReactNativeMock(overrides: Record<string, unknown> = {}): void {
  mockModule('react-native', {
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    TextInput: 'TextInput',
    ScrollView: 'ScrollView',
    SafeAreaView: 'SafeAreaView',
    Modal: 'Modal',
    FlatList: FlatListTestDouble,
    ActivityIndicator: 'ActivityIndicator',
    Dimensions: { get: () => ({ width: 400, height: 800 }) },
    StyleSheet: {
      create: (styles: unknown) => styles,
      flatten: (style: unknown) => style,
      absoluteFillObject: {},
    },
    Platform: {
      OS: 'web',
      select: (options: Record<string, unknown>) => options.web ?? options.default,
    },
    Animated: {
      View: 'AnimatedView',
      Value: class AnimatedValue {
        constructor(_value: number) {}
        interpolate = (config: unknown) => config;
        setValue = () => {};
      },
      timing: () => ({ start: (cb?: () => void) => cb?.() }),
      spring: () => ({ start: (cb?: () => void) => cb?.() }),
      parallel: () => ({ start: (cb?: () => void) => cb?.() }),
    },
    Easing: {
      out: (value: unknown) => value,
      cubic: (value: unknown) => value,
      inOut: (value: unknown) => value,
    },
    Appearance: { getColorScheme: () => 'dark' },
    AccessibilityInfo: {
      setAccessibilityFocus: () => {},
      announceForAccessibility: () => {},
      isScreenReaderEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    findNodeHandle: () => null,
    Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
    InteractionManager: {
      runAfterInteractions: (callback: () => void) => {
        callback();
        return { cancel: () => {} };
      },
    },
    ...overrides,
  });
  mockModule('lucide-react-native', iconProxy);
  mockModule('react-native-safe-area-context', {
    SafeAreaProvider: 'SafeAreaProvider',
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

export function loadRNTL(): typeof RNTL {
  return require('@testing-library/react-native/pure.js') as typeof RNTL;
}
