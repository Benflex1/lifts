import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TabRetention, useTabRetention } from '../../src/hooks/useTabRetention';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tab = 'workout' | 'history' | 'exercises' | 'analytics';

const LONG_WORKOUT_MS = 10 * 60 * 1000;

interface HarnessProps {
  visibleTab: Tab | null;
  onState: (state: TabRetention<Tab>) => void;
}

function Harness({ onState }: HarnessProps) {
  onState(
    useTabRetention<Tab>({
      initialTab: 'workout',
    }),
  );
  return null;
}

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 });
  let latest!: TabRetention<Tab>;
  const onState = (state: TabRetention<Tab>) => {
    latest = state;
  };
  const element = (visibleTab: Tab | null) => React.createElement(Harness, { visibleTab, onState });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element('workout'));
  });

  return {
    state: () => latest,
    update: (visibleTab: Tab | null) => {
      act(() => {
        renderer.update(element(visibleTab));
      });
    },
    mount: (tab: Tab) => {
      act(() => {
        latest.mountTab(tab);
      });
    },
    tick: (milliseconds = LONG_WORKOUT_MS) => {
      act(() => {
        t.mock.timers.tick(milliseconds);
      });
    },
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

test('useTabRetention mounts tabs on first visit and preserves visited tabs on repeated selection', t => {
  const harness = setup(t);

  assert.deepEqual([...harness.state().mountedTabs], ['workout']);
  const initial = harness.state().mountedTabs;
  harness.mount('workout');
  assert.equal(harness.state().mountedTabs, initial, 're-visiting a mounted tab keeps its state');

  harness.mount('history');
  harness.update('history');
  assert.deepEqual([...harness.state().mountedTabs].sort(), ['history', 'workout']);

  harness.tick();
  assert.ok(harness.state().mountedTabs.has('history'), 'visible tabs are never evicted');
  harness.unmount();
});

test('returning from a long logger session preserves the selected tab and its state', t => {
  const harness = setup(t);
  harness.mount('analytics');
  harness.update('analytics');
  harness.update(null);
  harness.tick();
  assert.ok(
    harness.state().mountedTabs.has('analytics'),
    'visited tab stays mounted behind logger',
  );
  harness.update('analytics');
  assert.ok(
    harness.state().mountedTabs.has('analytics'),
    'selected pane must be available on minimize',
  );
  harness.unmount();
});
