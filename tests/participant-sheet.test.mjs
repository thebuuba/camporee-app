import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function sheetRules() {
  const css = await readFile(resolve(root, 'app/task-sheet.css'), 'utf8');
  const rules = new Map();

  postcss.parse(css).walkRules((rule) => {
    for (const selector of rule.selectors) {
      const declarations = rules.get(selector.trim()) ?? {};
      rule.walkDecls((declaration) => {
        declarations[declaration.prop] = declaration.value;
      });
      rules.set(selector.trim(), declarations);
    }
  });

  return rules;
}

async function desktopRules() {
  const css = await readFile(resolve(root, 'app/desktop.css'), 'utf8');
  const rules = new Map();
  postcss.parse(css).walkRules((rule) => {
    for (const selector of rule.selectors) {
      const declarations = rules.get(selector.trim()) ?? {};
      rule.walkDecls((declaration) => { declarations[declaration.prop] = declaration.value; });
      rules.set(selector.trim(), declarations);
    }
  });
  return rules;
}

test('los paneles de Más comparten el borde completo de tareas', async () => {
  const rules = await sheetRules();

  assert.deepEqual(rules.get('.more-route-shell .sheet-backdrop'), rules.get('.task-sheet-backdrop'));
  assert.deepEqual(rules.get('.more-route-shell .sheet-card'), rules.get('.task-edit-sheet'));
  assert.deepEqual(rules.get('.more-route-shell .sheet-card.is-dragging'), rules.get('.task-edit-sheet.is-dragging'));
});

test('el layout de Más activa el gesto compartido para todos sus paneles', async () => {
  const layout = await readFile(resolve(root, 'app/more/layout.tsx'), 'utf8');

  assert.match(layout, /import MoreSheetBehavior from/);
  assert.match(layout, /<MoreSheetBehavior\s*\/>/);
});

test('en escritorio los paneles de Más vuelven a mostrarse centrados', async () => {
  const rules = await desktopRules();

  assert.equal(rules.get('.more-route-shell .sheet-backdrop')['align-items'], 'center');
  assert.equal(rules.get('.more-route-shell .sheet-backdrop').padding, '28px');
  assert.equal(rules.get('.more-route-shell .sheet-card')['border-radius'], '30px');
  assert.equal(rules.get('.more-route-shell .sheet-card').margin, 'auto');
});
