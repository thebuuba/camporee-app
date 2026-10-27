import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as locale from '../lib/camporee-locale.ts';

const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
const SHEET = '@/app/components/bottom-sheet';
const DESC = 'polymet-task-desc';

function all(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => all(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  return node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
}
const descriptions = (tree, scope) => all(scope ?? tree, node => node.type === 'p' && node.props?.className === DESC);

async function harness(initialTasks) {
  await loadBindings();
  const filename = 'app/tasks/task-manager.tsx';
  const { code } = await transform(await readFile(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const states = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useEffect() {}, useMemo: fn => fn(), useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    } },
    'next/navigation': { useRouter: () => ({}) },
    '@/lib/supabase/client': { createClient: () => ({}) },
    '@/lib/camporee-locale': locale,
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name] ?? new Proxy({ __esModule: true, default: name }, { get: (obj, key) => obj[key] ?? String(key) }) });
  return () => {
    cursor = 0;
    return module.exports.default({ camporeeId: 'camp', userId: 'user', canEdit: false, initialTasks, areas: [], assignees: [], participants: [] });
  };
}
const base = overrides => ({ id: 't1', title: 'Tarea', description: null, status: 'pending', priority: 'normal', phase: 'before', assigned_to: null, task_checklist_items: [], ...overrides });
const openCard = tree => all(tree, node => node.props?.role === 'button' && typeof node.props.onClick === 'function')[0];
const openSheet = tree => all(tree, node => node.type === SHEET && node.props?.open === true)[0];

test('la descripción no vacía se muestra bajo el título en la tarjeta', async () => {
  const render = await harness([base({ description: 'Linea uno\nLinea dos con palabrasmuylargassin espacios' })]);
  const tree = render();
  const found = descriptions(tree);
  assert.equal(found.length, 1);
  assert.match(text(found[0]), /Linea uno/);
  assert.match(text(found[0]), /palabrasmuylargassin espacios/);
  const card = all(tree, node => typeof node.props?.className === 'string' && node.props.className.includes('polymet-task-row'))[0];
  assert.match(text(card), /Linea uno/);
});

test('al abrir el checklist se muestra la descripción completa con sus saltos', async () => {
  const render = await harness([base({ description: 'Detalle secreto con salto\nsegunda linea larga' })]);
  openCard(render()).props.onClick();
  const sheet = openSheet(render());
  assert.ok(sheet, 'el BottomSheet del checklist debe abrirse');
  assert.match(text(sheet), /Detalle secreto con salto/);
  assert.match(text(sheet), /segunda linea larga/);
  assert.equal(descriptions(null, sheet).length, 1);
});

test('sin descripción no se renderiza ningún párrafo vacío', async () => {
  for (const description of [null, '', '   ']) {
    const render = await harness([base({ description })]);
    const tree = render();
    assert.equal(descriptions(tree).length, 0);
    openCard(render()).props.onClick();
    const sheet = openSheet(render());
    assert.ok(sheet);
    assert.equal(descriptions(null, sheet).length, 0);
  }
});
