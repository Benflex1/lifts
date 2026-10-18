import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { installReactNativeMock, loadRNTL, mockModule } from '../helpers/rntlHarness';

installReactNativeMock();

const rntl = loadRNTL();

// --- Shared module stubs ---------------------------------------------------

mockModule('../../src/components/ui', {
  AppTouchable: 'TouchableOpacity',
  IconButton: 'IconButton',
  Chip: 'Chip',
  PRMark: 'PRMark',
});
mockModule('../../src/components/SwipeableSetRow', {
  SwipeableSetRow: (props: { children?: React.ReactNode }) =>
    React.createElement('View', null, props.children),
});
mockModule('../../src/components/PRBadge', { PRBadge: 'PRBadge' });
mockModule('../../src/components/CustomExerciseModal', {
  CustomExerciseModal: 'CustomExerciseModal',
});
mockModule('../../src/components/ExerciseFilterBar', { ExerciseFilterBar: 'ExerciseFilterBar' });
mockModule('../../src/components/ExerciseListRow', {
  ExerciseListRow: (props: { exercise: { name: string }; onPress: (exercise: unknown) => void }) =>
    React.createElement(
      'TouchableOpacity',
      {
        accessibilityLabel: props.exercise.name,
        onPress: () => props.onPress(props.exercise),
      },
      React.createElement('Text', null, props.exercise.name),
    ),
});
mockModule('../../src/context/SettingsContext', {
  useSettings: () => ({ unit: 'kg', gymTrackingEnabled: false }),
});
mockModule('../../src/context/WorkoutContext', {
  useRestTimer: () => ({ isActive: true, remainingSeconds: 30, totalSeconds: 60 }),
  useWorkout: () => ({ adjustRestTimer: adjustRestTimerSpy, stopRestTimer: stopRestTimerSpy }),
  useWorkoutClock: () => 90,
});

const searchCalls: Array<[string, string, string]> = [];
const searchResults = [
  { id: 'e1', name: 'Bench Press', primaryMuscles: ['chest'], equipment: 'barbell' },
  { id: 'e2', name: 'Incline Press', primaryMuscles: ['chest'], equipment: 'barbell' },
];
mockModule('../../src/database/db', {
  searchExercises: async (query: string, muscle: string, equipment: string) => {
    searchCalls.push([query, muscle, equipment]);
    const needle = query.trim().toLowerCase();
    if (!needle) return searchResults;
    return searchResults.filter(exercise => exercise.name.toLowerCase().includes(needle));
  },
});

// --- Flow 1: set logging ---------------------------------------------------

const setFixture = {
  id: 's1',
  setNumber: 1,
  weightKg: 100,
  reps: 8,
  isCompleted: false,
  type: 'normal' as const,
  rpe: 8,
  isWeightEdited: true,
  previousWeightKg: 95,
  previousReps: 8,
};

test('critical flow: log a set through the set row (DX-02)', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { ActiveSetRow } = await import('../../src/components/ActiveSetRow');

  const toggles: Array<[string, string]> = [];
  const updates: Array<[string, string, Record<string, unknown>]> = [];
  const openedOptions: string[] = [];

  const view = await rntl.render(
    React.createElement(ActiveSetRow, {
      set: setFixture as never,
      exerciseId: 'ae-1',
      exerciseName: 'Bench Press',
      targetReps: '8',
      unit: 'kg',
      showRpeColumn: false,
      gymTrackingEnabled: false,
      onToggleSet: (exerciseId: string, setId: string) => toggles.push([exerciseId, setId]),
      onApplyPrevious: () => {},
      onUpdateSet: (exerciseId: string, setId: string, updatesArg: Record<string, unknown>) =>
        updates.push([exerciseId, setId, updatesArg]),
      onRemoveSet: () => {},
      onOpenSetOptions: () => openedOptions.push('opened'),
      onInputFocus: () => {},
    } as never),
  );

  await rntl.fireEvent.press(view.getByLabelText('Complete set 1'));
  assert.deepEqual(toggles, [['ae-1', 's1']]);

  const weightInput = view.getByLabelText('Weight for set 1 in kg');
  await rntl.fireEvent.changeText(weightInput, '102.5');
  assert.equal(updates.length, 0, 'weight commits on a debounce, not per keystroke');
  await rntl.act(async () => {
    t.mock.timers.tick(300);
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], 'ae-1');
  assert.equal(updates[0][1], 's1');
  assert.equal(updates[0][2].weightKg, 102.5);
  assert.equal(updates[0][2].isWeightEdited, true);

  await rntl.fireEvent.press(view.getByLabelText('Set 1 RPE 8, edit options'));
  assert.equal(openedOptions.length, 1);
});

// --- Flow 2: rest timer ----------------------------------------------------

let adjustRestTimerSpy: (seconds: number) => void = () => {};
let stopRestTimerSpy: () => void = () => {};

test('critical flow: adjust, read, and skip the rest timer (DX-02)', async () => {
  const { RestTimerOverlay } = await import('../../src/components/RestTimerOverlay');

  const adjustments: number[] = [];
  let stops = 0;
  adjustRestTimerSpy = seconds => adjustments.push(seconds);
  stopRestTimerSpy = () => {
    stops += 1;
  };

  const view = await rntl.render(React.createElement(RestTimerOverlay, {}));

  assert.ok(view.getByText('Rest Time'));
  assert.ok(view.getByText('00:30'));

  await rntl.fireEvent.press(view.getByLabelText('Increase rest timer by 30 seconds'));
  await rntl.fireEvent.press(view.getByLabelText('Decrease rest timer by 30 seconds'));
  assert.deepEqual(adjustments, [30, -30]);

  await rntl.fireEvent.press(view.getByLabelText('Skip rest'));
  assert.equal(stops, 1);
});

// --- Flow 3: finish and discard --------------------------------------------

test('critical flow: finish the workout and open duration options (DX-02)', async () => {
  const { WorkoutHeader } = await import('../../src/screens/activeWorkout/WorkoutHeader');

  let finishes = 0;
  let durationOpens = 0;
  const view = await rntl.render(
    React.createElement(WorkoutHeader, {
      workoutName: 'Push Day',
      gymName: 'Home',
      showGym: true,
      isFinishing: false,
      unit: 'kg',
      liveVolume: 1250,
      completedSetsCount: 3,
      totalSetsCount: 9,
      topInset: 44,
      onMinimize: () => {},
      onOpenMenu: () => {},
      onFinish: () => {
        finishes += 1;
      },
      onOpenDuration: () => {
        durationOpens += 1;
      },
    } as never),
  );

  await rntl.fireEvent.press(view.getByLabelText('Finish workout'));
  await rntl.fireEvent.press(view.getByLabelText('Workout duration'));
  assert.equal(finishes, 1);
  assert.equal(durationOpens, 1);
});

test('critical flow: discard the workout from the options menu (DX-02)', async () => {
  const { WorkoutOptionsMenu } = await import('../../src/screens/activeWorkout/WorkoutOptionsMenu');

  let discards = 0;
  let closes = 0;
  const view = await rntl.render(
    React.createElement(WorkoutOptionsMenu, {
      visible: true,
      workoutName: 'Push Day',
      gymTrackingEnabled: true,
      activeGymName: 'Home',
      showRpeColumn: false,
      bottomInset: 0,
      onClose: () => {
        closes += 1;
      },
      onExpandAll: () => {},
      onCollapseAll: () => {},
      onReorder: () => {},
      onChangeGym: () => {},
      onAdjustDuration: () => {},
      onToggleRpeColumn: () => {},
      onDiscard: () => {
        discards += 1;
      },
    } as never),
  );

  await rntl.fireEvent.press(view.getByLabelText('Discard workout'));
  assert.equal(discards, 1);
  await rntl.fireEvent.press(view.getByLabelText('Close workout options'));
  assert.equal(closes, 1);
});

// --- Flow 4: draft recovery ------------------------------------------------

test('critical flow: resume or discard a recovered draft (DX-02)', async () => {
  const { DraftRecoveryModal } = await import('../../src/components/DraftRecoveryModal');

  const resumptions: string[] = [];
  const discards: string[] = [];
  const draft = {
    savedAt: new Date(2026, 9, 18, 9, 0, 0).toISOString(),
    workout: {
      id: 'd1',
      name: 'Leg Day',
      durationSeconds: 900,
      exercises: [
        {
          id: 'ae-1',
          sets: [
            { id: 's1', isCompleted: true },
            { id: 's2', isCompleted: false },
          ],
        },
      ],
    },
  };

  const view = await rntl.render(
    React.createElement(DraftRecoveryModal, {
      visible: true,
      drafts: [draft] as never,
      onResume: (item: { workout: { id: string } }) => resumptions.push(item.workout.id),
      onDiscard: (id: string) => discards.push(id),
      onClose: () => {},
    } as never),
  );

  await rntl.fireEvent.press(view.getByLabelText('Continue Leg Day'));
  assert.deepEqual(resumptions, ['d1']);

  await rntl.fireEvent.press(view.getByLabelText('Discard Leg Day draft'));
  assert.deepEqual(discards, ['d1']);
});

// --- Flow 5: exercise search -----------------------------------------------

test('critical flow: search, debounce, and select an exercise (DX-02)', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { ExercisePickerModal } = await import('../../src/components/ExercisePickerModal');

  searchCalls.length = 0;
  const selections: string[] = [];
  let closes = 0;

  const view = await rntl.render(
    React.createElement(ExercisePickerModal, {
      visible: true,
      onClose: () => {
        closes += 1;
      },
      onSelectExercise: (exercise: { id: string }) => selections.push(exercise.id),
    } as never),
  );
  await rntl.act(async () => {});

  assert.deepEqual(searchCalls, [['', 'All', 'All']], 'the picker loads an initial page');
  assert.ok(view.getByText('Bench Press'));

  const searchInput = view.getByPlaceholderText('Search exercises');
  await rntl.fireEvent.changeText(searchInput, 'bench');
  assert.equal(searchCalls.length, 1, 'typing waits for the debounce window');
  await rntl.act(async () => {
    t.mock.timers.tick(150);
  });

  assert.equal(searchCalls.length, 2);
  assert.deepEqual(searchCalls[1], ['bench', 'All', 'All']);
  assert.ok(view.getByText('Bench Press'));
  assert.equal(view.queryByText('Incline Press'), null, 'non-matching rows drop out');

  await rntl.fireEvent.press(view.getByLabelText('Bench Press'));
  assert.deepEqual(selections, ['e1']);
  assert.equal(closes, 1);
});
