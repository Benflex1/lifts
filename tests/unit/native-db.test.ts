import { test } from 'node:test';
import * as assert from 'node:assert/strict';

test('shares one database open between interleaved getDatabase and getStore calls', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Node module mocks are required to isolate expo-sqlite');
    return;
  }

  let openCalls = 0;
  let releaseOpen: (() => void) | undefined;
  const openGate = new Promise<void>((resolve) => {
    releaseOpen = resolve;
  });
  const database = {};
  let createdStoreDatabase: unknown;
  const store = { init: async () => {} };

  t.mock.module('expo-sqlite', {
    exports: {
      openDatabaseAsync: async () => {
        openCalls += 1;
        await openGate;
        return database;
      },
    },
  });
  t.mock.module('../../src/database/nativeStore.ts', {
    exports: {
      createNativeStore: (driver: unknown) => {
        createdStoreDatabase = driver;
        return store;
      },
    },
  });

  const { getDatabase, getStore } = await import('../../src/database/db.native?database-store-interleaving');
  const databasePromise = getDatabase();
  const storePromise = getStore();
  releaseOpen!();

  const [resolvedDatabase, resolvedStore] = await Promise.all([databasePromise, storePromise]);

  assert.equal(openCalls, 1);
  assert.equal(resolvedDatabase, database);
  assert.equal(createdStoreDatabase, database);
  assert.equal(resolvedStore, store);
});

test('clears a failed database open so a later store request retries', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Node module mocks are required to isolate expo-sqlite');
    return;
  }

  let openCalls = 0;
  let shouldFail = true;
  const database = {};

  t.mock.module('expo-sqlite', {
    exports: {
      openDatabaseAsync: async () => {
        openCalls += 1;
        if (shouldFail) throw new Error('open failed');
        return database;
      },
    },
  });
  t.mock.module('../../src/database/nativeStore.ts', {
    exports: {
      createNativeStore: () => ({ init: async () => {} }),
    },
  });

  const { getDatabase, getStore } = await import('../../src/database/db.native?database-open-retry');
  const firstDatabase = getDatabase();
  const firstStore = getStore();

  await assert.rejects(Promise.all([firstDatabase, firstStore]), /open failed/);

  shouldFail = false;
  await getStore();

  assert.equal(openCalls, 2);
  assert.equal(await getDatabase(), database);
});

test('coalesces concurrent native store initialization onto one SQLite connection', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Node module mocks are required to isolate expo-sqlite');
    return;
  }

  let openCalls = 0;
  let releaseOpen: (() => void) | undefined;
  const openGate = new Promise<void>((resolve) => {
    releaseOpen = resolve;
  });
  const database = {};

  t.mock.module('expo-sqlite', {
    exports: {
      openDatabaseAsync: async () => {
        openCalls += 1;
        await openGate;
        return database;
      },
    },
  });
  t.mock.module('../../src/database/nativeStore.ts', {
    exports: {
      createNativeStore: () => ({ init: async () => {} }),
    },
  });

  const { getStore } = await import('../../src/database/db.native?store-concurrency');
  const firstStore = getStore();
  const secondStore = getStore();
  releaseOpen!();

  const [first, second] = await Promise.all([firstStore, secondStore]);

  assert.equal(openCalls, 1);
  assert.equal(first, second);
});

test('coalesces concurrent initDatabase calls onto one store init', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Node module mocks are required to isolate expo-sqlite');
    return;
  }

  let initCalls = 0;
  let signalInitStarted: (() => void) | undefined;
  const initStarted = new Promise<void>((resolve) => {
    signalInitStarted = resolve;
  });
  let releaseInit: (() => void) | undefined;
  const initGate = new Promise<void>((resolve) => {
    releaseInit = resolve;
  });
  const store = {
    init: async () => {
      initCalls += 1;
      if (initCalls === 1) {
        signalInitStarted!();
        await initGate;
      }
    },
  };

  t.mock.module('expo-sqlite', {
    exports: {
      openDatabaseAsync: async () => ({}),
    },
  });
  t.mock.module('../../src/database/nativeStore.ts', {
    exports: {
      createNativeStore: () => store,
    },
  });

  const { initDatabase } = await import('../../src/database/db.native?init-concurrency');
  const firstInit = initDatabase();
  const secondInit = initDatabase();
  await initStarted;

  assert.equal(initCalls, 1);
  releaseInit!();
  await Promise.all([firstInit, secondInit]);
});

test('clears failed initDatabase state so a later retry runs store init again', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Node module mocks are required to isolate expo-sqlite');
    return;
  }

  let initCalls = 0;
  let shouldFail = true;
  let signalInitStarted: (() => void) | undefined;
  const initStarted = new Promise<void>((resolve) => {
    signalInitStarted = resolve;
  });
  let releaseInit: (() => void) | undefined;
  const initGate = new Promise<void>((resolve) => {
    releaseInit = resolve;
  });
  const store = {
    init: async () => {
      initCalls += 1;
      if (initCalls === 1) {
        signalInitStarted!();
        await initGate;
      }
      if (shouldFail) throw new Error('init failed');
    },
  };

  t.mock.module('expo-sqlite', {
    exports: {
      openDatabaseAsync: async () => ({}),
    },
  });
  t.mock.module('../../src/database/nativeStore.ts', {
    exports: {
      createNativeStore: () => store,
    },
  });

  const { initDatabase } = await import('../../src/database/db.native?init-retry');
  const firstInit = initDatabase();
  const secondInit = initDatabase();
  await initStarted;

  assert.equal(initCalls, 1);
  releaseInit!();
  await assert.rejects(Promise.all([firstInit, secondInit]), /init failed/);

  shouldFail = false;
  await initDatabase();
  assert.equal(initCalls, 2);
});

test('runs successful sequential initDatabase calls independently', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Node module mocks are required to isolate expo-sqlite');
    return;
  }

  let initCalls = 0;
  const store = {
    init: async () => {
      initCalls += 1;
    },
  };

  t.mock.module('expo-sqlite', {
    exports: {
      openDatabaseAsync: async () => ({}),
    },
  });
  t.mock.module('../../src/database/nativeStore.ts', {
    exports: {
      createNativeStore: () => store,
    },
  });

  const { initDatabase } = await import('../../src/database/db.native?init-sequential-success');

  await initDatabase();
  await initDatabase();

  assert.equal(initCalls, 2);
});

test('resets a failed native initialization so retry opens a fresh database', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Node module mocks are required to isolate expo-sqlite');
    return;
  }

  let openCalls = 0;
  let initCalls = 0;
  let closeCalls = 0;
  const databaseOne = {
    closeAsync: async () => {
      closeCalls += 1;
    },
  };
  const databaseTwo = {
    closeAsync: async () => {},
  };
  const databases: unknown[] = [];
  const initError = new Error('first init failed');
  const store = {
    init: async () => {
      initCalls += 1;
      if (initCalls === 1) throw initError;
    },
  };

  t.mock.module('expo-sqlite', {
    exports: {
      openDatabaseAsync: async () => {
        openCalls += 1;
        const database = openCalls === 1 ? databaseOne : databaseTwo;
        databases.push(database);
        return database;
      },
    },
  });
  t.mock.module('../../src/database/nativeStore.ts', {
    exports: {
      createNativeStore: () => store,
    },
  });

  const { initDatabase } = await import('../../src/database/db.native?init-failed-reset');

  await assert.rejects(initDatabase(), (error: unknown) => error === initError);
  assert.equal(closeCalls, 1);

  await initDatabase();

  assert.equal(openCalls, 2);
  assert.deepEqual(databases, [databaseOne, databaseTwo]);
});

test('preserves the init error when failed database cleanup rejects and still retries', async (t) => {
  if (typeof t.mock.module !== 'function') {
    t.skip('Node module mocks are required to isolate expo-sqlite');
    return;
  }

  let openCalls = 0;
  let initCalls = 0;
  const databaseOne = {
    closeAsync: async () => {
      throw new Error('close failed');
    },
  };
  const databaseTwo = {
    closeAsync: async () => {},
  };
  const initError = new Error('original init failed');
  const store = {
    init: async () => {
      initCalls += 1;
      if (initCalls === 1) throw initError;
    },
  };

  t.mock.module('expo-sqlite', {
    exports: {
      openDatabaseAsync: async () => {
        openCalls += 1;
        return openCalls === 1 ? databaseOne : databaseTwo;
      },
    },
  });
  t.mock.module('../../src/database/nativeStore.ts', {
    exports: {
      createNativeStore: () => store,
    },
  });

  const { initDatabase } = await import('../../src/database/db.native?init-close-failure');

  await assert.rejects(initDatabase(), (error: unknown) => error === initError);
  await initDatabase();

  assert.equal(openCalls, 2);
});
