import { test, expect } from '@playwright/test';
import { buildMealMenuDocument } from '../../lib/meal-menu.ts';
import { buildMealPrintPage } from '../../lib/meal-print-page.ts';

const back = '/o/00000000-0000-4000-8000-000000000001/c/57ad4342-8b3f-4735-a467-7e04c318a705/more/meals';
const meals = [
  { meal_date: '2026-11-07', meal_type: 'dinner', menu: 'Papas fritas y pechurina' },
  { meal_date: '2026-11-07', meal_type: 'snack_pm', menu: 'Jugo y empanadas' },
  { meal_date: '2026-11-07', meal_type: 'lunch', menu: 'Arroz, pescado, habichuelas y ensalada verde' },
  { meal_date: '2026-11-07', meal_type: 'breakfast', menu: 'Avena con pan' },
];
const html = buildMealPrintPage(buildMealMenuDocument(meals, 'Legado'), back, '1234567890abcdef1234567890abcdef');

async function openDocument(page) {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.setContent(html);
}

test('top-level menu invokes native print and keeps controls out of paper', async ({ page }) => {
  await openDocument(page);
  await page.evaluate(() => {
    window.__menuPrintEvents = [];
    window.addEventListener('beforeprint', () => window.__menuPrintEvents.push('beforeprint'));
  });
  await page.getByRole('button', { name: 'Imprimir / Guardar PDF' }).click();
  await expect.poll(() => page.evaluate(() => window.__menuPrintEvents)).toContain('beforeprint');
  expect(await page.evaluate(() => window === window.top)).toBe(true);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('dt')).toHaveText(['Desayuno', 'Almuerzo', 'Merienda', 'Cena']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-controls')).toBeHidden();
  await expect(page.locator('.meal')).toHaveCount(4);
});

test('silent mobile-webview print failure is visible and retry remains available', async ({ page }) => {
  await openDocument(page);
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole('button', { name: 'Imprimir / Guardar PDF' }).click();
  await expect(page.getByRole('status')).toContainText('no abrió la impresión');
  await expect(page.getByRole('button', { name: 'Imprimir / Guardar PDF' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Copiar enlace' })).toBeVisible();
});

test('native printing errors do not become unhandled page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openDocument(page);
  await page.evaluate(() => { window.print = () => { throw new Error('Unavailable'); }; });
  await page.getByRole('button', { name: 'Imprimir / Guardar PDF' }).click();
  await expect(page.getByRole('status')).toContainText('Safari');
  expect(errors).toEqual([]);
});

test('private print route redirects anonymous visitors instead of returning meals', async ({ request }) => {
  const response = await request.get(back.replace('/more/meals', '/print/meals'), { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(response.status());
  expect(response.headers().location).toContain('/login');
});
