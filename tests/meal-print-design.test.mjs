import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMealMenuDocument } from '../lib/meal-menu.ts';
import { prepareMealMenuFonts } from '../lib/meal-menu-fonts.ts';

const meal = (meal_date, meal_type, menu = meal_type) => ({ meal_date, meal_type, menu });

test('print uses the app Polymet palette, typography, round cards and inline icons', () => {
  const html = buildMealMenuDocument([meal('2026-11-06', 'dinner')], 'Legado');
  for (const token of ['#fdf8f5', '#2b211c', '#fa8943', '#fde9dd', '#e2ebd6', 'font-family: Poppins', 'border-radius: 22px', 'data-design="camporee-polymet"']) {
    assert.ok(html.includes(token), token);
  }
  assert.ok(html.includes('<svg '));
  assert.ok(!html.includes('grid-template-columns: 120px')); // No full-height side column for days.
  assert.ok(!html.includes('font-family: Arial'));
  assert.ok(!html.includes('Compartimos la mesa.'));
});

test('all meals retain their labels and order, with a different app pastel for each category', () => {
  const html = buildMealMenuDocument(['dinner','snack_pm','lunch','breakfast'].map(t => meal('2026-11-07', t)), 'Legado');
  const labels = ['Desayuno','Almuerzo','Merienda','Cena'].map(label => html.indexOf(`<span>${label}</span>`));
  assert.ok(labels.every((position, index) => position >= 0 && (!index || position > labels[index-1])));
  for (const tone of ['peach','sage','yellow','pink']) assert.ok(html.includes(`class="meal-icon tone-${tone}"`));
  assert.equal((html.match(/<dd>/g) ?? []).length, 4);
});

test('same-month dates are compact, cross-month and cross-year dates stay unambiguous', () => {
  const render = (first, last) => buildMealMenuDocument([meal(first,'dinner'),meal(last,'breakfast')], 'Legado');
  assert.ok(render('2026-11-06','2026-11-09').includes('6–9 de noviembre de 2026'));
  assert.ok(render('2026-11-30','2026-12-01').includes('30 de noviembre de 2026 — 1 de diciembre de 2026'));
  assert.ok(render('2026-12-31','2027-01-01').includes('31 de diciembre de 2026 — 1 de enero de 2027'));
});

test('print is readable, unstruck and supports pagination, with no remote resources or scripts', () => {
  const html = buildMealMenuDocument([{...meal('2020-01-01','lunch','Menú pasado'), is_done:true}], 'Legado');
  assert.ok(html.includes('Menú pasado'));
  assert.ok(!html.includes('line-through'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<link'));
  assert.ok(!html.includes('@import'));
  assert.ok(!html.includes('url('));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes('break-inside: avoid'));
  assert.ok(html.includes('overflow-wrap: anywhere'));
  assert.ok(html.includes('@page { size: auto; margin: 12mm; }'));
});

test('unknown meal types and malicious names cannot inject attributes or SVG', () => {
  const html = buildMealMenuDocument([meal('2026-11-06','" onload="alert(1)', '<svg onload="alert(2)">')], '</style><script>alert(3)</script>');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<svg onload='));
  assert.ok(html.includes('&lt;svg onload=&quot;alert(2)&quot;&gt;'));
  assert.ok(html.includes('class="meal-icon tone-peach"'));
});

function fontDocuments(faces, load = async () => []) {
  const copied = [];
  const requests = [];
  return {
    source: {fonts: {load: value => {requests.push(value);return load(value);}, forEach: cb => faces.forEach(cb)}},
    target: {fonts: {add: face => copied.push(face)}},
    copied, requests,
  };
}

test('both frames can reuse only the app loaded Poppins faces', async () => {
  const regular = {family:'Poppins',status:'loaded'};
  const semibold = {family:'"Poppins"',status:'loaded'};
  const docs = fontDocuments([regular,semibold,{family:'Other',status:'loaded'},{family:'Poppins',status:'unloaded'}]);
  await prepareMealMenuFonts(docs.source,docs.target);
  assert.deepEqual(docs.copied,[regular,semibold]);
  assert.deepEqual(docs.requests,['400 12px Poppins','500 12px Poppins','600 12px Poppins']);
});

test('offline font errors retain already loaded faces and do not block printing', async () => {
  const face = {family:'Poppins',status:'loaded'};
  const docs = fontDocuments([face],async () => {throw new Error('offline');});
  await assert.doesNotReject(prepareMealMenuFonts(docs.source,docs.target));
  assert.deepEqual(docs.copied,[face]);
});

test('a slow font provider times out and print remains usable', async () => {
  const docs = fontDocuments([],() => new Promise(() => {}));
  await assert.doesNotReject(prepareMealMenuFonts(docs.source,docs.target,5));
  assert.deepEqual(docs.copied,[]);
});

test('unsupported font APIs and restricted font sharing have safe fallbacks', async () => {
  await assert.doesNotReject(prepareMealMenuFonts({},{}));
  const docs = fontDocuments([{family:'Poppins',status:'loaded'}]);
  docs.target.fonts.add = () => {throw new Error('not supported');};
  await assert.doesNotReject(prepareMealMenuFonts(docs.source,docs.target));
});
