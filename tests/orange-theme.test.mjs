import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function appStyles() {
  const layout = await readFile(resolve(root, 'app/layout.tsx'), 'utf8');
  const imports = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(([, file]) => file);
  return (await Promise.all(imports.map((file) => readFile(resolve(root, 'app', file), 'utf8')))).join('\n');
}

function declarationsFor(css, selector) {
  const declarations = new Map();
  let order = 0;

  postcss.parse(css).walkRules((rule) => {
    if (rule.parent.type === 'atrule' || !rule.selectors.map((item) => item.trim()).includes(selector)) return;
    const specificity = (selector.match(/\.[\w-]+|:[\w-]+/g) ?? []).length;
    rule.walkDecls((declaration) => {
      const candidate = { value: declaration.value, important: Boolean(declaration.important), specificity, order: order++ };
      const current = declarations.get(declaration.prop);
      if (!current || candidate.important > current.important ||
        (candidate.important === current.important && candidate.specificity >= current.specificity)) {
        declarations.set(declaration.prop, candidate);
      }
    });
  });

  return Object.fromEntries([...declarations].map(([property, declaration]) => [property, declaration.value]));
}

function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

test('los controles principales usan el naranja cálido de la referencia', async () => {
  const css = await appStyles();
  const primary = declarationsFor(css, '.primary-btn');
  const theme = declarationsFor(css, ':root');
  const background = primary.background === 'var(--pm-orange)' ? theme['--pm-orange'] : primary.background;
  const [red, green, blue] = rgb(background);

  assert.ok(red >= 230 && green >= 110 && green <= 175 && blue <= 100, `se esperaba naranja cálido y se obtuvo ${background}`);
  assert.equal(primary.color, '#fff');
});

test('la navegación activa comparte la familia naranja sin alterar estados positivos', async () => {
  const css = await appStyles();
  const active = declarationsFor(css, '.nav a.active');
  const success = declarationsFor(css, '.hero-v3-status');

  assert.match(active.color, /^#[A-Fa-f0-9]{6}$/);
  const [red, green, blue] = rgb(active.color);
  assert.ok(red > green && green > blue, `se esperaba un tono naranja y se obtuvo ${active.color}`);
  assert.notEqual(success.background, active.background, 'los estados positivos deben seguir distinguiéndose del acento naranja');
});
