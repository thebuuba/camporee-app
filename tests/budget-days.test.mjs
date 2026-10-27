import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as dates from '../lib/date.ts';
import * as locale from '../lib/camporee-locale.ts';

const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
function all(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => all(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  return node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
}
async function harness() {
  await loadBindings();
  const filename = 'app/more/budget/budget-manager.tsx';
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
    '@/lib/date': dates, '@/lib/camporee-locale': locale,
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name] ?? new Proxy({ __esModule: true, default: name }, { get: (obj, key) => obj[key] ?? String(key) }) });
  return () => {
    cursor = 0;
    return module.exports.default({
      camporeeId: 'camp', userId: 'user', canEdit: false, currency: 'BOB', timeZone: 'America/La_Paz', areas: [],
      initialExpenses: [
        { id: 'a', description: 'Comida', amount: '20.25', spent_on: '2026-10-16' },
        { id: 'b', description: 'Transporte', amount: '5.50', spent_on: '2026-10-17' },
        { id: 'c', description: 'Agua', amount: '4.75', spent_on: '2026-10-16' },
      ],
      initialIncome: [{ id: 'd', description: 'Aporte', amount: '100.50', received_on: '2026-10-16' }],
    });
  };
}
const groups = tree => all(tree, node => node.type === 'section' && node.props['aria-labelledby']?.startsWith('budget-day-'));
const formatted = value => locale.formatCamporeeMoney(value, 'BOB', 2);

test('agrupa ingresos y gastos por fecha descendente con totales diarios decimales', async () => {
  const render = await harness();
  const days = groups(render());
  assert.equal(days.length, 2);
  assert.equal(days[0].props['aria-labelledby'], 'budget-day-2026-10-17');
  assert.equal(days[1].props['aria-labelledby'], 'budget-day-2026-10-16');
  assert.match(text(days[0]), /Transporte/);
  assert.doesNotMatch(text(days[0]), /Comida|Aporte/);
  assert.match(text(days[1]), /Comida/);
  assert.match(text(days[1]), /Agua/);
  assert.match(text(days[1]), /Aporte/);
  for (const amount of [100.50, 25, 75.50]) assert.ok(text(days[1]).includes(formatted(amount)));
  assert.ok(text(days[0]).includes(formatted(-5.50)));
});

test('filtros y búsqueda recalculan los grupos y sus totales y conservan el estado vacío', async () => {
  const render = await harness();
  const incomeButton = all(render(), node => node.type === 'button' && node.props.children === 'Ingresos')[0];
  incomeButton.props.onClick();
  let days = groups(render());
  assert.equal(days.length, 1);
  assert.match(text(days[0]), /Aporte/);
  assert.doesNotMatch(text(days[0]), /Comida|Agua|Transporte/);
  assert.ok(text(days[0]).includes(formatted(0)));
  const search = all(render(), node => node.type === 'input' && node.props.placeholder === 'Buscar movimiento o persona')[0];
  search.props.onChange({ target: { value: 'inexistente' } });
  assert.equal(groups(render()).length, 0);
  assert.match(text(render()), /No hay movimientos/);
});
