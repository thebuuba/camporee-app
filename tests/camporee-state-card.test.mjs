import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function cardRules() {
  const css = await readFile(resolve(root, 'app/camporee-state-card.css'), 'utf8');
  const rules = new Map();

  postcss.parse(css).walkRules((rule) => {
    if (rule.parent.type === 'atrule') return;
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

test('las tarjetas activa y de preparación mantienen la densidad de la referencia móvil', async () => {
  const rules = await cardRules();

  assert.deepEqual(
    {
      radius: rules.get('.camporee-state-card')['border-radius'],
      mainPadding: rules.get('.camporee-state-main').padding,
      logo: rules.get('.camporee-state-logo').width,
      headingGap: rules.get('.camporee-state-heading')['margin-top'],
      headingSize: rules.get('.camporee-state-heading h2')['font-size'],
      dayGap: rules.get('.live-day-card')['margin-top'],
      dayPadding: rules.get('.live-day-card').padding,
      timelineGap: rules.get('.live-timeline-card')['margin-top'],
      timelinePadding: rules.get('.live-timeline-card').padding,
      rowHeight: rules.get('.timeline-row')['min-height'],
      operationPadding: rules.get('.camporee-operation').padding,
    },
    {
      radius: '24px',
      mainPadding: '16px 15px 10px',
      logo: '34px',
      headingGap: '13px',
      headingSize: '24px',
      dayGap: '12px',
      dayPadding: '13px 12px 12px',
      timelineGap: '12px',
      timelinePadding: '11px 12px 10px',
      rowHeight: '40px',
      operationPadding: '13px 15px 12px',
    },
  );

  assert.equal(rules.get('.prep-countdown-card')['margin-top'], '12px');
  assert.equal(rules.get('.prep-countdown-card').padding, '13px 12px 12px');
  assert.equal(rules.get('.prep-status-card')['margin-top'], '12px');
  assert.equal(rules.get('.prep-status-card').padding, '11px 12px 10px');
  assert.equal(rules.get('.prep-progress-track').height, '5px');
});
