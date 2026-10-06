import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');

async function link({ online = true, pathname = '/more' } = {}) {
  await loadBindings();
  const { code } = await transform(await readFile(new URL('../app/components/reliable-link.tsx', import.meta.url), 'utf8'), { filename: 'reliable-link.tsx', jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  const assigned = [];
  let pending = false;
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  const modules = { react: { useState: () => [pending, value => { pending = value; }], useEffect() {}, useRef: value => ({ current: value }) }, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'next-link', 'next/navigation': { usePathname: () => pathname, useRouter: () => ({ push() {} }) } };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name], navigator: { onLine: online }, window: { location: { assign: href => assigned.push(href) } } });
  return { render: () => module.exports.default({ href: '/more/songs', children: 'Canciones' }), assigned };
}
function click(overrides = {}) {
  return { prevented: false, defaultPrevented: false, button: 0, preventDefault() { this.prevented = true; }, ...overrides };
}

test('los paneles precargan datos y dejan navegar a Next sin recargas temporizadas', async () => {
  const ui = await link();
  const tree = ui.render();
  assert.equal(tree.type, 'next-link');
  assert.equal(tree.props.prefetch, true);
  const event = click(); tree.props.onClick(event);
  assert.equal(event.prevented, false);
  assert.equal(ui.render().props['aria-busy'], true);
  assert.equal(ui.assigned.length, 0);
});
test('sin internet los paneles abren el HTML guardado con navegación nativa', async () => {
  const ui = await link({ online: false });
  const event = click(); ui.render().props.onClick(event);
  assert.equal(event.prevented, true);
  assert.deepEqual(ui.assigned, ['/more/songs']);
});
test('los clics modificados mantienen la opción de abrir otra pestaña', async () => {
  const ui = await link();
  const event = click({ ctrlKey: true }); ui.render().props.onClick(event);
  assert.equal(event.prevented, false);
  assert.equal(ui.render().props['aria-busy'], undefined);
});
