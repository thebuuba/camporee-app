import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMealMenuDocument, formatMenuDate, groupMealsForMenu, mealLabel, sortMealsForMenu } from '../lib/meal-menu.ts';

const meal = (date, type, menu = type) => ({ meal_date: date, meal_type: type, menu });

test('menu sorts chronologically, including both snacks, without mutating input', () => {
  const input = Object.freeze([
    meal('2026-11-08', 'breakfast'), meal('2026-11-07', 'dinner'),
    meal('2026-11-07', 'snack_pm'), meal('2026-11-07', 'lunch'),
    meal('2026-11-07', 'breakfast'), meal('2026-11-07', 'snack_am'),
    meal('2026-11-07', 'other'), meal('2026-11-07', 'unknown'),
  ]);
  assert.deepEqual(sortMealsForMenu(input).map(x => `${x.meal_date}:${x.meal_type}`), [
    '2026-11-07:breakfast', '2026-11-07:snack_am', '2026-11-07:lunch',
    '2026-11-07:snack_pm', '2026-11-07:dinner', '2026-11-07:other',
    '2026-11-07:unknown', '2026-11-08:breakfast',
  ]);
  assert.equal(input[0].meal_date, '2026-11-08');
});

test('grouping preserves every meal and creates only dates actually planned', () => {
  const groups = groupMealsForMenu([meal('2026-11-09', 'lunch'), meal('2026-11-06', 'dinner'), meal('2026-11-09', 'breakfast')]);
  assert.deepEqual(groups.map(x => [x.date, x.meals.length]), [['2026-11-06', 1], ['2026-11-09', 2]]);
  assert.equal(groups[1].meals[0].meal_type, 'breakfast');
  assert.equal(mealLabel('lunch'), 'Almuerzo');
});

test('calendar dates do not shift with the viewer time zone', () => {
  assert.equal(formatMenuDate('2026-11-06', { weekday: 'long', timeZone: 'Pacific/Kiritimati' }), 'viernes');
  assert.equal(formatMenuDate('2026-11-09', { weekday: 'long', timeZone: 'Pacific/Honolulu' }), 'lunes');
  assert.equal(formatMenuDate('invalid', { weekday: 'long' }), 'invalid');
});

test('print escapes user content in event titles, menus and unknown meal types', () => {
  const html = buildMealMenuDocument([meal('2026-11-06', '<script>alert(1)</script>', '<img src=x onerror="alert(1)"> & queso')], '</title><script>alert(2)</script>');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; queso'));
  assert.ok(html.includes("default-src 'none'"));
});

test('complete menu includes all eleven meals and all four days', () => {
  const entries = [
    meal('2026-11-06', 'dinner', 'Víveres, queso y/o huevo'),
    meal('2026-11-07', 'breakfast', 'Avena con pan'),
    meal('2026-11-07', 'lunch', 'Arroz, pescado, habichuelas y ensalada verde'),
    meal('2026-11-07', 'snack_pm', 'Jugo y empanadas'),
    meal('2026-11-07', 'dinner', 'Papas fritas y pechurina'),
    meal('2026-11-08', 'breakfast', 'Mangú con queso y cebollita'),
    meal('2026-11-08', 'lunch', 'Moro de habichuelas negras, ensalada y pechuga a la crema'),
    meal('2026-11-08', 'snack_pm', 'Pan con aderezo, arepita y jugo'),
    meal('2026-11-08', 'dinner', 'Espaguetis con plátanos fritos'),
    meal('2026-11-09', 'breakfast', 'Chocolate con tostadas'),
    meal('2026-11-09', 'lunch', 'Moro de guandules con huevo revuelto y ensalada verde'),
  ];
  const html = buildMealMenuDocument(entries, 'Bi-Campore Legado');
  for (const { menu } of entries) assert.ok(html.includes(menu));
  for (const day of ['viernes', 'sábado', 'domingo', 'lunes']) assert.ok(html.includes(`<h2>${day}</h2>`));
  assert.equal((html.match(/class="day"/g) ?? []).length, 4);
  assert.equal((html.match(/<dd>/g) ?? []).length, 11);
  assert.ok(html.includes('11 comidas planificadas'));
  assert.ok(html.includes('@media print'));
  assert.ok(html.includes('break-inside: avoid'));
  assert.ok(html.includes('<meta charset="utf-8">'));
});

test('print is generated from current data, including edits, without placeholders', () => {
  const before = buildMealMenuDocument([meal('2026-11-06', 'dinner', 'Anterior')], 'Legado');
  const after = buildMealMenuDocument([meal('2026-11-06', 'dinner', 'Menú actualizado')], 'Legado');
  assert.ok(before.includes('Anterior'));
  assert.ok(!after.includes('Anterior'));
  assert.ok(after.includes('Menú actualizado'));
  assert.ok(after.includes('1 comida planificada'));
});

test('empty menus render safely without inventing meals or dates', () => {
  const html = buildMealMenuDocument([], '');
  assert.ok(html.includes('Todavía no hay comidas planificadas.'));
  assert.ok(html.includes('<title>Menú — Camporee</title>'));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('Invalid Date'));
});
