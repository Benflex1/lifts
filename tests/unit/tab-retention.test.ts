import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TabRetention, useTabRetention } from '../../src/hooks/useTabRetention';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tab = 'workout' | 'history' | 'exercises' | 'analytics';

const EVICTABLE_TABS: ReadonlySet<Tab> = new Set<Tab>(['history', 'analytics']);
const RETENTION_MS = 1_000;
const SWEEP_MS = 100;

interface HarnessProps {
  visibleTab: Tab | null;
  now: () => number;
  onState: (state: TabRetention<Tab>) => void;
}

function Harness({ visibleTab, now, onState }: HarnessProps) {
  onState(
    useTabRetention<Tab>({
      initialTab: 'workout',
      visibleTab,
      evictableTabs: EVICTABLE_TABS,
      retentionMs: RETENTION_MS,
      sweepMs: SWEEP_MS,
      now,
    }),
  );
  return null;
}

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const clock = { current: 0 };
  let latest!: TabRetention<Tab>;
  const onState = (state: TabRetention<Tab>) => {
    latest = state;
  };
  const element = (visibleTab: Tab | null) =>
    React.createElement(Harness, { visibleTab, now: () => clock.current, onState });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element('workout'));
  });

  return {
    clock,
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
    tick: (milliseconds = SWEEP_MS) => {
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

test('useTabRetention mounts tabs on first visit and never releases the visible one', t => {
  const harness = setup(t);

  assert.deepEqual([...harness.state().mountedTabs], ['workout']);
  const initial = harness.state().mountedTabs;
  harness.mount('workout');
  assert.equal(harness.state().mountedTabs, initial, 're-visiting a mounted tab keeps its state');

  harness.mount('history');
  harness.update('history');
  assert.deepEqual([...harness.state().mountedTabs].sort(), ['history', 'workout']);

  harness.clock.current += 10 * RETENTION_MS;
  harness.tick();
  assert.ok(harness.state().mountedTabs.has('history'), 'visible tabs are never evicted');
  harness.unmount();
});

test('useTabRetention releases a hidden evictable tab once the window has passed', t => {
  const harness = setup(t);

  harness.mount('history');
  harness.update('history');
  harness.update('workout'); // history is hidden from here on

  harness.clock.current = RETENTION_MS - 1;
  harness.tick();
  assert.ok(harness.state().mountedTabs.has('history'), 'kept inside the retention window');

  harness.clock.current = RETENTION_MS;
  harness.tick();
  assert.ok(!harness.state().mountedTabs.has('history'), 'released at the retention boundary');
  assert.ok(harness.state().mountedTabs.has('workout'));

  // The next visit mounts it again with a fresh retention clock.
  harness.mount('history');
  assert.ok(harness.state().mountedTabs.has('history'));
  harness.unmount();
});

test('useTabRetention keeps non-evictable tabs mounted however long they stay hidden', t => {
  const harness = setup(t);

  harness.mount('history');
  harness.update('history'); // workout is hidden but not evictable

  harness.clock.current = 60 * RETENTION_MS;
  harness.tick();
  harness.tick();
  assert.deepEqual([...harness.state().mountedTabs].sort(), ['history', 'workout']);

  harness.update('workout');
  harness.clock.current = 120 * RETENTION_MS;
  harness.tick();
  assert.ok(!harness.state().mountedTabs.has('history'), 'evictable tabs still age out');
  assert.ok(harness.state().mountedTabs.has('workout'));
  harness.unmount();
});

test('useTabRetention cancels the release when the tab is revisited in time', t => {
  const harness = setup(t);

  harness.mount('history');
  harness.update('history');
  harness.update('workout');

  harness.clock.current = RETENTION_MS - 1;
  harness.update('history'); // back before the deadline resets the clock

  harness.clock.current = 10 * RETENTION_MS;
  harness.tick();
  harness.tick();
  assert.ok(harness.state().mountedTabs.has('history'), 'the pending release was cancelled');
  harness.unmount();
});

test('useTabRetention also ages out a tab hidden behind the workout logger', t => {
  const harness = setup(t);

  harness.mount('history');
  harness.update('history');
  harness.update(null); // the logger takes over the screen

  harness.clock.current = RETENTION_MS;
  harness.tick();
  assert.ok(!harness.state().mountedTabs.has('history'), 'released while the logger was open');
  harness.unmount();
});
