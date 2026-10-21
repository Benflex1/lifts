import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import { installReactNativeMock, mockModule } from '../helpers/rntlHarness';

/**
 * PERF-09 verification. React Native's own FlatList is Flow-typed source and
 * cannot load under Node, so the mount count is measured against a real
 * virtualized list implementation (react-native-web's) rendering in jsdom.
 * The RecordsView keeps its native FlatList window configuration asserted in
 * the same test, so both the implementation and the intent are covered.
 */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});

Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, 'HTMLElement', {
  value: dom.window.HTMLElement,
  configurable: true,
});
Object.defineProperty(globalThis, 'getComputedStyle', {
  value: dom.window.getComputedStyle.bind(dom.window),
  configurable: true,
});
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  value: dom.window.requestAnimationFrame.bind(dom.window),
  configurable: true,
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  value: dom.window.cancelAnimationFrame.bind(dom.window),
  configurable: true,
});
for (const name of [
  'ShadowRoot',
  'Element',
  'Node',
  'Document',
  'DocumentFragment',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'HTMLIFrameElement',
  'CSSStyleSheet',
] as const) {
  Object.defineProperty(globalThis, name, {
    value: (dom.window as unknown as Record<string, unknown>)[name],
    configurable: true,
  });
}

const flatListProps: Record<string, unknown>[] = [];
const rnWeb = require('react-native-web') as Record<string, unknown>;
installReactNativeMock({
  ...rnWeb,
  FlatList: (props: Record<string, unknown>) => {
    flatListProps.push(props);
    return React.createElement(rnWeb.FlatList as React.ComponentType, props);
  },
});

const svgIcon = () => React.createElement('span');
mockModule('lucide-react-native', new Proxy({}, { get: () => svgIcon }));

const { buildTrophyRoomSummary, filterTrophyRecords } =
  require('../../src/workout/trophy-room') as typeof import('../../src/workout/trophy-room');
const { RecordsView } =
  require('../../src/components/RecordsView') as typeof import('../../src/components/RecordsView');

const RECORD_COUNT = 500;

function makeDataset() {
  const exercises = Array.from({ length: RECORD_COUNT }, (_, index) => ({
    id: `ex-${index}`,
    name: `Exercise ${index}`,
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    equipment: 'barbell',
    instructions: [],
    difficulty: 'intermediate',
    category: 'strength',
  }));
  const workouts = exercises.map((exercise, index) => ({
    id: `w-${index}`,
    name: 'Session',
    gymId: 'g1',
    startTime: new Date(2026, 0, 1, 10, 0, index % 60).toISOString(),
    durationSeconds: 1800,
    totalVolumeKg: 1000,
    exercises: [
      {
        id: `ae-${index}`,
        exerciseId: exercise.id,
        exercise,
        restTimerSeconds: 90,
        sets: [
          {
            id: `s-${index}`,
            setNumber: 1,
            type: 'normal',
            weightKg: 100,
            reps: 5,
            isCompleted: true,
          },
        ],
      },
    ],
  }));
  return { exercises, workouts };
}

test('records list mounts only a window of a 500-record dataset (PERF-09)', async () => {
  const { exercises, workouts } = makeDataset();
  const overview = buildTrophyRoomSummary(
    workouts as never,
    exercises as never,
    [],
    false,
    undefined,
    {
      includeMedalCounts: false,
    },
  );
  const filtered = {
    ...overview,
    records: filterTrophyRecords(overview.records, {}),
  };
  assert.equal(filtered.records.length, RECORD_COUNT);

  const noop = () => {};
  const { createRoot } = require('react-dom/client') as {
    createRoot: (container: Element) => {
      render: (element: React.ReactElement) => void;
      unmount: () => void;
    };
  };
  const { act } = require('react') as typeof import('react');

  const container = dom.window.document.getElementById('root');
  assert.ok(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(RecordsView, {
        overview,
        filtered,
        unit: 'kg',
        gyms: [],
        gymTrackingEnabled: false,
        selectedGymId: null,
        onSelectGym: noop,
        category: 'all',
        onSelectCategory: noop,
        search: '',
        onChangeSearch: noop,
        onOpenRecord: noop,
      } as never),
    );
  });

  const rows = dom.window.document.querySelectorAll('[data-testid="record-row"]');
  assert.equal(
    rows.length,
    12,
    `only the initial window (12) should mount, but ${rows.length} of ${RECORD_COUNT} rows mounted`,
  );

  const config = flatListProps.at(-1);
  assert.ok(config, 'the records list renders through FlatList');
  assert.equal(config.initialNumToRender, 12);
  assert.equal(config.maxToRenderPerBatch, 12);
  assert.equal(config.windowSize, 7);
  assert.equal((config.data as unknown[]).length, RECORD_COUNT);

  await act(async () => {
    root.unmount();
  });
});
