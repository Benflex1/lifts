import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ActiveExercise, Exercise, Workout, WorkoutSet } from '../../src/types';
import type { OverloadSuggestion } from '../../src/workout/overload';
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
mockModule('../../src/context/SettingsContext', { useSettings: () => ({ unit: 'kg' }) });
mockModule('../../src/components/TrackedValueInput', {
  DistanceInput: 'DistanceInput',
  DurationInput: 'DurationInput',
});

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

test('controller isolates card renders and protects session lifecycle', async t => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await loadCard();
  // Replace native subscriptions and persistence at the controller boundary; keep the real
  // controller, exercise card, PR calculation, and memo comparator under test.
  mockModule('react-native', {
    Platform: { OS: 'web' },
    BackHandler: { addEventListener: () => ({ remove: noop }) },
    Keyboard: { addListener: () => ({ remove: noop }) },
  });
  mockModule('expo-haptics', {});
  mockModule('expo-keep-awake', { useKeepAwake: noop });
  mockModule('react-native-safe-area-context', {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  });
  mockModule('../../src/database/db', {
    getCompletedWorkoutsForExercises: async () => ({ a: [], b: [] }),
    getExerciseGymScope: async () => undefined,
  });
  const exerciseA = makeActiveExercise('a');
  const exerciseB = makeActiveExercise('b');
  let workout: Workout = {
    id: 'active',
    name: 'Workout',
    gymId: 'gym',
    startTime: '2026-01-01T12:00:00Z',
    durationSeconds: 0,
    totalVolumeKg: 0,
    exercises: [exerciseA, exerciseB],
  };
  const updates: unknown[][] = [];
  const notices: unknown[] = [];
  const confirmations: unknown[] = [];
  const finishAttempts: Array<number | undefined> = [];
  const finishedSummaries: Workout[] = [];
  const movedSets: unknown[][] = [];
  const removedSets: unknown[][] = [];
  let finishResult: Workout | null = null;
  let finishError: Error | null = null;
  let confirmResult = true;
  let discarded = 0;
  const workoutActions = {
    gyms: [],
    expandedExercises: new Set(['we-a', 'we-b']),
    toggleExerciseExpanded: noop,
    updateExerciseNotes: noop,
    updateSet: (...args: unknown[]) => updates.push(args),
    removeSet: (...args: unknown[]) => removedSets.push(args),
    moveSet: (...args: unknown[]) => movedSets.push(args),
    addSet: noop,
    toggleSetComplete: noop,
    setExerciseExpanded: noop,
    minimizeWorkout: noop,
    finishWorkout: async (durationOverride?: number) => {
      finishAttempts.push(durationOverride);
      if (finishError) throw finishError;
      return finishResult;
    },
    cancelWorkout: () => {
      discarded += 1;
    },
  };
  mockModule('../../src/context/WorkoutContext', {
    useWorkout: () => ({ ...workoutActions, activeWorkout: workout }),
    useIsRestTimerActive: () => false,
  });
  mockModule('../../src/context/DialogContext', {
    useDialog: () => ({
      confirm: async (options: unknown) => {
        confirmations.push(options);
        return confirmResult;
      },
      notify,
    }),
  });
  function notify(options: unknown) {
    notices.push(options);
    return Promise.resolve();
  }
  const { useActiveWorkoutController } =
    await import('../../src/screens/activeWorkout/useActiveWorkoutController');
  let controller!: ReturnType<typeof useActiveWorkoutController>;
  function ControllerHarness() {
    controller = useActiveWorkoutController({
      onFinish: summary => finishedSummaries.push(summary),
    });
    const stream = controller.stream;
    return React.createElement(
      React.Fragment,
      null,
      stream.exercises.map(exercise =>
        React.createElement(CountedCard, {
          key: exercise.id,
          ...cardProps(exercise),
          ...stream.cardHandlers,
          prSummary: stream.prSummary,
          supersetMeta: stream.supersetMetaMap.get(exercise.id),
          overloadEnabled: stream.overloadEnabled,
          isDeload: stream.isDeload,
          onApplyOverload: stream.onApplyOverload,
          onExplainOverload: stream.onExplainOverload,
        }),
      ),
    );
  }

  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ControllerHarness));
  });
  const { onApplyOverload, onExplainOverload } = controller.stream;
  cardRenders.length = 0;
  const changedA = toggleSet(exerciseA, 'a-s1');
  workout = { ...workout, exercises: [changedA, exerciseB] };
  await act(async () => {
    renderer.update(React.createElement(ControllerHarness));
  });
  assert.deepEqual(cardRenders, ['we-a'], 'controller changes must not redraw untouched cards');
  assert.equal(controller.stream.onApplyOverload, onApplyOverload);
  assert.equal(controller.stream.onExplainOverload, onExplainOverload);

  const suggestion: OverloadSuggestion = {
    kind: 'add_weight',
    weightKg: 105,
    reps: 6,
    reason: 'All working sets met the rep goal.',
  };
  onApplyOverload(changedA, suggestion);
  onExplainOverload('105 kg × 6', suggestion);
  assert.deepEqual(
    updates,
    [['we-a', 'a-s2', { weightKg: 105, reps: 6, isWeightEdited: true }]],
    'the retained handler skips the now completed set and applies the current suggestion',
  );
  assert.deepEqual(notices, [
    { title: 'Next target: 105 kg × 6', message: 'All working sets met the rep goal.' },
  ]);

  async function setWorkout(next: Workout) {
    workout = next;
    await act(async () => renderer.update(React.createElement(ControllerHarness)));
  }

  await t.test(
    'finishing a saved session forwards its summary and clears the saving state',
    async () => {
      await setWorkout({ ...workout, startTime: new Date().toISOString() });
      finishResult = { ...workout, endTime: new Date().toISOString(), durationSeconds: 600 };
      await act(async () => controller.header.onFinish());
      assert.deepEqual(finishAttempts, [undefined]);
      assert.deepEqual(finishedSummaries, [finishResult]);
      assert.equal(controller.header.isFinishing, false);
      assert.deepEqual(confirmations, [], 'completed sets do not need the empty-session prompt');
    },
  );

  await t.test(
    'failed saves explain the error, keep the session open, and allow a retry',
    async () => {
      notices.length = 0;
      finishResult = null;
      await act(async () => controller.header.onFinish());
      assert.deepEqual(notices, [
        {
          title: 'Save Failed',
          message: 'Could not save the workout session. Your session remains open.',
        },
      ]);
      assert.equal(controller.header.isFinishing, false);
      assert.equal(controller.activeWorkout, workout);
      assert.equal(finishedSummaries.length, 1);

      notices.length = 0;
      finishError = new Error('Storage unavailable');
      await act(async () => controller.header.onFinish());
      assert.deepEqual(notices, [{ title: 'Save Error', message: 'Storage unavailable' }]);
      assert.equal(controller.header.isFinishing, false);
      assert.equal(finishedSummaries.length, 1);

      finishError = null;
      finishResult = { ...workout, endTime: new Date().toISOString() };
      await act(async () => controller.header.onFinish());
      assert.equal(finishedSummaries.length, 2, 'a failed attempt does not lock out a later save');
      assert.equal(discarded, 0);
    },
  );

  await t.test(
    'declining the empty-session confirmation leaves the workout untouched',
    async () => {
      await setWorkout({ ...workout, exercises: [exerciseA, exerciseB] });
      confirmations.length = 0;
      confirmResult = false;
      const attemptsBefore = finishAttempts.length;
      await act(async () => controller.header.onFinish());
      assert.deepEqual(confirmations, [
        {
          title: 'Finish Workout?',
          message: 'You have not completed any sets. Do you still want to finish?',
          confirmLabel: 'Finish',
          cancelLabel: 'Keep Lifting',
        },
      ]);
      assert.equal(finishAttempts.length, attemptsBefore);
      assert.equal(controller.activeWorkout, workout);
      assert.equal(controller.modals.duration.visible, false);
    },
  );

  await t.test(
    'an excessive session duration must be corrected before the workout is saved',
    async () => {
      await setWorkout({
        ...workout,
        startTime: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        exercises: [changedA, exerciseB],
      });
      const attemptsBefore = finishAttempts.length;
      await act(async () => controller.header.onFinish());
      assert.equal(controller.modals.duration.visible, true);
      assert.equal(controller.modals.duration.showSafetyPrompt, true);
      assert.equal(finishAttempts.length, attemptsBefore, 'opening the correction does not save');

      act(() => controller.modals.duration.onClose());
      assert.equal(controller.modals.duration.visible, false);
      assert.equal(controller.modals.duration.showSafetyPrompt, false);
      assert.equal(finishAttempts.length, attemptsBefore, 'closing the correction keeps lifting');

      await act(async () => controller.header.onFinish());
      finishResult = { ...workout, durationSeconds: 1800, endTime: new Date().toISOString() };
      await act(async () => controller.modals.duration.onSave(1800));
      assert.equal(finishAttempts.length, attemptsBefore + 1);
      assert.equal(finishAttempts.at(-1), 1800);
      assert.equal(finishedSummaries.at(-1), finishResult);
      assert.equal(controller.modals.duration.visible, false);
      assert.equal(controller.header.isFinishing, false);
    },
  );

  await t.test(
    'discard closes the menu but requires destructive confirmation to cancel',
    async () => {
      confirmations.length = 0;
      confirmResult = false;
      act(() => controller.header.onOpenMenu());
      assert.equal(controller.modals.workoutMenu.visible, true);
      await act(async () => controller.modals.workoutMenu.onDiscard());
      assert.equal(controller.modals.workoutMenu.visible, false);
      assert.equal(discarded, 0);
      assert.deepEqual(confirmations, [
        {
          title: 'Discard Workout?',
          message: 'Are you sure you want to discard this session? All logged sets will be lost.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep Lifting',
          destructive: true,
        },
      ]);

      confirmResult = true;
      await act(async () => controller.modals.workoutMenu.onDiscard());
      assert.equal(discarded, 1);
    },
  );
  await t.test(
    'set options apply drop weight, edit RPE, move, and delete the selected row',
    async () => {
      updates.length = 0;
      act(() =>
        controller.stream.cardHandlers.onOpenSetOptions('we-a', 'Exercise a', changedA.sets[1]),
      );
      assert.equal(controller.modals.setOptions.target?.set.id, 'a-s2');

      act(() => controller.modals.setOptions.onSelectType('drop'));
      assert.deepEqual(updates.at(-1), [
        'we-a',
        'a-s2',
        { type: 'drop', weightKg: 80, isWeightEdited: true },
      ]);
      assert.equal(controller.modals.setOptions.target?.set.type, 'drop');
      assert.equal(controller.modals.setOptions.target?.set.weightKg, 80);

      act(() => controller.modals.setOptions.onSelectRpe(8));
      assert.deepEqual(updates.at(-1), ['we-a', 'a-s2', { rpe: 8 }]);
      assert.equal(controller.modals.setOptions.target?.set.rpe, 8);
      act(() => controller.modals.setOptions.onSelectRpe(null));
      assert.deepEqual(updates.at(-1), ['we-a', 'a-s2', { rpe: undefined }]);
      assert.equal(controller.modals.setOptions.target?.set.rpe, undefined);

      act(() => controller.modals.setOptions.onMoveSet(-1));
      assert.deepEqual(movedSets, [['we-a', 'a-s2', -1]]);
      act(() => controller.modals.setOptions.onDeleteSet());
      assert.deepEqual(removedSets, [['we-a', 'a-s2']]);
      assert.equal(controller.modals.setOptions.target, null);
    },
  );

  await t.test(
    'a set options plate calculator keeps the selected row as its apply target',
    async () => {
      updates.length = 0;
      act(() =>
        controller.stream.cardHandlers.onOpenSetOptions('we-a', 'Exercise a', changedA.sets[1]),
      );
      act(() => controller.modals.setOptions.onOpenPlateCalculator());
      assert.equal(controller.modals.setOptions.target, null);
      assert.equal(controller.modals.plateCalculator.visible, true);
      assert.equal(controller.modals.plateCalculator.initialWeight, 100);

      act(() => controller.modals.plateCalculator.onApply(95));
      assert.deepEqual(updates, [['we-a', 'a-s2', { weightKg: 95, isWeightEdited: true }]]);
      act(() => controller.modals.plateCalculator.onClose());
      assert.equal(controller.modals.plateCalculator.visible, false);
    },
  );
  act(() => renderer.unmount());
});
