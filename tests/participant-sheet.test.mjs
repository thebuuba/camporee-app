import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const styles = () => readFile(new URL('../app/polymet-sheets.css', import.meta.url), 'utf8');
function declarations(css, selector) {
  const result = {};
  postcss.parse(css).walkRules(rule => {
    if (rule.parent.type === 'atrule' || !rule.selectors.includes(selector)) return;
    rule.walkDecls(d => { result[d.prop] = d.value; });
  });
  return result;
}
test('el panel Polymet queda anclado abajo y limitado al ancho del teléfono', async () => {
  const css = await styles();
  const panel = declarations(css, '.pm-sheet');
  assert.equal(panel['max-width'], '440px');
  assert.equal(panel['max-height'], '92dvh');
  assert.equal(panel['border-radius'], '32px 32px 0 0');
  assert.equal(declarations(css, '.pm-sheet-frame[open]')['align-items'], 'flex-end');
});
test('el contenido del formulario se desplaza sin desplazar las acciones', async () => {
  const css = await styles();
  assert.equal(declarations(css, '.pm-sheet-fields')['overflow-y'], 'auto');
  assert.equal(declarations(css, '.pm-sheet-footer')['flex-shrink'], '0');
  assert.equal(declarations(css, '.pm-sheet-footer').background, '#fff');
});
test('el panel respeta la preferencia de reducir movimiento', async () => {
  const css = postcss.parse(await styles());
  let animation;
  css.walkAtRules('media', rule => {
    if (rule.params !== '(prefers-reduced-motion:reduce)') return;
    rule.walkDecls('animation', d => { animation = d.value; });
  });
  assert.equal(animation, 'none');
});
test('la animación empieza con el diálogo visible y conserva los tiempos de Polymet', async () => {
  const css = await styles();
  assert.equal(declarations(css, '.pm-sheet').animation, undefined);
  assert.equal(declarations(css, '.pm-sheet-frame[open][data-state=open] .pm-sheet').animation,
    'pm-sheet-in .5s cubic-bezier(.4,0,.2,1)');
  assert.equal(declarations(css, '.pm-sheet-frame[data-state=closed] .pm-sheet').animation,
    'pm-sheet-out .3s cubic-bezier(.4,0,.2,1) forwards');
  assert.equal(declarations(css, '.pm-sheet-frame::backdrop').animation, 'pm-backdrop-in .15s');
});
test('el enfoque del diálogo no puede desplazar el contenedor durante la entrada', async () => {
  assert.equal(declarations(await styles(), '.pm-sheet-frame').overflow, 'clip');
});
