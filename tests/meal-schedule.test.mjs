import test from 'node:test';
import assert from 'node:assert/strict';
import { camporeeLocalClock, formatMealTime, hasMealTimePassed, mealTime, normalizeMealTime } from '../lib/meal-schedule.ts';
import { MEAL_TYPES, buildMealMenuDocument, groupMealsForMenu, mealLabel } from '../lib/meal-menu.ts';
const meal = (type, date = '2026-11-07', time = null) => ({ meal_date: date, meal_type: type, meal_time: time, menu: type });
const clock = iso => camporeeLocalClock(new Date(iso), 'America/Santo_Domingo');

test('four primary choices and day order match Desayuno, Almuerzo, Merienda, Cena', () => {
  assert.deepEqual(MEAL_TYPES.slice(0, 4).map(([, label]) => label), ['Desayuno', 'Almuerzo', 'Merienda', 'Cena']);
  const days = groupMealsForMenu(['dinner', 'snack_pm', 'lunch', 'breakfast'].map(type => meal(type)));
  assert.deepEqual(days[0].meals.map(m => mealLabel(m.meal_type)), ['Desayuno', 'Almuerzo', 'Merienda', 'Cena']);
});
test('default and persisted times resolve at minute precision', () => {
  assert.deepEqual(['breakfast', 'lunch', 'snack_pm', 'dinner'].map(type => mealTime(meal(type))), ['08:00', '12:30', '16:00', '19:00']);
  assert.equal(mealTime(meal('breakfast', undefined, '09:15:00')), '09:15');
  assert.equal(normalizeMealTime('00:00:00'), '00:00');
  for (const value of ['', '24:00', '08:99', '08:00:10', '8:00', '<script>']) assert.equal(normalizeMealTime(value), null);
});
test('breakfast stays active before its time and is crossed at the boundary', () => {
  assert.equal(hasMealTimePassed(meal('breakfast'), clock('2026-11-07T11:59:59Z')), false);
  assert.equal(hasMealTimePassed(meal('breakfast'), clock('2026-11-07T12:00:00Z')), true);
  assert.equal(hasMealTimePassed(meal('lunch'), clock('2026-11-07T12:00:00Z')), false);
});
test('future dates never cross out even when that hour already passed today', () => {
  assert.equal(hasMealTimePassed(meal('breakfast', '2026-11-08'), clock('2026-11-07T23:30:00Z')), false);
  assert.equal(hasMealTimePassed(meal('dinner', '2026-11-06'), clock('2026-11-07T05:00:00Z')), true);
});
test('custom time overrides defaults and rescheduling can uncross a meal', () => {
  const now = clock('2026-11-07T12:30:00Z');
  assert.equal(hasMealTimePassed(meal('breakfast', undefined, '08:00:00'), now), true);
  assert.equal(hasMealTimePassed(meal('breakfast', undefined, '09:00:00'), now), false);
});
test('timezone is the camporee zone; midnight does not shift the day', () => {
  assert.equal(clock('2026-11-08T03:59:59Z'), '2026-11-07T23:59');
  assert.equal(clock('2026-11-08T04:00:00Z'), '2026-11-08T00:00');
  assert.equal(camporeeLocalClock(new Date('2026-11-07T12:00:00Z'), 'Pacific/Honolulu'), '2026-11-07T02:00');
  assert.equal(camporeeLocalClock(new Date('2026-11-07T12:00:00Z'), 'invalid'), '2026-11-07T08:00');
});
test('invalid dates and hydration have no false expired state', () => {
  assert.equal(hasMealTimePassed(meal('breakfast'), null), false);
  assert.equal(hasMealTimePassed(meal('breakfast', '2026-02-30'), clock('2026-11-07T12:00:00Z')), false);
  assert.equal(camporeeLocalClock(new Date('invalid')), null);
});
test('times display in Spanish, including noon and midnight', () => {
  assert.equal(formatMealTime('08:00'), '8:00 a. m.');
  assert.equal(formatMealTime('12:30:00'), '12:30 p. m.');
  assert.equal(formatMealTime('00:00'), '12:00 a. m.');
  assert.equal(formatMealTime('19:00'), '7:00 p. m.');
});
test('print keeps all days, correct order and no strike-through state', () => {
  const entries = [meal('dinner', '2026-11-06'), ...['dinner','snack_pm','lunch','breakfast'].map(t => meal(t)), meal('lunch','2026-11-09')];
  const html = buildMealMenuDocument(entries, 'Legado');
  const days = [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(([, section]) => ({
    day: section.match(/<h2>([\s\S]*?)<\/h2>/)?.[1],
    labels: [...section.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/g)].map(([, content]) => content.replace(/<[^>]+>/g, '').trim()),
  }));
  assert.deepEqual(days.map(({ day }) => day), ['viernes', 'sábado', 'lunes']);
  assert.deepEqual(days[1].labels, ['Desayuno', 'Almuerzo', 'Merienda', 'Cena']);
  assert.ok(!html.includes('line-through'));
  assert.equal((html.match(/<dd>/g) || []).length, 6);
});
