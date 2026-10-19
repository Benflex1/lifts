import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ActiveExercise, WorkoutSet } from '../../src/types';
import { PRAchievement, SetPRResult, WorkoutPRSummary } from '../../src/workout/pr';

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
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  Platform: { OS: 'web' },
  StyleSheet: { create: (styles: unknown) => styles },
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
});
mockModule('lucide-react-native', iconProxy);
mockModule('../../src/context/WorkoutContext', { useWorkoutClock: () => 90 });
mockModule('../../src/components/ActiveExerciseCard', { ActiveExerciseCard: 'ActiveExerciseCard' });

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
  return renderer.root.findAllByType('Text' as any).map((inst) => textOf(inst));
}

function pressByLabel(renderer: Renderer, label: string): void {
  const nodes = renderer.root.findAll((node) => node.props?.accessibilityLabel === label);
  assert.ok(nodes.length > 0, `no pressable with accessibility label "${label}"`);
  act(() => {
    nodes[0].props.onPress();
  });
}

/** Nearest ancestor (or self) that handles presses, found from an exact label match. */
function pressByText(renderer: Renderer, text: string): void {
  const node = pressableByText(renderer, text);
  act(() => {
    node.props.onPress();
  });
}

function pressableByText(renderer: Renderer, text: string): TestRenderer.ReactTestInstance {
  const textNode = renderer.root
    .findAllByType('Text' as any)
    .find((inst) => textOf(inst) === text);
  assert.ok(textNode, `no text "${text}"`);
  let node: TestRenderer.ReactTestInstance | null = textNode;
  while (node && typeof node.props?.onPress !== 'function') {
    node = node.parent;
  }
  assert.ok(node, `no pressable ancestor for "${text}"`);
  return node;
}

function makeSet(id: string, setNumber: number, overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    setNumber,
    type: 'normal',
    weightKg: 100,
    reps: 5,
    isCompleted: false,
    ...overrides,
  };
}

function makeActiveExercise(overrides: Partial<ActiveExercise> = {}): ActiveExercise {
  return {
    id: 'ae1',
    exerciseId: 'ex1',
    exercise: {
      id: 'ex1',
      name: 'Bench Press',
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
    },
    restTimerSeconds: 90,
    targetReps: '8-12',
    sets: [makeSet('s1', 1), makeSet('s2', 2), makeSet('s3', 3)],
    ...overrides,
  };
}

function makeCardHandlers(events: string[]) {
  return {
    onToggleExpanded: (id: string) => events.push(`toggle:${id}`),
    onCommitNotes: (id: string) => events.push(`notes:${id}`),
    onOpenDetail: () => events.push('detail'),
    onOpenMenu: () => events.push('menu'),
    onOpenRestWheel: () => events.push('restWheel'),
    onStartEditingNote: () => events.push('editNote'),
    onUpdateSet: () => events.push('updateSet'),
    onRemoveSet: () => events.push('removeSet'),
    onAddSet: () => events.push('addSet'),
    onToggleSet: (id: string) => events.push(`toggleSet:${id}`),
    onApplyPrevious: () => events.push('applyPrevious'),
    onOpenSetOptions: () => events.push('setOptions'),
    onInputFocus: () => events.push('inputFocus'),
  };
}

test('WorkoutHeader renders live metrics and wires header actions', async () => {
  const { WorkoutHeader } = await import('../../src/screens/activeWorkout/WorkoutHeader');
  const { formatTimer } = await import('../../src/utils/calculator');
  const { formatWeight } = await import('../../src/utils/units');

  const calls: string[] = [];
  const props = {
    workoutName: 'Push Day',
    gymName: 'Downtown Gym',
    showGym: true,
    isFinishing: false,
    unit: 'kg',
    liveVolume: 1250,
    completedSetsCount: 6,
    totalSetsCount: 10,
    topInset: 44,
    onMinimize: () => calls.push('minimize'),
    onOpenMenu: () => calls.push('menu'),
    onFinish: () => calls.push('finish'),
    onOpenDuration: () => calls.push('duration'),
  };

  const renderer = render(React.createElement(WorkoutHeader, props as any));
  const texts = allTexts(renderer);

  assert.ok(texts.includes('Push Day'), 'shows the workout name');
  assert.ok(texts.includes('Downtown Gym'), 'shows the gym name');
  assert.ok(texts.includes(formatTimer(90)), 'shows the live clock');
  assert.ok(texts.includes(formatWeight(1250, 'kg')), 'shows live volume');
  assert.ok(texts.includes('6 / 10'), 'shows completed and total sets');
  assert.ok(texts.includes('Duration') && texts.includes('Volume') && texts.includes('Sets'));

  pressByLabel(renderer, 'Minimize workout');
  pressByLabel(renderer, 'Workout menu');
  pressByLabel(renderer, 'Finish workout');
  pressByLabel(renderer, 'Adjust workout duration');
  assert.deepEqual(calls, ['minimize', 'menu', 'finish', 'duration']);
});

test('WorkoutHeader shows the saving state and hides the gym row when tracking is off', async () => {
  const { WorkoutHeader } = await import('../../src/screens/activeWorkout/WorkoutHeader');

  const props = {
    workoutName: 'Push Day',
    gymName: 'Downtown Gym',
    showGym: false,
    isFinishing: true,
    unit: 'kg',
    liveVolume: 0,
    completedSetsCount: 0,
    totalSetsCount: 0,
    topInset: 0,
    onMinimize: () => {},
    onOpenMenu: () => {},
    onFinish: () => {},
    onOpenDuration: () => {},
  };

  const renderer = render(React.createElement(WorkoutHeader, props as any));
  const texts = allTexts(renderer);

  assert.ok(texts.includes('Saving...'));
  assert.ok(!texts.includes('Finish'));
  assert.ok(!texts.includes('Downtown Gym'));

  const finish = renderer.root.findAll(
    (node) => node.props?.accessibilityLabel === 'Finish workout',
  )[0];
  assert.equal(finish.props.disabled, true);
});

test('ExerciseStream renders the superset header, cards, and forwards actions', async () => {
  const { ExerciseStream } = await import('../../src/screens/activeWorkout/ExerciseStream');

  const exercise = makeActiveExercise();
  const supersetMetaMap = new Map([
    [
      'ae1',
      {
        groupId: 'ss1',
        label: 'SUPERSET A',
        type: 'superset' as const,
        color: '#8B5CF6',
        isFirst: true,
        isLast: false,
        positionInGroup: 1,
        totalInGroup: 2,
      },
    ],
  ]);
  const events: string[] = [];
  const handlers = makeCardHandlers(events);
  const props = {
    exercises: [exercise],
    supersetMetaMap,
    expandedExercises: { ae1: true },
    editingNoteExId: null,
    unit: 'kg',
    showRpeColumn: false,
    gymTrackingEnabled: false,
    prSummary: null,
    keyboardHeight: 0,
    scrollRef: { current: null },
    onScroll: (event: any) => events.push(`scroll:${event.nativeEvent.contentOffset.y}`),
    onAddExercise: () => events.push('add'),
    onOpenSupersetEditor: (id: string) => events.push(`supersetEditor:${id}`),
    cardHandlers: handlers,
  };

  const renderer = render(React.createElement(ExerciseStream, props as any));
  const texts = allTexts(renderer);

  assert.ok(texts.includes('SUPERSET A'), 'shows the superset pill');
  assert.ok(texts.includes('2 Exercises · Alternating Sets'));
  assert.ok(texts.includes('NEXT IN SUPERSET A'), 'shows the connector for non-last members');

  const card = renderer.root.findByType('ActiveExerciseCard' as any);
  assert.equal(card.props.exercise.id, 'ae1');
  assert.equal(card.props.isExpanded, true);
  assert.equal(card.props.onToggleSet, handlers.onToggleSet);

  pressByLabel(renderer, 'Edit SUPERSET A');
  pressByText(renderer, 'Add Exercise');
  act(() => {
    renderer.root.findByType('ScrollView' as any).props.onScroll({
      nativeEvent: { contentOffset: { y: 120 } },
    });
  });

  assert.deepEqual(events, ['supersetEditor:ae1', 'add', 'scroll:120']);
});

test('ExerciseStream shows the empty state without exercises', async () => {
  const { ExerciseStream } = await import('../../src/screens/activeWorkout/ExerciseStream');

  const props = {
    exercises: [],
    supersetMetaMap: new Map(),
    expandedExercises: {},
    editingNoteExId: null,
    unit: 'kg',
    showRpeColumn: false,
    gymTrackingEnabled: false,
    prSummary: null,
    keyboardHeight: 0,
    scrollRef: { current: null },
    onScroll: () => {},
    onAddExercise: () => {},
    onOpenSupersetEditor: () => {},
    cardHandlers: makeCardHandlers([]),
  };

  const renderer = render(React.createElement(ExerciseStream, props as any));

  assert.ok(allTexts(renderer).includes("Let's get moving"));
  assert.equal(renderer.root.findAllByType('ActiveExerciseCard' as any).length, 0);
});

test('SetOptionsModal renders the set, type chips, drop suggestions, and forwards actions', async () => {
  const { SetOptionsModal } = await import('../../src/screens/activeWorkout/SetOptionsModal');

  const events: string[] = [];
  const exercise = makeActiveExercise();
  const props = {
    target: { activeExerciseId: 'ae1', exerciseName: 'Bench Press', set: exercise.sets[1] },
    exercises: [exercise],
    prSummary: null,
    unit: 'kg',
    bottomInset: 20,
    onClose: () => events.push('close'),
    onSelectType: (type: string) => events.push(`type:${type}`),
    onSelectRpe: (rpe: number | null) => events.push(`rpe:${rpe}`),
    onMoveSet: (direction: number) => events.push(`move:${direction}`),
    onSetDropWeight: (weightKg: number) => events.push(`dropWeight:${weightKg}`),
    onOpenPlateCalculator: () => events.push('plateCalc'),
    onDeleteSet: () => events.push('deleteSet'),
  };

  const renderer = render(React.createElement(SetOptionsModal, props as any));
  const texts = allTexts(renderer);

  assert.ok(texts.includes('Set 2 Details'));
  assert.ok(texts.includes('Bench Press'));
  assert.ok(texts.includes('Move Up (to #1)'));
  assert.ok(texts.includes('Move Down (to #3)'));

  // Selecting the drop type offers 20/25/30 % reductions of the previous working set (100 kg).
  act(() => {
    pressByText(renderer, 'Drop (D)');
    renderer.update(
      React.createElement(SetOptionsModal, {
        ...props,
        target: { ...props.target, set: { ...exercise.sets[1], type: 'drop' } },
      } as any),
    );
  });
  const dropTexts = allTexts(renderer);
  assert.ok(dropTexts.includes('-20%') && dropTexts.includes('80 kg'));
  assert.ok(dropTexts.includes('-25%') && dropTexts.includes('75 kg'));
  assert.ok(dropTexts.includes('-30%') && dropTexts.includes('70 kg'));

  pressByText(renderer, '-25%');
  pressByText(renderer, '8');
  pressByText(renderer, 'None');
  pressByText(renderer, 'Move Up (to #1)');
  pressByText(renderer, 'Move Down (to #3)');
  pressByText(renderer, 'Plate Calculator');
  pressByText(renderer, 'Delete Set');
  pressByText(renderer, 'Done');

  assert.deepEqual(events, [
    'type:drop',
    'dropWeight:75',
    'rpe:8',
    'rpe:null',
    'move:-1',
    'move:1',
    'plateCalc',
    'deleteSet',
    'close',
  ]);
});

test('SetOptionsModal disables moving the first set and shows the PR banner', async () => {
  const { SetOptionsModal } = await import('../../src/screens/activeWorkout/SetOptionsModal');

  const exercise = makeActiveExercise();
  const achievement: PRAchievement = {
    rank: 2,
    metric: 'weight',
    scope: 'gym',
    value: 105,
    previousRecord: 100,
  };
  const setPRs = new Map<string, SetPRResult>([
    ['s1', { setId: 's1', primary: achievement, achievements: [achievement] }],
  ]);
  const prSummary: WorkoutPRSummary = {
    workoutId: 'w1',
    setPRs,
    achievements: [],
    goldCount: 0,
    silverCount: 1,
    bronzeCount: 0,
    totalCount: 1,
  };
  const props = {
    target: { activeExerciseId: 'ae1', exerciseName: 'Bench Press', set: exercise.sets[0] },
    exercises: [exercise],
    prSummary,
    unit: 'kg',
    bottomInset: 20,
    onClose: () => {},
    onSelectType: () => {},
    onSelectRpe: () => {},
    onMoveSet: () => {},
    onSetDropWeight: () => {},
    onOpenPlateCalculator: () => {},
    onDeleteSet: () => {},
  };

  const renderer = render(React.createElement(SetOptionsModal, props as any));
  const texts = allTexts(renderer);

  assert.ok(texts.includes('SILVER RECORD (2ND BEST)'), 'shows the ranked PR banner');
  assert.ok(texts.some((text) => text.startsWith('• ')), 'lists the achievement description');
  assert.equal(pressableByText(renderer, 'Move Up ').props.disabled, true);
  assert.equal(pressableByText(renderer, 'Move Down (to #2)').props.disabled, false);
});

test('ExerciseOptionsMenu reflects superset state and move boundaries', async () => {
  const { ExerciseOptionsMenu } = await import('../../src/screens/activeWorkout/ExerciseOptionsMenu');

  const events: string[] = [];
  const makeProps = (overrides: Record<string, unknown> = {}) => ({
    exercise: makeActiveExercise({ supersetId: undefined, id: 'ae0' }),
    exerciseIndex: 0,
    exerciseCount: 3,
    bottomInset: 20,
    onClose: () => events.push('close'),
    onViewDetails: () => events.push('viewDetails'),
    onMoveUp: () => events.push('moveUp'),
    onMoveDown: () => events.push('moveDown'),
    onReorderAll: () => events.push('reorder'),
    onSwap: () => events.push('swap'),
    onSetRestTimer: () => events.push('restTimer'),
    onOpenPlateCalculator: () => events.push('plateCalc'),
    onQuickWarmup: () => events.push('quickWarmup'),
    onWarmupCalculator: () => events.push('warmupCalc'),
    onEditSuperset: () => events.push('editSuperset'),
    onUngroupSuperset: () => events.push('ungroup'),
    onEditNote: () => events.push('editNote'),
    onRemoveExercise: () => events.push('remove'),
    ...overrides,
  });

  const renderer = render(
    React.createElement(ExerciseOptionsMenu, makeProps() as any),
  );
  let texts = allTexts(renderer);
  assert.ok(texts.includes('Create Superset'));
  assert.ok(!texts.includes('Ungroup Superset'));
  assert.equal(pressableByText(renderer, 'Move Up').props.disabled, true);
  assert.equal(pressableByText(renderer, 'Move Down').props.disabled, false);
  pressByText(renderer, 'View Exercise Details');
  pressByText(renderer, 'Remove Exercise');
  assert.deepEqual(events, ['viewDetails', 'remove']);

  events.length = 0;
  act(() => {
    renderer.update(
      React.createElement(
        ExerciseOptionsMenu,
        makeProps({
          exercise: makeActiveExercise({ supersetId: 'ss1' }),
          exerciseIndex: 2,
        }) as any,
      ),
    );
  });
  texts = allTexts(renderer);
  assert.ok(texts.includes('Edit Superset'));
  assert.ok(texts.includes('Ungroup Superset'));
  assert.equal(pressableByText(renderer, 'Move Up').props.disabled, false);
  assert.equal(pressableByText(renderer, 'Move Down').props.disabled, true);
  pressByText(renderer, 'Ungroup Superset');
  assert.deepEqual(events, ['ungroup']);
});

test('WorkoutOptionsMenu toggles the RPE label and gym row, and forwards actions', async () => {
  const { WorkoutOptionsMenu } = await import('../../src/screens/activeWorkout/WorkoutOptionsMenu');

  const events: string[] = [];
  const makeProps = (overrides: Record<string, unknown> = {}) => ({
    visible: true,
    workoutName: 'Push Day',
    gymTrackingEnabled: true,
    activeGymName: 'Downtown Gym',
    showRpeColumn: false,
    bottomInset: 20,
    onClose: () => events.push('close'),
    onExpandAll: () => events.push('expandAll'),
    onCollapseAll: () => events.push('collapseAll'),
    onReorder: () => events.push('reorder'),
    onChangeGym: () => events.push('changeGym'),
    onAdjustDuration: () => events.push('duration'),
    onToggleRpeColumn: () => events.push('toggleRpe'),
    onDiscard: () => events.push('discard'),
    ...overrides,
  });

  const renderer = render(
    React.createElement(WorkoutOptionsMenu, makeProps() as any),
  );
  let texts = allTexts(renderer);
  assert.ok(texts.includes('Show RPE Column'));
  assert.ok(texts.includes('Change Gym · Downtown Gym'));

  pressByText(renderer, 'Expand All Exercises');
  pressByText(renderer, 'Change Gym · Downtown Gym');
  pressByText(renderer, 'Discard Workout');
  assert.deepEqual(events, ['expandAll', 'changeGym', 'discard']);

  act(() => {
    renderer.update(
      React.createElement(
        WorkoutOptionsMenu,
        makeProps({ showRpeColumn: true, gymTrackingEnabled: false, activeGymName: null }) as any,
      ),
    );
  });
  texts = allTexts(renderer);
  assert.ok(texts.includes('Hide RPE Column'));
  assert.ok(!texts.some((text) => text.startsWith('Change Gym')));
});
