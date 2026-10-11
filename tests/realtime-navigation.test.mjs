import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseTenantPath, tenantPath } from '../lib/tenant-context.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireFromHere = createRequire(import.meta.url);
const { loadBindings, transform } = requireFromHere('next/dist/build/swc');

function jsx(type, props, key) {
  return { type, key, props: props ?? {} };
}

async function loadTsx(relativePath, modules, globals = {}) {
  const source = await readFile(resolve(root, relativePath), 'utf8');
  await loadBindings();
  const { code: compiled } = await transform(source, {
    filename: relativePath,
    isModule: true,
    jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name in modules) return modules[name];
      throw new Error(`Unexpected module: ${name}`);
    },
    console,
    ...globals,
  });
  return module.exports.default;
}

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
}

test('la sincronizacion escucha cambios publicados y refresca la ruta activa', async () => {
  const effects = [];
  const registrations = [];
  const refreshes = [];
  const channel = {
    on(type, filter, callback) {
      registrations.push({ type, filter, callback });
      return this;
    },
    subscribe() { return this; },
  };
  const supabase = {
    channel() { return channel; },
    removeChannel(value) { assert.equal(value, channel); },
  };
  const timers = [];
  const window = {
    addEventListener() {},
    removeEventListener() {},
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
  };
  const DataFreshness = await loadTsx('app/components/data-freshness.tsx', {
    react: {
      useEffect(callback) { effects.push(callback); },
      useRef(value) { return { current: value }; },
    },
    'next/navigation': {
      usePathname: () => '/o/50000000-0000-4000-8000-000000000001/c/60000000-0000-4000-8000-000000000001/tasks',
      useRouter: () => ({ refresh: () => refreshes.push('refresh') }),
    },
    '@/lib/supabase/client': { createClient: () => supabase },
    '@/lib/tenant-context': { parseTenantPath },
  }, {
    window,
    navigator: { onLine: true },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
  });

  DataFreshness();
  const cleanups = effects.map((effect) => effect()).filter(Boolean);

  assert.ok(registrations.length > 3);
  assert.ok(registrations.every(reg => reg.type === 'postgres_changes'));
  const tasks = registrations.find(reg => reg.filter.table === 'tasks');
  assert.deepEqual({ ...tasks.filter }, {
    event:'*',schema:'public',table:'tasks',filter:'camporee_id=eq.60000000-0000-4000-8000-000000000001',
  });
  assert.equal(registrations.some(reg => !reg.filter.table), false);
  assert.ok(registrations.some(reg => reg.filter.table === 'organization_members' && reg.filter.filter === 'organization_id=eq.50000000-0000-4000-8000-000000000001'));
  registrations[0].callback({ table: 'tasks' });
  assert.equal(timers.length, 1);
  timers[0]();
  assert.deepEqual(refreshes, ['refresh']);
  cleanups.forEach((cleanup) => cleanup());
});

test('las tarjetas de Mas delegan la precarga al enlace sin lanzar una precarga manual masiva', async () => {
  const effects = [];
  let prefetches = 0;
  const ReliableLink = await loadTsx('app/components/reliable-link.tsx', {
    '@/lib/tenant-context': { parseTenantPath, tenantPath },
    'next/link': 'next-link',
    react: {
      useEffect(callback) { effects.push(callback); },
      useRef(value) { return { current: value }; },
      useState(value) { return [value, () => undefined]; },
    },
    'next/navigation': {
      usePathname: () => '/more',
      useRouter: () => ({ push() {}, prefetch() { prefetches += 1; } }),
    },
  }, { window: { clearTimeout() {} } });

  const link = ReliableLink({ href: '/more/tasks', children: 'Tareas' });
  effects.map((effect) => effect());

  assert.equal(prefetches, 0);
  assert.equal(link.type, 'next-link');
  assert.equal(link.props.prefetch, true);
});

test('Intentar de nuevo recarga la ruta completa cuando el panel queda en error', async () => {
  let reloads = 0;
  const ErrorPage = await loadTsx('app/error.tsx', {
    react: { useEffect() {} },
    'lucide-react': { AlertTriangle: () => null, RotateCcw: () => null },
  }, {
    window: { location: { reload() { reloads += 1; } } },
  });

  const tree = ErrorPage({ error: new Error('timeout'), reset() {} });
  const retry = findElement(tree, (node) => node.type === 'button');
  assert.ok(retry);
  retry.props.onClick();

  assert.equal(reloads, 1);
});
