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

const platform = { OS: 'web' as string };
let backHandler: (() => boolean) | null = null;
let backHandlerRemoved = false;

mockModule('react-native', {
  Platform: platform,
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      backHandler = handler;
      return {
        remove: () => {
          backHandler = null;
          backHandlerRemoved = true;
        },
      };
    },
  },
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeWindow {
  location: { hash: string };
  history: {
    pushState: unknown;
    replaceState: unknown;
  };
  addEventListener: unknown;
  removeEventListener: unknown;
}

function createFakeWindow(initialHash: string) {
  const pushed: string[] = [];
  const replaced: string[] = [];
  const listeners = new Set<() => void>();
  const fake = {
    location: { hash: initialHash },
    history: {
      pushState: (_state: unknown, _title: string, url: string) => {
        pushed.push(url);
        fake.location.hash = url;
      },
      replaceState: (_state: unknown, _title: string, url: string) => {
        replaced.push(url);
        fake.location.hash = url;
      },
    },
    addEventListener: (event: string, handler: () => void) => {
      if (event === 'popstate') listeners.add(handler);
    },
    removeEventListener: (event: string, handler: () => void) => {
      if (event === 'popstate') listeners.delete(handler);
    },
  };
  (globalThis as { window?: FakeWindow }).window = fake as unknown as FakeWindow;
  return {
    fake,
    pushed,
    replaced,
    listeners,
    firePopState: () => listeners.forEach(listener => listener()),
  };
}

test('tab hashes parse both deep-link spellings and reject unknown tabs (ARCH-09)', async () => {
  const { tabFromHash, hashForTab } = await import('../../src/navigation/tabRoutes');

  assert.equal(tabFromHash('#/history'), 'history');
  assert.equal(tabFromHash('#exercises'), 'exercises');
  assert.equal(tabFromHash('analytics'), 'analytics');
  assert.equal(tabFromHash('#/WORKOUT'), 'workout');
  assert.equal(tabFromHash('#/settings'), null);
  assert.equal(tabFromHash(''), null);
  assert.equal(hashForTab('analytics'), '#/analytics');
});

test('web tab history links the URL, deep links, and browser navigation (PROD-05)', async () => {
  const { useWebTabHistory } = await import('../../src/navigation/useWebTabHistory');
  platform.OS = 'web';

  const selections: string[] = [];
  const Probe: React.FC<{ tab: 'workout' | 'history' | 'analytics' }> = ({ tab }) => {
    useWebTabHistory({ tab, onSelectTab: next => selections.push(next) });
    return null;
  };

  // Tab change pushes a history entry.
  const env = createFakeWindow('#/workout');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe, { tab: 'workout' }));
  });
  act(() => {
    renderer.update(React.createElement(Probe, { tab: 'analytics' }));
  });
  assert.deepEqual(env.pushed, ['#/analytics']);

  // Browser back/forward selects the tab from the URL without pushing again.
  env.fake.location.hash = '#/history';
  act(() => {
    env.firePopState();
  });
  assert.deepEqual(selections, ['history']);
  assert.deepEqual(env.pushed, ['#/analytics']);

  act(() => {
    renderer.unmount();
  });
  assert.equal(env.listeners.size, 0, 'the popstate listener is removed on unmount');

  // A deep link on load selects the requested tab.
  selections.length = 0;
  const deepLink = createFakeWindow('#/analytics');
  act(() => {
    TestRenderer.create(React.createElement(Probe, { tab: 'workout' }));
  });
  assert.deepEqual(selections, ['analytics']);
  assert.deepEqual(deepLink.replaced, [], 'a valid deep link is not rewritten');

  // An empty URL is normalised to the current tab without adding history.
  selections.length = 0;
  const blank = createFakeWindow('');
  act(() => {
    TestRenderer.create(React.createElement(Probe, { tab: 'workout' }));
  });
  assert.deepEqual(blank.replaced, ['#/workout']);
  assert.deepEqual(selections, []);
});

test('non-web platforms do not touch the URL (ARCH-09)', async () => {
  const { useWebTabHistory } = await import('../../src/navigation/useWebTabHistory');
  platform.OS = 'android';
  const env = createFakeWindow('');

  const Probe: React.FC = () => {
    useWebTabHistory({ tab: 'history', onSelectTab: () => {} });
    return null;
  };
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });

  assert.deepEqual(env.replaced, []);
  assert.deepEqual(env.pushed, []);
});

test('Android back returns to Workout from a secondary tab (ARCH-09)', async () => {
  const { useAndroidBackToWorkout } = await import('../../src/navigation/useAndroidBackToWorkout');
  platform.OS = 'android';
  backHandler = null;
  backHandlerRemoved = false;

  const selections: string[] = [];
  const Probe: React.FC<{ tab: 'workout' | 'history' }> = ({ tab }) => {
    useAndroidBackToWorkout(tab, next => selections.push(next));
    return null;
  };

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe, { tab: 'history' }));
  });
  assert.ok(backHandler, 'the shell registers a back handler');
  let handled = false;
  act(() => {
    handled = (backHandler as () => boolean)();
  });
  assert.equal(handled, true);
  assert.deepEqual(selections, ['workout']);

  act(() => {
    renderer.update(React.createElement(Probe, { tab: 'workout' }));
  });
  handled = false;
  act(() => {
    handled = (backHandler as () => boolean)();
  });
  assert.equal(handled, false, 'Workout lets the platform exit the app');
  assert.deepEqual(selections, ['workout']);

  act(() => {
    renderer.unmount();
  });
  assert.equal(backHandlerRemoved, true);
});

test('iOS does not register Android back handling (ARCH-09)', async () => {
  const { useAndroidBackToWorkout } = await import('../../src/navigation/useAndroidBackToWorkout');
  platform.OS = 'ios';
  backHandler = null;

  const Probe: React.FC = () => {
    useAndroidBackToWorkout('history', () => {});
    return null;
  };
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  assert.equal(backHandler, null);
});
