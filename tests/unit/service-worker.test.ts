import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

function exportedWorker() {
  const dir = mkdtempSync(join(tmpdir(), 'lifts-sw-'));
  cpSync('public', dir, { recursive: true });
  mkdirSync(join(dir, '_expo/static/js/web'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<html><head></head><body>shell</body></html>');
  writeFileSync(join(dir, '_expo/static/js/web/main-a.js'), 'main');
  writeFileSync(join(dir, '_expo/static/js/web/lazy-b.js'), 'lazy');
  writeFileSync(join(dir, '_expo/static/style-c.css'), 'css');
  execFileSync(process.execPath, ['scripts/postprocess-web-export.mjs', dir]);
  return readFileSync(join(dir, 'sw.js'), 'utf8');
}

function runtime(source: string, failedAsset?: string) {
  const origin = 'https://lifts.test';
  const stores = new Map<string, Map<string, Response>>();
  stores.set('unrelated-app', new Map());
  stores.set('lifts-shell-obsolete', new Map());
  const handlers = new Map<string, (event: any) => void>();
  let online = true;
  let claimed = false;
  let skipWaiting = false;
  const key = (request: string | Request) =>
    new URL(typeof request === 'string' ? request : request.url, origin).href;
  const network = async (request: string | Request) => {
    const url = key(request);
    if (!online || url.endsWith(failedAsset ?? 'never-fail')) throw new Error('offline');
    return new Response(url.endsWith('/index.html') ? 'shell' : url.split('/').at(-1));
  };
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (requests: (string | Request)[]) => {
        const responses = await Promise.all(requests.map(network));
        requests.forEach((request, i) => store.set(key(request), responses[i]));
      },
      match: async (request: string | Request) => store.get(key(request))?.clone(),
      put: async (request: string | Request, response: Response) => {
        store.set(key(request), response);
      },
    };
  };
  runInNewContext(source, {
    URL,
    Request,
    Response,
    fetch: network,
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (request: string | Request) => {
        for (const name of stores.keys()) {
          const response = await (await open(name)).match(request);
          if (response) return response;
        }
      },
    },
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: any) => void) =>
        handlers.set(name, handler),
      skipWaiting: () => {
        skipWaiting = true;
      },
      clients: {
        claim: async () => {
          claimed = true;
        },
      },
    },
  });
  return {
    stores,
    get claimed() {
      return claimed;
    },
    get skipWaiting() {
      return skipWaiting;
    },
    offline: () => {
      online = false;
    },
    lifecycle: async (name: string) => {
      const promises: Promise<unknown>[] = [];
      handlers.get(name)!({ waitUntil: (promise: Promise<unknown>) => promises.push(promise) });
      await Promise.all(promises);
    },
    request: (path: string, mode = 'cors', method = 'GET') => {
      let response: Promise<Response> | undefined;
      handlers.get('fetch')!({
        request: { url: new URL(path, origin).href, mode, method },
        respondWith: (promise: Promise<Response>) => {
          response = promise;
        },
      });
      return response;
    },
  };
}

test('first completed install supports offline shell, CSS, and unvisited lazy chunks', async () => {
  const worker = runtime(exportedWorker());
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  worker.offline();
  assert.equal(await (await worker.request('/', 'navigate'))?.text(), 'shell');
  assert.equal(await (await worker.request('/_expo/static/js/web/main-a.js'))?.text(), 'main-a.js');
  assert.equal(await (await worker.request('/_expo/static/js/web/lazy-b.js'))?.text(), 'lazy-b.js');
  assert.equal(await (await worker.request('/_expo/static/style-c.css'))?.text(), 'style-c.css');
  assert.equal(worker.claimed, true);
});

test('activation deletes only old Lifts caches and updates wait for existing clients', async () => {
  const worker = runtime(exportedWorker());
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  assert.equal(worker.stores.has('unrelated-app'), true);
  assert.equal(worker.stores.has('lifts-shell-obsolete'), false);
  assert.equal(worker.skipWaiting, false);
});

test('incomplete install fails without replacing a previous working cache', async () => {
  const worker = runtime(exportedWorker(), '/lazy-b.js');
  await assert.rejects(worker.lifecycle('install'), /offline/);
  assert.deepEqual([...worker.stores.keys()].sort(), ['lifts-shell-obsolete', 'unrelated-app']);
});

test('worker ignores cross-origin, non-GET, and private same-origin requests', async () => {
  const worker = runtime(exportedWorker());
  await worker.lifecycle('install');
  assert.equal(worker.request('https://elsewhere.test/_expo/static/main.js'), undefined);
  assert.equal(worker.request('/_expo/static/js/web/main-a.js', 'cors', 'POST'), undefined);
  assert.equal(worker.request('/api/private'), undefined);
});
