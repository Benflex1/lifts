import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ActiveExercise, Gym, Workout, WorkoutHistorySummary, WorkoutSet } from '../../src/types';
import { PRAchievement, SetPRResult, WorkoutPRSummary } from '../../src/workout/pr';
import { formatDuration } from '../../src/utils/calculator';
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
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles },
});
mockModule('lucide-react-native', iconProxy);
mockModule('../../src/components/PRBadge', { PRBadge: 'PRBadge' });
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

const item: WorkoutHistorySummary = {
  id: 'w1',
  name: 'Push Day',
  gymId: 'g1',
  startTime: new Date(2024, 5, 15, 12, 0, 0).toISOString(),
  durationSeconds: 3600,
  totalVolumeKg: 2500,
  totalSets: 12,
  exerciseNames: ['Bench Press', 'Incline Press'],
};

const gym: Gym = {
  id: 'g1',
  name: 'Home Gym',
  isDefault: false,
  color: '#ff0000',
  createdAt: '2024-01-01T00:00:00.000Z',
};

function makeActiveExercise(
  id: string,
  name: string,
  overrides: Partial<ActiveExercise> = {},
): ActiveExercise {
  return {
    id,
    exerciseId: `ex-${id}`,
    exercise: {
      id: `ex-${id}`,
      name,
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
    },
    restTimerSeconds: 90,
    sets: [],
    ...overrides,
  };
}

function makeSet(id: string, setNumber: number, overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    setNumber,
    type: 'normal',
    weightKg: 100,
    reps: 5,
    isCompleted: true,
    ...overrides,
  };
}

function makeDetail(): Workout {
  return {
    id: 'w1',
    name: 'Push Day',
    gymId: 'g1',
    startTime: item.startTime,
    durationSeconds: 3600,
    totalVolumeKg: 2500,
    exercises: [
      makeActiveExercise('ae1', 'Bench Press', {
        supersetId: 'ss1',
        notes: 'Slow eccentric',
        sets: [
          makeSet('s1', 1, { weightKg: 100, reps: 5, rpe: 8 }),
          makeSet('s2', 2, { weightKg: 200, reps: 1, isCompleted: false }),
        ],
      }),
      makeActiveExercise('ae2', 'Incline Press', {
        supersetId: 'ss1',
        sets: [makeSet('s3', 1, { weightKg: 60, reps: 10 })],
      }),
    ],
  };
}

function makePRSummary(): WorkoutPRSummary {
  const achievement: PRAchievement = {
    rank: 1,
    metric: 'weight',
    scope: 'gym',
    value: 100,
    previousRecord: 95,
  };
  const setPR: SetPRResult = { setId: 's1', primary: achievement, achievements: [achievement] };
  return {
    workoutId: 'w1',
    setPRs: new Map([['s1', setPR]]),
    achievements: [],
    goldCount: 1,
    silverCount: 0,
    bronzeCount: 0,
    totalCount: 1,
  };
}

function makeProps(events: string[] = [], overrides: Record<string, unknown> = {}) {
  return {
    item,
    isExpanded: false,
    detail: undefined,
    prSummary: undefined,
    isLoadingDetail: false,
    gymTrackingEnabled: true,
    gym,
    unit: 'kg' as const,
    onToggleExpand: (workoutId: string) => events.push(`toggle:${workoutId}`),
    onOpenMenu: (summary: WorkoutHistorySummary) => events.push(`menu:${summary.id}`),
    onEditWorkout: (detail: Workout) => events.push(`edit:${detail.id}`),
    onShowSetPR: (exerciseName: string, setNumber: number) =>
      events.push(`pr:${exerciseName}:${setNumber}`),
    ...overrides,
  };
}

test('HistoryCard renders the collapsed summary and forwards its actions', async () => {
  const { HistoryCard } = await import('../../src/screens/history/HistoryCard');

  const events: string[] = [];
  const renderer = render(React.createElement(HistoryCard, makeProps(events) as any));
  const texts = allTexts(renderer);

  assert.ok(texts.includes('Sat, Jun 15'), 'shows the formatted date');
  assert.ok(texts.includes('Push Day'), 'shows the workout name');
  assert.ok(texts.includes('Home Gym'), 'shows the gym tag');
  assert.ok(texts.includes(formatDuration(3600)), 'shows the duration');
  assert.ok(texts.includes(formatWeight(2500, 'kg')), 'shows the volume');
  assert.ok(texts.includes('12 sets'), 'shows the set count');
  assert.ok(texts.includes('Bench Press · Incline Press'), 'shows the collapsed preview');
  assert.ok(!texts.includes('#1'), 'does not render set pills while collapsed');

  pressByLabel(renderer, 'Push Day, show details');
  pressByLabel(renderer, 'Push Day options');
  assert.deepEqual(events, ['toggle:w1', 'menu:w1']);
});

test('HistoryCard hides the gym tag when tracking is off and shows the spinner while loading', async () => {
  const { HistoryCard } = await import('../../src/screens/history/HistoryCard');

  const renderer = render(
    React.createElement(
      HistoryCard,
      makeProps([], {
        isExpanded: true,
        isLoadingDetail: true,
        gymTrackingEnabled: false,
      }) as any,
    ),
  );

  const texts = allTexts(renderer);
  assert.ok(!texts.includes('Home Gym'));
  assert.ok(!texts.includes('Edit Workout'));
  assert.equal(renderer.root.findAllByType('ActivityIndicator' as any).length, 1);
});

test('HistoryCard renders the expanded detail, PR badge, and edit action', async () => {
  const { HistoryCard } = await import('../../src/screens/history/HistoryCard');

  const events: string[] = [];
  const detail = makeDetail();
  const renderer = render(
    React.createElement(
      HistoryCard,
      makeProps(events, { isExpanded: true, detail, prSummary: makePRSummary() }) as any,
    ),
  );
  const texts = allTexts(renderer);

  assert.ok(texts.includes('Bench Press'));
  assert.ok(texts.includes('Incline Press'));
  assert.ok(texts.includes('SUPERSET A'), 'shows the superset grouping');
  assert.ok(texts.includes('Note: Slow eccentric'));
  assert.equal(texts.filter(text => text === '#1').length, 2, 'renders one pill per completed set');
  assert.ok(texts.includes(`${formatWeight(100, 'kg')} × 5`));
  assert.ok(texts.includes('RPE 8'));
  assert.ok(!texts.includes(`${formatWeight(200, 'kg')} × 1`), 'excludes incomplete sets');
  assert.ok(texts.includes('1 PR'), 'shows the PR count metric');

  const badge = renderer.root.findByType('PRBadge' as any);
  assert.equal(badge.props.achievement.rank, 1);
  act(() => {
    badge.props.onPress();
  });

  pressByLabel(renderer, 'Hide details');
  act(() => {
    const edit = renderer.root.findAll(
      node => node.props?.accessibilityRole === 'button' && textOf(node) === 'Edit Workout',
    );
    assert.equal(edit.length, 1);
    edit[0].props.onPress();
  });

  assert.deepEqual(events, ['pr:Bench Press:1', 'toggle:w1', 'edit:w1']);
});

test('HistoryCard falls back to the exercise-name list when a detail is unavailable', async () => {
  const { HistoryCard } = await import('../../src/screens/history/HistoryCard');

  const renderer = render(
    React.createElement(HistoryCard, makeProps([], { isExpanded: true }) as any),
  );
  const texts = allTexts(renderer);

  assert.ok(texts.includes('Bench Press • Incline Press'));
  assert.ok(!texts.includes('Edit Workout'));
});
