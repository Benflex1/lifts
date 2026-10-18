import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { installReactNativeMock, loadRNTL, mockModule } from '../helpers/rntlHarness';

const platform = { OS: 'web' };
let shares = 0;
installReactNativeMock({
  Platform: platform,
  Share: {
    share: async () => {
      shares += 1;
    },
  },
});
mockModule('../../src/context/WorkoutContext', {
  usePersistenceError: () => new Error('Disk full'),
  useWorkoutActions: () => ({ retryPersistence: async () => {} }),
});
const errors: unknown[] = [];
mockModule('../../src/context/DialogContext', {
  useDialog: () => ({
    notify: async (error: unknown) => {
      errors.push(error);
    },
  }),
});
// Exercise the browser download implementation, without involving persisted data.
const { saveBackupJson } = require('../../src/utils/saveBackup.web');
mockModule('../../src/utils/saveBackup', { saveBackupJson });
const { PersistenceErrorBanner } = require('../../src/components/PersistenceErrorBanner');
const rntl = loadRNTL();
const workout = { id: 'unsaved-1', name: 'Latest unsaved session', exercises: [] };

test('browser save recovery downloads the in-memory workout without Web Share', async t => {
  let blob: Blob | undefined;
  let clicked = false;
  const anchor = {
    href: '',
    download: '',
    click: () => {
      clicked = true;
    },
  };
  t.mock.method(URL, 'createObjectURL', (value: Blob) => {
    blob = value;
    return 'blob:recovery';
  });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => anchor },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const view = await rntl.render(React.createElement(PersistenceErrorBanner, { workout }));
  await rntl.fireEvent.press(view.getByLabelText('Save a copy of the workout'));
  assert.equal(clicked, true, 'unsaved data must be downloadable even without navigator.share');
  assert.ok(anchor.download.endsWith('.json'));
  assert.deepEqual(JSON.parse(await blob!.text()), workout);
  assert.equal(shares, 0);
  assert.deepEqual(errors, []);
  await view.unmount();
});

test('native save recovery retains the platform share action', async () => {
  platform.OS = 'android';
  shares = 0;
  const view = await rntl.render(React.createElement(PersistenceErrorBanner, { workout }));
  await rntl.fireEvent.press(view.getByLabelText('Share a copy of the workout'));
  assert.equal(shares, 1);
  await view.unmount();
});
