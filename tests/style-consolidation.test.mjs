import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { consolidateCss } from '../scripts/consolidate-styles.mjs';
const postcss = createRequire(createRequire(import.meta.url).resolve('next/package.json'))('postcss');

function color(css, selector) {
  let value;
  for (const rule of postcss.parse(css).nodes) {
    if (rule.type === 'rule' && rule.selectors.includes(selector)) rule.walkDecls('color', declaration => { value = declaration.value; });
  }
  return value;
}
test('adjacent equal rules share declarations while retaining later overrides', () => {
  const css = '.a{color:red}.b{color:red}.a{color:blue}';
  const result = consolidateCss(css);
  assert.equal(result.merged, 1);
  assert.ok(result.css.length < css.length);
  assert.equal(color(result.css, '.a'), 'blue');
  assert.equal(color(result.css, '.b'), 'red');
});
test('nonadjacent rules and different conditional contexts preserve cascade order', () => {
  const css = '.a{color:red}.a{color:blue}.b{color:red}@media(max-width:400px){.c{color:white}.d{color:white}}';
  const result = consolidateCss(css);
  assert.equal(color(result.css, '.a'), 'blue');
  assert.equal(color(result.css, '.b'), 'red');
  const media = postcss.parse(result.css).nodes.find(node => node.type === 'atrule');
  assert.equal(media.nodes.length, 1); assert.deepEqual(media.nodes[0].selectors, ['.c', '.d']);
  assert.equal(consolidateCss(result.css).merged, 0);
});
