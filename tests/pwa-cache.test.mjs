import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function loadServiceWorker({ cachedResponse, networkResponse, networkError, cacheError, installError }) {
  const source = await readFile(resolve(root, 'public/sw.js'), 'utf8');
  const listeners = new Map();
  const cacheNames = new Set(['camporee-shell-v11', 'unrelated-cache']);
  let networkRequests = 0;
  let skippedWaiting = false;
  const writes = [];

  const cache = {
    addAll: async () => { if (installError) throw installError; },
    put: async (request, response) => { if (cacheError) throw cacheError; writes.push({ request, response }); },
  };
  const caches = {
    open: async () => cache,
    match: async () => cachedResponse,
    keys: async () => [...cacheNames],
    delete: async (name) => cacheNames.delete(name),
  };
  const self = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: async () => { skippedWaiting = true; },
    clients: { claim: async () => undefined },
    registration: {},
  };

  vm.runInNewContext(source, {
    self,
    caches,
    clients: {},
    fetch: async () => {
      networkRequests += 1;
      if (networkError) throw networkError;
      return networkResponse;
    },
    location: { origin: 'https://camporee.test' },
    URL,
    Promise,
    Response,
  });

  return {
    listeners,
    cacheNames,
    writes,
    get skippedWaiting() { return skippedWaiting; },
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

async function navigate(worker, preloadResponse) {
  let response;
  worker.listeners.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: 'https://camporee.test/' },
    preloadResponse,
    respondWith(value) { response = value; },
    waitUntil() {},
  });
  return response;
}

test('una apertura online usa HTML actual aunque exista una versión antigua en caché', async () => {
  const stale = { source: 'old-build', ok: true, clone() { return this; } };
  const fresh = { source: 'current-build', ok: true, clone() { return this; } };
  const worker = await loadServiceWorker({ cachedResponse: stale, networkResponse: fresh });
  assert.equal((await navigate(worker)).source, 'current-build');
  assert.equal(worker.networkRequests, 1);
});

test('la apertura usa la página guardada solo cuando falla la conexión', async () => {
  const stale = { source: 'offline-copy', ok: true, clone() { return this; } };
  const worker = await loadServiceWorker({ cachedResponse: stale, networkError: new Error('offline') });
  assert.equal((await navigate(worker)).source, 'offline-copy');
});

test('un navegador sin precarga y sin espacio de caché puede abrir la versión actual', async () => {
  const fresh = { source: 'current-build', ok: true, clone() { return this; } };
  const worker = await loadServiceWorker({ networkResponse: fresh, cacheError: new Error('quota') });
  assert.equal((await navigate(worker)).source, 'current-build');
});

test('una redirección al login no reemplaza la página privada guardada', async () => {
  const login = { source: 'login', ok: true, redirected: true, clone() { return this; } };
  const worker = await loadServiceWorker({ networkResponse: login });
  assert.equal((await navigate(worker, Promise.resolve(login))).source, 'login');
  assert.equal(worker.writes.length, 0);
});

test('la actualización se instala aunque iOS no permita guardar los recursos iniciales', async () => {
  const worker = await loadServiceWorker({ installError: new Error('quota') });
  let installation;
  worker.listeners.get('install')({ waitUntil(value) { installation = value; } });
  await installation;
  assert.equal(worker.skippedWaiting, true);
});

test('una precarga rechazada vuelve a solicitar la página por red', async () => {
  const fresh = { source: 'current-build', ok: true, clone() { return this; } };
  const worker = await loadServiceWorker({ networkResponse: fresh });
  assert.equal((await navigate(worker, Promise.reject(new Error('preload failed')))).source, 'current-build');
  assert.equal(worker.networkRequests, 1);
});

test('sin internet ni copia guardada se devuelve un error de red válido', async () => {
  const worker = await loadServiceWorker({ networkError: new Error('offline') });
  assert.equal((await navigate(worker)).type, 'error');
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
