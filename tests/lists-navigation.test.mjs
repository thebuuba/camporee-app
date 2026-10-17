import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');

const org = '50000000-0000-4000-8000-000000000001';
const camp = '60000000-0000-4000-8000-000000000001';
const listId = '70000000-0000-4000-8000-000000000001';

async function detailPage({ found = true, editable = true } = {}) {
  const queries = [];
  const from = table => {
    const query = { table, filters: [] };
    queries.push(query);
    const builder = {
      select(fields) { query.fields = fields; return this; },
      eq(column, value) { query.filters.push([column, value]); return this; },
      order() { return this; },
      async maybeSingle() {
        return { data: found ? { id: listId, title: 'Equipaje', category: 'Materiales',
          list_items: [
            { id: 'item-2', label: 'Brújula', is_done: true, sort_order: 8 },
            { id: 'item-1', label: 'Linterna', is_done: false, sort_order: 0 },
          ]
        } : null, error: null };
      },
      then(resolve, reject) {
        return Promise.resolve({ data: [{ id: 'item-1', label: 'Linterna', is_done: false }], error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': { ChevronLeft: 'chevron-left' },
    'next/navigation': { notFound() { throw new Error('notFound'); } },
    '@/app/components/tenant-link': { default: 'tenant-link' },
    '@/lib/tenant-context': {
      isTenantId: value => value === listId,
      tenantPath: () => '/o/' + org + '/c/' + camp + '/more/lists',
    },
    '@/lib/tenant-server': {
      requireCamporeeContext: async () => ({
        userId: 'user-1', camporee: { id: camp }, supabase: { from },
        canEdit: module => module === 'lists' && editable,
      }),
    },
    './list-detail-manager': { default: 'list-detail-manager' },
  };
  await loadBindings();
  const filename = 'app/more/lists/[listId]/page.tsx';
  const source = await readFile(new URL('../' + filename, import.meta.url), 'utf8');
  const { code } = await transform(source, {
    filename, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name], console });
  const render = module.exports.default;
  return { queries, render };
}

test('list detail only reads a list inside the active camporee, then its items', async () => {
  const { render, queries } = await detailPage({ editable: false });
  const tree = await render({ params: Promise.resolve({ listId, organizationId: org, camporeeId: camp }) });
  assert.equal(queries[0].table, 'lists');
  assert.deepEqual(Array.from(queries[0].filters, pair => Array.from(pair)), [['camporee_id', camp], ['id', listId]]);
  assert.equal(queries.length, 1, 'items are fetched with their list in one request');
  assert.match(queries[0].fields, /list_items\(id,label,quantity,unit,is_done,notes,sort_order\)/);
  const manager = tree.props.children[1];
  assert.equal(manager.props.canEdit, false);
  assert.deepEqual(Array.from(manager.props.initialItems, item => item.label), ['Linterna', 'Brújula']);
});
test('missing or invalid list IDs render notFound instead of another camporee list', async () => {
  const missing = await detailPage({ found: false });
  await assert.rejects(missing.render({ params: Promise.resolve({ listId }) }), /notFound/);
  assert.equal(missing.queries.length, 1);
  const invalid = await detailPage();
  await assert.rejects(invalid.render({ params: Promise.resolve({ listId: 'another-list' }) }), /notFound/);
  assert.equal(invalid.queries.length, 0);
});
test('list cards use real tenant-aware routes instead of a detail sheet', async () => {
  const manager = await readFile(new URL('../app/more/lists/list-manager.tsx', import.meta.url), 'utf8');
  const router = await readFile(new URL('../app/o/[organizationId]/c/[camporeeId]/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(manager, /tenant-link/);
  assert.match(manager, /href=\{'\/more\/lists\/' \+ list\.id\}/);
  assert.doesNotMatch(manager, /selectedList|setSelectedList/);
  assert.match(router, /ListDetailPage/);
  assert.match(router, /more\/lists\//);
});
test('new-list button clears the fixed nav and iPhone safe area', async () => {
  const css = await readFile(new URL('../app/lists.css', import.meta.url), 'utf8');
  assert.match(css, /\.polymet-lists \.pm-fab\s*\{\s*bottom: calc\(102px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /padding-bottom: calc\(190px \+ env\(safe-area-inset-bottom\)\)/);
});
