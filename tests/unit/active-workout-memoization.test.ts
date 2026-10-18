import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ActiveExercise, Exercise, WorkoutSet } from '../../src/types';
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
  StyleSheet: { create: (styles: unknown) => styles },
});
mockModule('lucide-react-native', iconProxy);
mockModule('../../src/components/ui', { AppTouchable: 'TouchableOpacity' });
mockModule('../../src/components/SwipeableSetRow', { SwipeableSetRow: 'SwipeableSetRow' });
mockModule('../../src/components/WeightInput', { WeightInput: 'WeightInput' });
mockModule('../../src/components/RepsInput', { RepsInput: 'RepsInput' });
mockModule('../../src/components/PRBadge', { PRBadge: 'PRBadge' });
mockModule('../../src/components/ExerciseNoteInput', { ExerciseNoteInput: 'ExerciseNoteInput' });
mockModule('../../src/components/MemoizedExerciseVisual', { ExerciseVisual: 'ExerciseVisual' });

const noop = () => {};

const STABLE_CALLBACKS = {
  onToggleExpanded: noop,
  onCommitNotes: noop,
  onOpenDetail: noop,
  onOpenMenu: noop,
  onOpenRestWheel: noop,
  onStartEditingNote: noop,
  onUpdateSet: noop,
  onRemoveSet: noop,
  onAddSet: noop,
  onToggleSet: noop,
  onApplyPrevious: noop,
  onOpenSetOptions: noop,
  onInputFocus: noop,
};

function makeExerciseDef(id: string, name: string): Exercise {
  return {
    id,
    name,
    category: 'chest',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
  };
}

function makeSet(id: string, setNumber: number): WorkoutSet {
  return { id, setNumber, type: 'normal', weightKg: 100, reps: 5, isCompleted: false };
}

function makeActiveExercise(id: string): ActiveExercise {
  return {
    id: `we-${id}`,
    exerciseId: id,
    exercise: makeExerciseDef(id, `Exercise ${id}`),
    restTimerSeconds: 90,
    sets: [makeSet(`${id}-s1`, 1), makeSet(`${id}-s2`, 2)],
  };
}

function toggleSet(exercise: ActiveExercise, setId: string): ActiveExercise {
  return {
    ...exercise,
    sets: exercise.sets.map(set => (set.id === setId ? { ...set, isCompleted: true } : set)),
  };
}

function makeAchievement(value: number): PRAchievement {
  return { rank: 1, metric: 'weight', scope: 'gym', value, previousRecord: value - 10 };
}

function makeSummary(entries: Array<[string, number]>): WorkoutPRSummary {
  const setPRs = new Map<string, SetPRResult>();
  for (const [setId, value] of entries) {
    setPRs.set(setId, {
      setId,
      primary: makeAchievement(value),
      achievements: [makeAchievement(value)],
    });
  }
  return {
    workoutId: 'workout-1',
    setPRs,
    achievements: [],
    goldCount: entries.length,
    silverCount: 0,
    bronzeCount: 0,
    totalCount: entries.length,
  };
}

function cardProps(exercise: ActiveExercise, overrides: Record<string, unknown> = {}) {
  return {
    exercise,
    supersetMeta: undefined,
    isExpanded: true,
    isNoteEditing: false,
    unit: 'kg',
    showRpeColumn: false,
    gymTrackingEnabled: false,
    prSummary: null,
    ...STABLE_CALLBACKS,
    ...overrides,
  };
}

function rowProps(set: WorkoutSet, exerciseId: string, overrides: Record<string, unknown> = {}) {
  return {
    set,
    exerciseId,
    exerciseName: `Exercise ${exerciseId}`,
    targetReps: undefined,
    unit: 'kg',
    showRpeColumn: false,
    gymTrackingEnabled: false,
    setPR: undefined,
    ...STABLE_CALLBACKS,
    ...overrides,
  };
}

const cardRenders: string[] = [];
const rowRenders: string[] = [];

let CountedCard: React.ComponentType<any>;
let CountedRow: React.ComponentType<any>;

function CardHarness({
  exercises,
  prSummary,
}: {
  exercises: ActiveExercise[];
  prSummary?: WorkoutPRSummary | null;
}) {
  return React.createElement(
    React.Fragment,
    null,
    exercises.map(exercise =>
      React.createElement(CountedCard, {
        key: exercise.id,
        ...cardProps(exercise, prSummary !== undefined ? { prSummary } : {}),
      }),
    ),
  );
}

function RowHarness({
  sets,
  exerciseId,
  setPR,
}: {
  sets: WorkoutSet[];
  exerciseId: string;
  setPR?: SetPRResult;
}) {
  return React.createElement(
    React.Fragment,
    null,
    sets.map(set =>
      React.createElement(CountedRow, {
        key: set.id,
        ...rowProps(set, exerciseId, setPR !== undefined ? { setPR } : {}),
      }),
    ),
  );
}

async function loadCard() {
  const module = await import('../../src/components/ActiveExerciseCard');
  const compare = module.areCardPropsEqual as (prev: any, next: any) => boolean;
  CountedCard = React.memo(function CountedCard(props: any) {
    cardRenders.push(props.exercise.id);
    return React.createElement(module.ActiveExerciseCard, props);
  }, compare);
  return module;
}

async function loadRow() {
  const module = await import('../../src/components/ActiveSetRow');
  const compare = module.areRowPropsEqual as (prev: any, next: any) => boolean;
  CountedRow = React.memo(function CountedRow(props: any) {
    rowRenders.push(props.set.id);
    return React.createElement(module.ActiveSetRow, props);
  }, compare);
  return module;
}

test('exercise card is memoized with the exported comparator', async () => {
  const module = await loadCard();
  assert.equal((module.ActiveExerciseCard as any).compare, module.areCardPropsEqual);
  const rowModule = await loadRow();
  assert.equal((rowModule.ActiveSetRow as any).compare, rowModule.areRowPropsEqual);
});

test('toggling a set re-renders only the affected card', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await loadCard();

  const exerciseA = makeActiveExercise('a');
  const exerciseB = makeActiveExercise('b');

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(CardHarness, { exercises: [exerciseA, exerciseB] }),
    );
  });
  assert.deepEqual(cardRenders, ['we-a', 'we-b']);

  cardRenders.length = 0;
  const toggledA = toggleSet(exerciseA, 'a-s1');
  act(() => {
    renderer.update(React.createElement(CardHarness, { exercises: [toggledA, exerciseB] }));
  });

  assert.deepEqual(cardRenders, ['we-a'], 'only the card owning the toggled set re-rendered');

  cardRenders.length = 0;
  act(() => {
    renderer.update(React.createElement(CardHarness, { exercises: [toggledA, exerciseB] }));
  });
  assert.deepEqual(cardRenders, [], 'an identical parent render re-renders no cards');
});

test('committing a note re-renders only that card', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await loadCard();

  const exerciseA = makeActiveExercise('a');
  const exerciseB = makeActiveExercise('b');

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(CardHarness, { exercises: [exerciseA, exerciseB] }),
    );
  });

  cardRenders.length = 0;
  const notedA: ActiveExercise = { ...exerciseA, notes: 'seat pin 4' };
  act(() => {
    renderer.update(React.createElement(CardHarness, { exercises: [notedA, exerciseB] }));
  });

  assert.deepEqual(cardRenders, ['we-a'], 'typing/committing a note never touches other cards');
});

test('rebuilding PR summaries does not re-render cards whose badges are unchanged', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await loadCard();

  const exerciseA = makeActiveExercise('a');
  const exerciseB = makeActiveExercise('b');
  const prBefore = makeSummary([
    ['a-s1', 100],
    ['b-s1', 80],
  ]);

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(CardHarness, { exercises: [exerciseA, exerciseB], prSummary: prBefore }),
    );
  });

  cardRenders.length = 0;
  // A fresh evaluation object with identical badge content for both cards.
  const prRebuilt = makeSummary([
    ['a-s1', 100],
    ['b-s1', 80],
  ]);
  act(() => {
    renderer.update(
      React.createElement(CardHarness, { exercises: [exerciseA, exerciseB], prSummary: prRebuilt }),
    );
  });
  assert.deepEqual(cardRenders, [], 'structurally equal badges are not a render change');

  cardRenders.length = 0;
  // A's badge changed magnitude; B's did not.
  const prChanged = makeSummary([
    ['a-s1', 120],
    ['b-s1', 80],
  ]);
  act(() => {
    renderer.update(
      React.createElement(CardHarness, { exercises: [exerciseA, exerciseB], prSummary: prChanged }),
    );
  });
  assert.deepEqual(cardRenders, ['we-a'], 'only the card with a changed badge re-rendered');
});

test('toggling a set re-renders only that set row', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await loadRow();

  const sets = [makeSet('s1', 1), makeSet('s2', 2), makeSet('s3', 3)];

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(RowHarness, { sets, exerciseId: 'a' }));
  });
  assert.deepEqual(rowRenders, ['s1', 's2', 's3']);

  rowRenders.length = 0;
  const toggled = sets.map(set => (set.id === 's2' ? { ...set, isCompleted: true } : set));
  act(() => {
    renderer.update(React.createElement(RowHarness, { sets: toggled, exerciseId: 'a' }));
  });

  assert.deepEqual(rowRenders, ['s2'], 'only the affected row re-rendered');
});

test('a rebuilt PR object with equal content does not re-render the row', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await loadRow();

  const set = makeSet('s1', 1);
  const before: SetPRResult = {
    setId: 's1',
    primary: makeAchievement(100),
    achievements: [makeAchievement(100)],
  };
  const after: SetPRResult = {
    setId: 's1',
    primary: makeAchievement(100),
    achievements: [makeAchievement(100)],
  };

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(RowHarness, { sets: [set], exerciseId: 'a', setPR: before }),
    );
  });

  rowRenders.length = 0;
  act(() => {
    renderer.update(
      React.createElement(RowHarness, { sets: [set], exerciseId: 'a', setPR: after }),
    );
  });

  assert.deepEqual(rowRenders, [], 'equal badge content skips the row render');

  rowRenders.length = 0;
  const changed: SetPRResult = {
    setId: 's1',
    primary: makeAchievement(130),
    achievements: [makeAchievement(130)],
  };
  act(() => {
    renderer.update(
      React.createElement(RowHarness, { sets: [set], exerciseId: 'a', setPR: changed }),
    );
  });

  assert.deepEqual(rowRenders, ['s1'], 'a changed badge re-renders the row');
});
