import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as mutation from '../lib/mutation-result.ts';

const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
const listId = '70000000-0000-4000-8000-000000000001';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
}
function findAll(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) findAll(child, predicate, result);
  return result;
}
async function createHarness({ canEdit = true, insertError = null } = {}) {
  await loadBindings();
  const filename = 'app/more/lists/[listId]/list-detail-manager.tsx';
  const source = await readFile(new URL('../' + filename, import.meta.url), 'utf8');
  const { code } = await transform(source, {
    filename,
    jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  const hooks = [];
  const records = { insertions: [], refreshed: 0, success: [], errors: [], resets: 0 };
  let pointer = 0;

  const react = {
    useState(initial) {
      const slot = pointer++;
      if (!(slot in hooks)) hooks[slot] = typeof initial === 'function' ? initial() : initial;
      return [hooks[slot], next => {
        hooks[slot] = typeof next === 'function' ? next(hooks[slot]) : next;
      }];
    },
    useRef(initial) {
      const slot = pointer++;
      if (!(slot in hooks)) hooks[slot] = { current: initial };
      return hooks[slot];
    },
    useEffect() { pointer++; },
  };
  const supabase = {
    from(table) {
      assert.equal(table, 'list_items');
      return {
        insert(values) {
          records.insertions.push(values);
          return {
            select() {
              return {
                async single() {
                  return insertError ? { data: null, error: insertError } : {
                    data: { id: 'item-new', label: values.label, quantity: values.quantity,
                      unit: values.unit, notes: values.notes, is_done: false, sort_order: 1 }, error: null,
                  };
                }
              };
            }
          };
        },
      };
    }
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const module = { exports: {} };
  const modules = {
    '@/lib/mutation-result': mutation,
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'lucide-react': {
      Check: 'check', ChevronDown: 'chevron-down', ListChecks: 'list-checks',
      Plus: 'plus', Trash2: 'trash', X: 'close',
    },
    'next/navigation': { useRouter: () => ({ refresh: () => records.refreshed++, replace() {} }) },
    '@/lib/supabase/client': { createClient: () => supabase },
    '@/lib/client-ui': {
      confirmRemoval: () => false,
      reportMutationSuccess: message => records.success.push(message),
      reportMutationError: (err, message) => records.errors.push(message),
    },
  };
  class FormDataMock {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values[name] ?? null; }
  }
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => {
      if (!(name in modules)) throw new Error('Unexpected dependency: ' + name);
      return modules[name];
    },
    console, FormData: FormDataMock,
  });
  function render() {
    pointer = 0;
    return module.exports.default({
      camporeeId: 'camporee', listId, canEdit,
      initialItems: [{ id: 'item-1', label: 'Ajo', quantity: 5, unit: 'libra', is_done: false, notes: null, sort_order: 0 }],
      backHref: '/more/lists',
    });
  }
  return { render, records };
}
const classIs = name => node => node.props?.className === name;
function clickOpen(render) {
  const button = find(render(), node => node.type === 'button' && classIs('pm-list-open-add')(node));
  assert.ok(button, 'simple add control is visible');
  button.props.onClick();
}
function enterLabel(render, label) {
  const input = find(render(), node => node.type === 'input' && node.props?.name === 'label');
  assert.ok(input, 'inline item field exists');
  input.props.onChange({ target: { value: label } });
}
function submit(render, values) {
  const form = find(render(), node => node.type === 'form' && classIs('pm-list-add-form')(node));
  assert.ok(form);
  form.props.onSubmit({ preventDefault() {}, currentTarget: { values, reset() {} } });
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test('tap Agregar shows a focused compact composer, not all detail fields at once', async () => {
  const { render } = await createHarness();
  assert.equal(find(render(), node => node.type === 'form' && classIs('pm-list-add-form')(node)), undefined);
  clickOpen(render);
  const tree = render();
  assert.ok(find(tree, node => node.type === 'input' && node.props?.name === 'label'));
  assert.equal(find(tree, node => node.props?.name === 'quantity'), undefined);
  assert.equal(find(tree, node => node.props?.name === 'notes'), undefined);
  const add = find(tree, node => node.type === 'button' && classIs('pm-list-add-submit')(node));
  assert.equal(add.props.disabled, true);
  enterLabel(render, 'Agua');
  assert.equal(find(render(), node => node.type === 'button' && classIs('pm-list-add-submit')(node)).props.disabled, false);
});
test('quantity and notes remain editable through optional disclosure', async () => {
  const { render } = await createHarness();
  clickOpen(render);
  const toggle = find(render(), node => node.type === 'button' && classIs('pm-list-add-options')(node));
  assert.equal(toggle.props['aria-expanded'], false);
  toggle.props.onClick();
  const opened = render();
  assert.equal(find(opened, node => node.type === 'button' && classIs('pm-list-add-options')(node)).props['aria-expanded'], true);
  for (const field of ['quantity', 'unit', 'notes']) {
    assert.ok(find(opened, node => node.props?.name === field), field + ' should be available');
  }
});
test('rapid add defaults to one item, clears the name, and keeps composer open for another', async () => {
  const { render, records } = await createHarness();
  clickOpen(render);
  enterLabel(render, 'Linterna');
  submit(render, { label: 'Linterna' });
  await flush();
  assert.equal(records.insertions.length, 1);
  assert.deepEqual({ ...records.insertions[0] }, {
    camporee_id: 'camporee', list_id: listId, label: 'Linterna', quantity: 1, unit: null, notes: null,
  });
  assert.equal(records.refreshed, 1);
  assert.deepEqual(records.success, ['Elemento agregado.']);
  assert.equal(find(render(), node => node.type === 'input' && node.props?.name === 'label').props.value, '');
  assert.ok(find(render(), node => node.type === 'form' && classIs('pm-list-add-form')(node)));
  assert.ok(find(render(), node => node.type === 'strong' && node.props?.children === 'Linterna'));
});
test('detailed add retains quantity, unit and notes and preserves draft on error', async () => {
  const { render, records } = await createHarness({ insertError: new Error('connection failed') });
  clickOpen(render);
  enterLabel(render, 'Ajo');
  const toggle = find(render(), node => node.type === 'button' && classIs('pm-list-add-options')(node));
  toggle.props.onClick();
  submit(render, { label: 'Ajo', quantity: '5', unit: 'libra', notes: 'Para el almuerzo' });
  await flush();
  assert.deepEqual({ ...records.insertions[0] }, {
    camporee_id: 'camporee', list_id: listId, label: 'Ajo', quantity: 5, unit: 'libra', notes: 'Para el almuerzo',
  });
  assert.equal(records.refreshed, 0);
  assert.equal(records.success.length, 0);
  assert.equal(records.errors.length, 1);
  assert.equal(find(render(), node => node.props?.name === 'label').props.value, 'Ajo');
});
test('viewer still cannot create or delete items', async () => {
  const { render } = await createHarness({ canEdit: false });
  assert.equal(find(render(), node => classIs('pm-list-open-add')(node)), undefined);
  assert.equal(find(render(), node => classIs('pm-list-remove-list')(node)), undefined);
  assert.ok(find(render(), node => node.type === 'p' && classIs('pm-list-readonly-note')(node)));
});
test('destructive list action stays inside native expandable options', async () => {
  const { render } = await createHarness();
  const details = find(render(), node => node.type === 'details' && classIs('pm-list-manage')(node));
  assert.ok(details);
  assert.ok(find(details, node => node.type === 'summary'));
  assert.ok(find(details, node => node.type === 'button' && classIs('pm-list-remove-list')(node)));
});
test('composer uses a compact white card and a readable iPhone keyboard input', async () => {
  const css = await readFile(new URL('../app/lists.css', import.meta.url), 'utf8');
  assert.match(css, /\.pm-list-add-form\s*\{[^}]*background:\s*#fff/s);
  assert.match(css, /\.pm-list-add-main\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /font-size:\s*16px; \/\* Prevent unwanted focus zoom on iOS/);
});
