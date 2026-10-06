import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');

async function splash(reduced = false) {
  await loadBindings();
  const { code } = await transform(await readFile(new URL('../app/components/app-splash.tsx', import.meta.url), 'utf8'), {
    filename: 'app-splash.tsx', jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const states = [], effects = [], timers = [], cleared = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: { useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; }, useEffect: callback => effects.push(callback) },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': { Tent: 'tent', TentTree: 'tent-tree' },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name], window: { matchMedia: () => ({ matches: reduced }), setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout: id => cleared.push(id) } });
  return { render() { cursor = 0; return module.exports.default(); }, effects, timers, cleared };
}

test('la bienvenida usa el paisaje y los textos de Polymet sin botón de comenzar', async () => {
  const ui = await splash();
  const tree = JSON.stringify(ui.render());
  assert.match(tree, /Organiza tu camporee antes, durante y después del evento/);
  assert.match(tree, /polymet-camp-preparation.svg/);
  assert.match(tree, /Club de Conquistadores/);
  assert.doesNotMatch(tree, /Comenzar|"type":"button"|"type":"a"/);
});

test('la pantalla pasa a lista y se retira sola sin cambiar la ruta de la sesión', async () => {
  const ui = await splash(); ui.render();
  const cleanup = ui.effects[0]();
  assert.equal(ui.timers.length, 2);
  assert.ok(ui.timers.every(timer => timer.delay <= 1800));
  ui.timers[0].callback();
  assert.match(JSON.stringify(ui.render()), /¡Todo listo!/);
  ui.timers[1].callback();
  assert.equal(ui.render(), null);
  cleanup();
  assert.equal(ui.cleared.length, 2);
});

test('con movimiento reducido entra sin una espera larga', async () => {
  const ui = await splash(true); ui.render(); ui.effects[0]();
  assert.ok(ui.timers.every(timer => timer.delay <= 200));
  ui.timers.forEach(timer => timer.callback());
  assert.equal(ui.render(), null);
});
