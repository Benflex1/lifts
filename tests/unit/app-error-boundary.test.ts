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

// The boundary renders React Native host components; Node tests only need
// elements, not a real renderer, so the RN surface is stubbed.
mockModule('react-native', {
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Platform: { OS: 'web' },
});

let boundaryModulePromise: Promise<typeof import('../../src/components/AppErrorBoundary')> | null =
  null;
function loadBoundaryModule() {
  boundaryModulePromise ??= import('../../src/components/AppErrorBoundary');
  return boundaryModulePromise;
}

function collectText(node: unknown, acc: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return acc;
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node));
    return acc;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, acc);
    return acc;
  }
  if (typeof node === 'object') {
    const props = (node as { props?: { children?: unknown } }).props;
    if (props) collectText(props.children, acc);
  }
  return acc;
}

test('AppErrorBoundary derives error state from a thrown render error', async () => {
  const { AppErrorBoundary } = await loadBoundaryModule();
  const error = new Error('render exploded');

  const derived = AppErrorBoundary.getDerivedStateFromError(error);

  assert.equal(derived.error, error);
});

test('AppErrorBoundary renders a recovery fallback instead of the crashed tree', async () => {
  const { AppErrorBoundary } = await loadBoundaryModule();
  const boundary = new AppErrorBoundary({ label: 'History', children: null });
  (boundary as unknown as { state: { error: Error | null } }).state = {
    error: new Error('render exploded'),
  };

  const text = collectText(boundary.render());

  assert.ok(text.includes('Something went wrong'));
  assert.ok(text.some(value => value.includes('render exploded')));
  assert.ok(text.includes('Try Again'));
  assert.ok(text.includes('Reload App'), 'web recovery offers a reload');
});

test('AppErrorBoundary renders the fallback when a child throws during render', async () => {
  const { AppErrorBoundary } = await loadBoundaryModule();
  const React = await import('react');

  function ExplodingChild(): never {
    throw new Error('child render exploded');
  }

  const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const originalConsoleError = console.error;
  // React logs caught render errors; the assertion below is about the fallback output.
  console.error = () => {};

  try {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(
          AppErrorBoundary,
          { label: 'History', children: null },
          React.createElement(ExplodingChild),
        ),
      );
    });

    const tree = JSON.stringify(renderer.toJSON());
    assert.match(tree, /Something went wrong/);
    assert.match(tree, /child render exploded/);
    assert.match(tree, /Try Again/);
  } finally {
    console.error = originalConsoleError;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment;
  }
});

test('AppErrorBoundary records the crash with scope and component stack', async () => {
  const { AppErrorBoundary } = await loadBoundaryModule();
  const { clearErrorBreadcrumbs, getErrorBreadcrumbs, setErrorSink } =
    await import('../../src/utils/errorReporting');
  clearErrorBreadcrumbs();

  let reportedScope: string | null = null;
  let reportedStack: unknown = null;
  setErrorSink((_error, context) => {
    reportedScope = context.scope;
    reportedStack = context.componentStack;
  });

  const error = new Error('kaboom');
  const boundary = new AppErrorBoundary({ label: 'Analytics', children: null });
  boundary.componentDidCatch(error, { componentStack: 'at AnalyticsScreen' });

  assert.equal(reportedScope, 'render.Analytics');
  assert.equal(reportedStack, 'at AnalyticsScreen');
  assert.equal(getErrorBreadcrumbs()[0].error, error);

  setErrorSink(null);
  clearErrorBreadcrumbs();
});

test('AppErrorBoundary clears the error when the reset key changes', async () => {
  const { AppErrorBoundary } = await loadBoundaryModule();
  const error = new Error('old tab state');

  const cleared = AppErrorBoundary.getDerivedStateFromProps(
    { label: 'History', resetKey: 'workout', children: null },
    { error, resetKey: 'history' },
  );

  assert.deepEqual(cleared, { resetKey: 'workout', error: null });

  const unchanged = AppErrorBoundary.getDerivedStateFromProps(
    { label: 'History', resetKey: 'history', children: null },
    { error, resetKey: 'history' },
  );
  assert.equal(unchanged, null);
});
