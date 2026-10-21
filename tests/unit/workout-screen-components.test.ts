import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Exercise, Routine, RoutineExercise } from '../../src/types';
import { WeekSnapshot } from '../../src/workout/week-summary';
import { formatWeight } from '../../src/utils/units';

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
  StyleSheet: { create: (styles: unknown) => styles },
});
mockModule('lucide-react-native', iconProxy);
mockModule('../../src/components/ui', { IconButton: 'IconButton' });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = TestRenderer.ReactTestRenderer;

function render(element: React.ReactElement): Renderer {
  let renderer!: Renderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'children' in node) {
    return textOf((node as { children: unknown }).children);
  }
  return '';
}

function allTexts(renderer: Renderer): string[] {
  return renderer.root.findAllByType('Text' as any).map(inst => textOf(inst));
}

function pressByLabel(renderer: Renderer, label: string): void {
  const nodes = renderer.root.findAll(node => node.props?.accessibilityLabel === label);
  assert.ok(nodes.length > 0, `no pressable with accessibility label "${label}"`);
  act(() => {
    nodes[0].props.onPress();
  });
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function makeWeek(overrides: Partial<WeekSnapshot> = {}): WeekSnapshot {
  return {
    days: DAY_LABELS.map((label, index) => ({
      label,
      dateKey: `2024-06-1${index}`,
      trained: index === 0,
      isToday: index === 1,
      isFuture: false,
    })),
    workouts: 3,
    volumeKg: 2500,
    durationSeconds: 5400,
    streakWeeks: 4,
    ...overrides,
  };
}

function makeExercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    category: 'strength',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
  };
}

function makeRoutineExercise(
  id: string,
  name: string,
  overrides: Partial<RoutineExercise> = {},
): RoutineExercise {
  return {
    id,
    exerciseId: `ex-${id}`,
    exercise: makeExercise(`ex-${id}`, name),
    orderIndex: 0,
    targetSets: 3,
    targetReps: '8-12',
    restTimerSeconds: 90,
    ...overrides,
  };
}

function makeRoutine(id: string, name: string, overrides: Partial<Routine> = {}): Routine {
  return {
    id,
    name,
    exercises: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('WeekSummaryCard renders the streak, day dots, and stats', async () => {
  const { WeekSummaryCard } = await import('../../src/screens/workout/WeekSummaryCard');

  const renderer = render(React.createElement(WeekSummaryCard, { week: makeWeek(), unit: 'kg' }));
  const texts = allTexts(renderer);

  assert.ok(texts.includes('This week'));
  assert.ok(texts.includes('4 week streak'));
  assert.ok(texts.includes('3'), 'shows the workout count');
  assert.ok(texts.includes('workouts'));
  assert.ok(texts.includes(formatWeight(2500, 'kg')), 'shows the volume');
  assert.ok(texts.includes('volume'));
  assert.ok(texts.includes('1.5h'), 'shows the trained time');
  assert.ok(texts.includes('trained'));
  assert.equal(renderer.root.findAllByType('Check' as any).length, 1, 'marks the trained day');
});

test('WeekSummaryCard uses singular labels and drops the streak pill for the first week', async () => {
  const { WeekSummaryCard } = await import('../../src/screens/workout/WeekSummaryCard');

  const renderer = render(
    React.createElement(WeekSummaryCard, {
      week: makeWeek({ workouts: 1, streakWeeks: 1 }),
      unit: 'kg',
    }),
  );
  const texts = allTexts(renderer);

  assert.ok(texts.includes('workout'));
  assert.ok(!texts.includes('workouts'));
  assert.ok(!texts.some(text => text.includes('week streak')));
});

test('RoutineCard renders the summary tags and forwards its actions', async () => {
  const { RoutineCard } = await import('../../src/screens/workout/RoutineCard');

  const events: string[] = [];
  const routine = makeRoutine('r1', 'Push Day', {
    folderName: 'Push',
    exercises: [
      makeRoutineExercise('re1', 'Bench Press', { supersetId: 'ss1', targetSets: 3 }),
      makeRoutineExercise('re2', 'Incline Press', { supersetId: 'ss1', targetSets: 4 }),
    ],
  });

  const renderer = render(
    React.createElement(RoutineCard, {
      routine,
      showFolderTag: true,
      onOpenMenu: (r: Routine) => events.push(`menu:${r.id}`),
      onStart: (r: Routine) => events.push(`start:${r.id}`),
    }),
  );
  const texts = allTexts(renderer);

  assert.ok(texts.includes('Push Day'));
  assert.ok(texts.includes('2 exercises · 7 sets'));
  assert.ok(texts.includes('Push'), 'shows the folder tag');
  assert.ok(texts.includes('Supersets'), 'shows the superset tag');
  assert.ok(texts.includes('Bench Press · Incline Press'), 'shows the exercise preview');

  pressByLabel(renderer, 'Start Push Day');
  pressByLabel(renderer, 'Push Day options');
  assert.deepEqual(events, ['start:r1', 'menu:r1']);
});

test('RoutineCard hides the folder tag outside All and pluralizes one exercise', async () => {
  const { RoutineCard } = await import('../../src/screens/workout/RoutineCard');

  const routine = makeRoutine('r2', 'Accessory', {
    folderName: 'Push',
    exercises: [makeRoutineExercise('re3', 'Curl', { targetSets: 3 })],
  });

  const renderer = render(
    React.createElement(RoutineCard, {
      routine,
      showFolderTag: false,
      onOpenMenu: () => {},
      onStart: () => {},
    }),
  );
  const texts = allTexts(renderer);

  assert.ok(texts.includes('1 exercise · 3 sets'));
  assert.ok(!texts.includes('Push'), 'hides the folder tag outside the All view');
  assert.ok(!texts.includes('Supersets'));
});
