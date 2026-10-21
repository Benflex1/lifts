import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ExerciseRecordSummary } from '../../src/workout/trophy-room';

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
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  StyleSheet: { create: (styles: unknown) => styles },
});
mockModule('lucide-react-native', iconProxy);
mockModule('../../src/components/ui', { Chip: 'Chip', PRMark: 'PRMark' });

const noop = () => {};

function makeRecord(id: string, name: string): ExerciseRecordSummary {
  return {
    exerciseId: id,
    exerciseName: name,
    category: 'chest',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
    bestWeight: { value: 100, reps: 5, date: '2026-10-01T00:00:00.000Z' },
    bestReps: { value: 12, date: '2026-10-02T00:00:00.000Z' },
  };
}

async function loadRow() {
  const module = await import('../../src/components/RecordsView');
  const renders: string[] = [];
  const Counted = React.memo(
    function CountedRow(props: any) {
      renders.push(props.record.exerciseId);
      return React.createElement(module.RecordRow, props);
    },
    (prev: any, next: any) => {
      // Mirrors React.memo's default shallow comparison over the props RecordRow receives.
      const keys = ['record', 'unit', 'showDivider', 'isFirst', 'isLast', 'onOpen'] as const;
      return keys.every(key => prev[key] === next[key]);
    },
  );
  return { module, Counted, renders };
}

function RowHarness({
  records,
  Counted,
}: {
  records: ExerciseRecordSummary[];
  Counted: React.ComponentType<any>;
}) {
  return React.createElement(
    React.Fragment,
    null,
    records.map((record, index) =>
      React.createElement(Counted, {
        key: record.exerciseId,
        record,
        unit: 'kg',
        showDivider: index < records.length - 1,
        isFirst: index === 0,
        isLast: index === records.length - 1,
        onOpen: noop,
      }),
    ),
  );
}

test('RecordRow is wrapped in React.memo', async () => {
  const { module } = await loadRow();
  const memoType = Symbol.for('react.memo');
  assert.equal((module.RecordRow as any).$$typeof, memoType, 'RecordRow must be memoized');
});

test('replacing one record re-renders only that row', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { Counted, renders } = await loadRow();

  const alpha = makeRecord('alpha', 'Alpha Press');
  const beta = makeRecord('beta', 'Beta Row');
  const gamma = makeRecord('gamma', 'Gamma Squat');
  const delta = makeRecord('delta', 'Delta Deadlift');

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(RowHarness, { records: [alpha, beta, gamma, delta], Counted }),
    );
  });
  assert.deepEqual(renders, ['alpha', 'beta', 'gamma', 'delta']);

  renders.length = 0;
  // A record is recomputed (e.g. a new PR) with list positions unchanged.
  const betaUpdated = makeRecord('beta', 'Beta Row');
  act(() => {
    renderer.update(
      React.createElement(RowHarness, { records: [alpha, betaUpdated, gamma, delta], Counted }),
    );
  });

  assert.deepEqual(renders, ['beta'], 'only the row with a changed record re-rendered');
});

test('filtering the list leaves unchanged middle rows untouched', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { Counted, renders } = await loadRow();

  const alpha = makeRecord('alpha', 'Alpha Press');
  const beta = makeRecord('beta', 'Beta Row');
  const gamma = makeRecord('gamma', 'Gamma Squat');
  const delta = makeRecord('delta', 'Delta Deadlift');

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(RowHarness, { records: [alpha, beta, gamma, delta], Counted }),
    );
  });

  renders.length = 0;
  // A debounced search drops delta. All surviving record objects keep their
  // identity; only gamma changes position-derived props (it becomes the last row).
  act(() => {
    renderer.update(React.createElement(RowHarness, { records: [alpha, beta, gamma], Counted }));
  });

  assert.deepEqual(renders, ['gamma'], 'unchanged middle rows must skip re-rendering');
});
