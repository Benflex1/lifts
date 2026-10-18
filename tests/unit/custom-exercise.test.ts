import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Exercise } from '../../src/types';
import {
  CUSTOM_EQUIPMENT_OPTIONS,
  CUSTOM_MUSCLE_OPTIONS,
  customExerciseDefaults,
  EQUIPMENT_LIST,
  MUSCLE_GROUPS,
  resolveCustomEquipment,
  resolveCustomMuscle,
} from '../../src/workout/exercise-options';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mockModule('react-native', {
  Modal: 'Modal',
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
});

const iconProxy = new Proxy({}, { get: (_target, name) => name }) as Record<string, unknown>;
mockModule('lucide-react-native', iconProxy);

interface CustomExercisePayload {
  name: string;
  category: string;
  equipment: string;
  primaryMuscles: string[];
}

const dbCalls = {
  create: [] as CustomExercisePayload[],
  update: [] as Array<{ id: string; payload: CustomExercisePayload }>,
};

mockModule('../../src/database/db', {
  createCustomExercise: async (payload: CustomExercisePayload) => {
    dbCalls.create.push(payload);
    return { ...payload, id: 'custom-created' };
  },
  updateCustomExercise: async (id: string, payload: CustomExercisePayload) => {
    dbCalls.update.push({ id, payload });
    return { ...payload, id };
  },
});

let CustomExerciseModal: typeof import('../../src/components/CustomExerciseModal').CustomExerciseModal;

before(async () => {
  ({ CustomExerciseModal } = await import('../../src/components/CustomExerciseModal'));
});

async function flush(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
}

interface ModalResult {
  renderer: TestRenderer.ReactTestRenderer;
  saved: Array<{ exercise: Exercise; mode: string }>;
  closed: () => number;
}

async function renderModal(exercise: Exercise | null): Promise<ModalResult> {
  const saved: Array<{ exercise: Exercise; mode: string }> = [];
  let closedCount = 0;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(CustomExerciseModal, {
        visible: true,
        exercise,
        onClose: () => {
          closedCount += 1;
        },
        onSaved: (savedExercise: Exercise, mode: string) => {
          saved.push({ exercise: savedExercise, mode });
        },
      }),
    );
    await flush();
  });
  return { renderer, saved, closed: () => closedCount };
}

test('shared filter lists and resolvers keep the screen and picker in sync', () => {
  assert.equal(MUSCLE_GROUPS[0], 'All');
  assert.equal(EQUIPMENT_LIST[0], 'All');
  assert.ok(!CUSTOM_MUSCLE_OPTIONS.includes('All'));
  assert.ok(!CUSTOM_EQUIPMENT_OPTIONS.includes('All'));

  assert.equal(resolveCustomMuscle('lats'), 'Back');
  assert.equal(resolveCustomMuscle('QUADRICEPS'), 'Quadriceps');
  assert.equal(resolveCustomMuscle('unknown muscle'), 'Chest');

  assert.equal(resolveCustomEquipment('smith machine'), 'Machine');
  assert.equal(resolveCustomEquipment('kettlebells'), 'Dumbbell');
  assert.equal(resolveCustomEquipment('resistance band'), 'Cable');
  assert.equal(resolveCustomEquipment('body weight'), 'Bodyweight');
  assert.equal(resolveCustomEquipment('unknown gear'), 'Barbell');
});

test('customExerciseDefaults prefills from an existing exercise', () => {
  assert.deepEqual(customExerciseDefaults(null), {
    name: '',
    muscle: 'Chest',
    equipment: 'Barbell',
  });
  assert.deepEqual(
    customExerciseDefaults({
      id: 'e-lat',
      name: 'Lat Pulldown',
      category: 'back',
      equipment: 'bands',
      primaryMuscles: ['lats'],
    }),
    { name: 'Lat Pulldown', muscle: 'Back', equipment: 'Cable' },
  );
});

test('CustomExerciseModal creates a custom exercise with normalized options', async () => {
  dbCalls.create.length = 0;
  dbCalls.update.length = 0;
  const { renderer, saved, closed } = await renderModal(null);

  const input = renderer.root.findByProps({ testID: 'custom-exercise-name' });
  await act(async () => {
    input.props.onChangeText('  Weighted Dip  ');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'custom-muscle-triceps' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'custom-equipment-bodyweight' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'custom-exercise-save' }).props.onPress();
    await flush();
  });

  assert.equal(dbCalls.create.length, 1);
  assert.deepEqual(dbCalls.create[0], {
    name: 'Weighted Dip',
    category: 'strength',
    equipment: 'bodyweight',
    primaryMuscles: ['triceps'],
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].mode, 'created');
  assert.equal(saved[0].exercise.id, 'custom-created');
  assert.equal(closed(), 1);
});

test('CustomExerciseModal edits an exercise and resolves stored aliases', async () => {
  dbCalls.create.length = 0;
  dbCalls.update.length = 0;
  const exercise: Exercise = {
    id: 'e-cable-row',
    name: 'Cable Row',
    category: 'back',
    equipment: 'bands',
    primaryMuscles: ['lats'],
  };
  const { renderer, saved, closed } = await renderModal(exercise);

  const input = renderer.root.findByProps({ testID: 'custom-exercise-name' });
  assert.equal(input.props.value, 'Cable Row');

  await act(async () => {
    renderer.root.findByProps({ testID: 'custom-exercise-save' }).props.onPress();
    await flush();
  });

  assert.equal(dbCalls.update.length, 1);
  assert.deepEqual(dbCalls.update[0], {
    id: 'e-cable-row',
    payload: {
      name: 'Cable Row',
      category: 'back',
      equipment: 'cable',
      primaryMuscles: ['back'],
    },
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].mode, 'updated');
  assert.equal(closed(), 1);
});

test('CustomExerciseModal ignores saves with an empty name', async () => {
  dbCalls.create.length = 0;
  dbCalls.update.length = 0;
  const { renderer, saved, closed } = await renderModal(null);

  await act(async () => {
    renderer.root.findByProps({ testID: 'custom-exercise-save' }).props.onPress();
    await flush();
  });

  assert.equal(dbCalls.create.length, 0);
  assert.equal(dbCalls.update.length, 0);
  assert.equal(saved.length, 0);
  assert.equal(closed(), 0);
});
