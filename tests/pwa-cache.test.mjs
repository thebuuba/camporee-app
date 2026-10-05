import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function loadServiceWorker({ cachedResponse, networkResponse, networkError, cacheError, installError, oldEntries = new Map(), networkFetch, cacheMatch, cacheDelete }) {
  const source = await readFile(resolve(root, 'public/sw.js'), 'utf8');
  const listeners = new Map();
  const cacheNames = new Set(['camporee-shell-v11', 'unrelated-cache']);
  let networkRequests = 0;
  let skippedWaiting = false;
  const writes = [];

  const cache = {
    addAll: async () => { if (installError) throw installError; },
    keys: async () => [],
    delete: async () => true,
    put: async (request, response) => { if (cacheError) throw cacheError; writes.push({ request, response }); },
  };
  const caches = {
    open: async (name) => ({ ...cache, keys: async () => name === 'camporee-shell-v11' ? [...oldEntries.keys()].map(url => new Request(url)) : [], match: async request => oldEntries.get(request.url)?.clone(), delete: async request => oldEntries.delete(request.url), put: async (request,response) => { if(cacheError) throw cacheError; writes.push({request,response,cacheName:name}); } }),
    match: async (request,options) => cacheMatch ? cacheMatch(request,options) : cachedResponse,
    keys: async () => [...cacheNames],
    delete: async (name) => cacheDelete ? cacheDelete(name) : cacheNames.delete(name),
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
    fetch: async (request) => {
      networkRequests += 1;
      if (networkFetch) return networkFetch(request);
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

async function navigate(worker, preloadResponse, path = '/') {
  let response;
  worker.listeners.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: `https://camporee.test${path}` },
    preloadResponse,
    respondWith(value) { response = value; },
    waitUntil() {},
  });
  return response;
}

test('el cancionero guarda HTML al preparar su copia desde una navegación interna', async () => {
  const fresh = new Response('<html>Cancionero</html>', {headers:{'Content-Type':'text/html'}});
  const worker = await loadServiceWorker({networkResponse:fresh});
  let response;
  worker.listeners.get('fetch')({request:new Request('https://camporee.test/more/songs',{headers:{Accept:'text/html'}}),respondWith(value){response=value;},waitUntil(){}});
  assert.ok(response, 'La preparación de la copia debe ser atendida por el service worker');
  assert.equal(await (await response).text(),'<html>Cancionero</html>');
  assert.equal(worker.writes.length,1);
});

test('el cancionero recupera la copia guardada cuando se pierde internet', async () => {
  const worker = await loadServiceWorker({cachedResponse:new Response('<html>Letra guardada</html>'),networkError:new TypeError('offline')});
  assert.equal(await (await navigate(worker,undefined,'/more/songs')).text(),'<html>Letra guardada</html>');
});

async function audioRequest(worker, range) {
  let response;
  worker.listeners.get('fetch')({request:new Request('https://camporee.test/audio/contracorriente.mp3',{headers:range?{Range:range}:{}}),respondWith(value){response=value;},waitUntil(){}});
  return response;
}

test('Contracorriente se guarda completa aunque el reproductor pida solo un tramo', async()=>{
  const worker=await loadServiceWorker({networkResponse:new Response('0123456789',{headers:{'Content-Type':'audio/mpeg'}})});
  const response=await audioRequest(worker,'bytes=2-5');
  assert.ok(response,'El audio del club debe ser atendido por el service worker');
  assert.equal(response.status,206);
  assert.equal(response.headers.get('Content-Range'),'bytes 2-5/10');
  assert.equal(await response.text(),'2345');
  assert.equal(await worker.writes[0].response.text(),'0123456789');
});

test('el audio guardado funciona sin internet y admite saltar a otro tramo', async()=>{
  const worker=await loadServiceWorker({cachedResponse:new Response('0123456789',{headers:{'Content-Type':'audio/mpeg'}}),networkError:new TypeError('offline')});
  assert.equal(await (await audioRequest(worker,'bytes=7-')).text(),'789');
  assert.equal(worker.networkRequests,0);
});

test('un tramo fuera del audio devuelve 416', async()=>{
  const worker=await loadServiceWorker({cachedResponse:new Response('0123456789')});
  const response=await audioRequest(worker,'bytes=20-30');
  assert.equal(response.status,416);
  assert.equal(response.headers.get('Content-Range'),'bytes */10');
});

test('una apertura online usa HTML actual aunque exista una versión antigua en caché', async () => {
  const stale = { source: 'old-build', ok: true, clone() { return this; } };
  const fresh = { source: 'current-build', ok: true, clone() { return this; } };
  const worker = await loadServiceWorker({ cachedResponse: stale, networkResponse: fresh });
  assert.equal((await navigate(worker)).source, 'current-build');
  assert.equal(worker.networkRequests, 1);
});

test('una visita a Tareas se conserva para volver a abrirla sin internet', async () => {
  const page = {source:'tasks',ok:true,clone(){return this}};
  const online = await loadServiceWorker({networkResponse:page});
  assert.equal((await navigate(online, undefined, '/tasks')).source,'tasks');
  assert.equal(online.writes[0].request.url,'https://camporee.test/tasks');
  const offline = await loadServiceWorker({cachedResponse:page,networkError:new Error('offline')});
  assert.equal((await navigate(offline, undefined, '/tasks')).source,'tasks');
});

test('las ilustraciones guardadas siguen disponibles cuando falla la red', async () => {
  const svg = {source:'saved-svg',ok:true,clone(){return this}};
  const worker = await loadServiceWorker({cachedResponse:svg,networkError:new Error('offline')});
  let response;
  worker.listeners.get('fetch')({request:{method:'GET',mode:'same-origin',url:'https://camporee.test/polymet-camp-preparation.svg'},respondWith(value){response=value}});
  assert.equal((await response).source,'saved-svg');
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
  const effects = [];
  let registrationActive = true;
  const cacheNames = new Set(['camporee-shell-v11', 'unrelated-cache']);
  const sandbox = {
    useEffect: (callback) => { effects.push(callback); },
    usePathname: () => "/",
    useRef: value => ({current:value}),
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
    .replace('new Set<AbortController>()', 'new Set()')
    .replace(/^['"]use client['"];\s*/m, '')
    .replace(/^import \{ useEffect, useRef \} from ['"]react['"];\s*/m, '')
    .replace(/^import \{ usePathname \} from ['"]next\/navigation['"];\s*/m, '')
    .replace('export default function PwaRegister', 'function PwaRegister')
    .concat('\nPwaRegister();');
  vm.runInNewContext(executable, sandbox);
  effects[0]();
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  await new Promise((resolvePromise) => setImmediate(resolvePromise));

  assert.equal(registrationActive, false);
  assert.deepEqual([...cacheNames], ['unrelated-cache']);
});

test('las actualizaciones conservan las paginas visitadas y los chunks de su version anterior',async()=>{
  const oldEntries=new Map([
    ['https://camporee.test/',new Response('<html>Inicio guardado</html>',{headers:{'Content-Type':'text/html'}})],
    ['https://camporee.test/_next/static/old.js',new Response('old bundle')],
  ]);
  const worker=await loadServiceWorker({oldEntries});let activation;
  worker.listeners.get('activate')({waitUntil:promise=>{activation=promise}});await activation;
  assert.equal(worker.writes.length,2);
  assert.equal(worker.writes[0].cacheName,'camporee-pages-v1');assert.equal(await worker.writes[0].response.text(),'<html>Inicio guardado</html>');
  assert.equal(worker.writes[1].cacheName,'camporee-assets-v1');assert.equal(worker.cacheNames.has('camporee-shell-v11'),false);
});
test('si no hay espacio para migrar una actualizacion no borra la copia anterior',async()=>{
  const worker=await loadServiceWorker({oldEntries:new Map([['https://camporee.test/',new Response('Inicio')]]),cacheError:new Error('quota')});let activation;
  worker.listeners.get('activate')({waitUntil:promise=>{activation=promise}});await activation;
  assert.equal(worker.cacheNames.has('camporee-shell-v11'),true);
});
test('la preparacion de cualquier panel guarda HTML, no solo el cancionero',async()=>{
  const worker=await loadServiceWorker({networkResponse:new Response('<html>Tareas</html>')});let response;
  worker.listeners.get('fetch')({request:new Request('https://camporee.test/tasks',{headers:{Accept:'text/html'}}),respondWith:value=>{response=value}});
  assert.ok(response);assert.equal(await (await response).text(),'<html>Tareas</html>');assert.equal(worker.writes[0].cacheName,'camporee-pages-v1');
});

test('cerrar sesion impide que una peticion privada pendiente vuelva a guardar datos',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve});
  const worker=await loadServiceWorker({networkFetch:request=>request.url.endsWith('/tasks')?pending:Promise.resolve(new Response('Login'))});
  const oldPage=navigate(worker,undefined,'/tasks');
  await navigate(worker,undefined,'/login');finish(new Response('PRIVATE OLD SESSION'));await oldPage;
  assert.equal(worker.writes.length,0);
});
test('el cambio de sesion tambien borra paginas de una cache antigua retenida',async()=>{
  const oldEntries=new Map([['https://camporee.test/tasks',new Response('Private')],['https://camporee.test/_next/static/old.js',new Response('bundle')]]);
  const worker=await loadServiceWorker({oldEntries});let clearing;
  worker.listeners.get('message')({data:{type:'CLEAR_PRIVATE_PAGES'},waitUntil:value=>{clearing=value}});await clearing;
  assert.equal(oldEntries.has('https://camporee.test/tasks'),false);assert.equal(oldEntries.has('https://camporee.test/_next/static/old.js'),true);
});

test('una lectura de cache pendiente no devuelve datos privados si se cambia la sesion',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve});
  const worker=await loadServiceWorker({networkError:new Error('offline'),cacheMatch:request=>String(request.url??request).endsWith('/offline')?new Response('Offline fallback'):pending});
  const oldPage=navigate(worker,undefined,'/tasks');await new Promise(resolve=>setImmediate(resolve));let clearing;
  worker.listeners.get('message')({data:{type:'CLEAR_PRIVATE_PAGES'},waitUntil:value=>{clearing=value}});await clearing;
  finish(new Response('PRIVATE OLD SESSION'));assert.equal(await (await oldPage).text(),'Offline fallback');
});
test('no recupera paginas privadas mientras se limpian las caches de otra sesion',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve});let privateReads=0;
  const worker=await loadServiceWorker({networkError:new Error('offline'),cacheDelete:()=>pending,cacheMatch:request=>{if(String(request.url??request).endsWith('/offline'))return new Response('Offline fallback');privateReads++;return new Response('PRIVATE OLD SESSION')}});let clearing;
  worker.listeners.get('message')({data:{type:'CLEAR_PRIVATE_PAGES'},waitUntil:value=>{clearing=value}});
  assert.equal(await (await navigate(worker,undefined,'/tasks')).text(),'Offline fallback');assert.equal(privateReads,0);
  finish(true);await clearing;
});
