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

function resolvedDeclarations(css, matchingSelectors) {
  const winners = new Map();
  let order = 0;

  postcss.parse(css).walkRules((rule) => {
    if (rule.parent.type === 'atrule') return;
    const specificity = Math.max(
      ...rule.selectors.filter((selector) => matchingSelectors.includes(selector.trim()))
        .map((selector) => (selector.match(/\.[\w-]+/g) ?? []).length),
      -1,
    );
    if (specificity < 0) return;

    rule.walkDecls((declaration) => {
      const candidate = { value: declaration.value, important: Boolean(declaration.important), specificity, order: order++ };
      const current = winners.get(declaration.prop);
      if (!current || candidate.important > current.important ||
        (candidate.important === current.important && candidate.specificity >= current.specificity)) {
        winners.set(declaration.prop, candidate);
      }
    });
  });

  return Object.fromEntries([...winners].map(([property, declaration]) => [property, declaration.value]));
}

test('la navegación móvil queda integrada al borde inferior', async () => {
  const css = await appStyles();
  const nav = resolvedDeclarations(css, ['.nav', '.nav.nav-reference']);

  assert.deepEqual(
    {
      position: nav.position,
      left: nav.left,
      right: nav.right,
      bottom: nav.bottom,
      width: nav.width,
      borderRadius: nav['border-radius'],
      columns: nav['grid-template-columns'],
    },
    {
      position: 'fixed',
      left: '50%',
      right: 'auto',
      bottom: '0',
      width: 'min(100%,480px)',
      borderRadius: '0',
      columns: 'repeat(4,1fr)',
    },
  );
});
