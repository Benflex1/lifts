import assert from 'node:assert/strict';
import test from 'node:test';
import TestRenderer, { act } from 'react-test-renderer';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

mockModule('react-native', {
  TextInput: 'TextInput',
  StyleSheet: { create: (styles: unknown) => styles },
});

async function renderNoteInput(props: {
  exerciseId: string;
  notes?: string;
  onCommit: (exerciseId: string, notes: string) => void;
}) {
  const { ExerciseNoteInput } = await import('../../src/components/ExerciseNoteInput');
  const React = await import('react');

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(ExerciseNoteInput, { placeholder: 'Add note', ...props }),
    );
  });

  const input = renderer.root.findByType('TextInput' as never);
  return { renderer, input, React, Component: ExerciseNoteInput };
}

test('keystrokes commit only after the debounce fires', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const commits: Array<[string, string]> = [];
  const { input } = await renderNoteInput({
    exerciseId: 'ex-1',
    notes: '',
    onCommit: (exerciseId, notes) => commits.push([exerciseId, notes]),
  });

  act(() => {
    input.props.onChangeText('s');
    input.props.onChangeText('se');
    input.props.onChangeText('seat pin 4');
  });
  assert.deepEqual(commits, [], 'no session commit while typing');

  act(() => {
    t.mock.timers.tick(249);
  });
  assert.deepEqual(commits, [], 'still nothing just before the delay');

  act(() => {
    t.mock.timers.tick(1);
  });
  assert.deepEqual(commits, [['ex-1', 'seat pin 4']], 'one commit with the latest text');
});

test('blur flushes the pending note immediately', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const commits: Array<[string, string]> = [];
  const { input } = await renderNoteInput({
    exerciseId: 'ex-2',
    notes: '',
    onCommit: (exerciseId, notes) => commits.push([exerciseId, notes]),
  });

  act(() => {
    input.props.onChangeText('tempo 3-1-1');
    input.props.onBlur();
  });
  assert.deepEqual(commits, [['ex-2', 'tempo 3-1-1']]);

  act(() => {
    t.mock.timers.tick(500);
  });
  assert.deepEqual(commits, [['ex-2', 'tempo 3-1-1']], 'the flushed note is not committed twice');
});

test('unmount flushes the pending note', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const commits: Array<[string, string]> = [];
  const { renderer, input } = await renderNoteInput({
    exerciseId: 'ex-3',
    notes: '',
    onCommit: (exerciseId, notes) => commits.push([exerciseId, notes]),
  });

  act(() => {
    input.props.onChangeText('left knee felt off');
  });
  assert.deepEqual(commits, []);

  act(() => {
    renderer.unmount();
  });
  assert.deepEqual(commits, [['ex-3', 'left knee felt off']], 'unmount never drops text');
});

test('external note updates are adopted without re-committing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const commits: Array<[string, string]> = [];
  const { renderer, React, Component } = await renderNoteInput({
    exerciseId: 'ex-4',
    notes: 'first',
    onCommit: (exerciseId, notes) => commits.push([exerciseId, notes]),
  });

  act(() => {
    renderer.update(
      React.createElement(Component, {
        exerciseId: 'ex-4',
        notes: 'restored from draft',
        onCommit: (id: string, n: string) => commits.push([id, n]),
      }),
    );
  });

  const updatedInput = renderer.root.findByType('TextInput' as never);
  assert.equal(updatedInput.props.value, 'restored from draft');
  assert.deepEqual(commits, [], 'adopting external text does not commit it back');
});
