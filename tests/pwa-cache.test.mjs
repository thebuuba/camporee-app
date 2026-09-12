import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function loadServiceWorker({ cachedResponse, networkResponse }) {
  const source = await readFile(resolve(root, 'public/sw.js'), 'utf8');
  const listeners = new Map();
  const cacheNames = new Set(['camporee-shell-v11', 'unrelated-cache']);
  let networkRequests = 0;

  const cache = {
    addAll: async () => undefined,
    put: async () => undefined,
  };
  const caches = {
    open: async () => cache,
    match: async () => cachedResponse,
    keys: async () => [...cacheNames],
    delete: async (name) => cacheNames.delete(name),
  };
  const self = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };

  vm.runInNewContext(source, {
    self,
    caches,
    clients: {},
    fetch: async () => {
      networkRequests += 1;
      return networkResponse;
    },
    location: { origin: 'https://camporee.test' },
    URL,
    Promise,
  });

  return {
    listeners,
    cacheNames,
    get networkRequests() {
      return networkRequests;
    },
  };
}

test('los estilos estaticos consultan la red antes de reutilizar una copia antigua', async () => {
  const stale = { source: 'cache', ok: true, clone() { return this; } };
  const fresh = { source: 'network', ok: true, clone() { return this; } };
  const worker = await loadServiceWorker({ cachedResponse: stale, networkResponse: fresh });
  let response;

  worker.listeners.get('fetch')({
    request: {
      method: 'GET',
      mode: 'same-origin',
      url: 'https://camporee.test/_next/static/css/app.css',
    },
    respondWith(value) {
      response = value;
    },
  });

  assert.equal((await response).source, 'network');
  assert.equal(worker.networkRequests, 1);
});

test('al activar una version nueva solo elimina caches anteriores de Camporee', async () => {
  const response = { ok: true, clone() { return this; } };
  const worker = await loadServiceWorker({ cachedResponse: response, networkResponse: response });
  let activation;

  worker.listeners.get('activate')({
    waitUntil(value) {
      activation = value;
    },
  });
  await activation;

  assert.deepEqual([...worker.cacheNames], ['unrelated-cache']);
});

test('en desarrollo se desactiva el service worker y se limpia su cache', async () => {
  const source = await readFile(resolve(root, 'app/components/pwa-register.tsx'), 'utf8');
  let effect;
  let registrationActive = true;
  const cacheNames = new Set(['camporee-shell-v11', 'unrelated-cache']);
  const sandbox = {
    useEffect: (callback) => { effect = callback; },
    navigator: {
      serviceWorker: {
        getRegistration: async () => ({
          unregister: async () => {
            registrationActive = false;
            return true;
          },
        }),
        register: async () => ({ update: async () => undefined }),
      },
    },
    caches: {
      keys: async () => [...cacheNames],
      delete: async (name) => cacheNames.delete(name),
    },
    document: { readyState: 'complete' },
    window: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    process: { env: { NODE_ENV: 'development' } },
    Promise,
  };

  const executable = source
    .replace(/^['"]use client['"];\s*/m, '')
    .replace(/^import \{ useEffect \} from ['"]react['"];\s*/m, '')
    .replace('export default function PwaRegister', 'function PwaRegister')
    .concat('\nPwaRegister();');
  vm.runInNewContext(executable, sandbox);
  effect();
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  await new Promise((resolvePromise) => setImmediate(resolvePromise));

  assert.equal(registrationActive, false);
  assert.deepEqual([...cacheNames], ['unrelated-cache']);
});
