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
const completeMeals = [
  { meal_date: '2026-11-06', meal_type: 'dinner', menu: 'Víveres, queso y/o huevo' },
  ...meals,
  { meal_date: '2026-11-08', meal_type: 'breakfast', menu: 'Mangú con queso y cebollita' },
  { meal_date: '2026-11-08', meal_type: 'lunch', menu: 'Moro de habichuelas negras, ensalada y pechuga a la crema' },
  { meal_date: '2026-11-08', meal_type: 'snack_pm', menu: 'Pan con aderezo, arepita y jugo' },
  { meal_date: '2026-11-08', meal_type: 'dinner', menu: 'Espaguetis con plátanos fritos' },
  { meal_date: '2026-11-09', meal_type: 'breakfast', menu: 'Chocolate con tostadas' },
  { meal_date: '2026-11-09', meal_type: 'lunch', menu: 'Moro de guandules con huevo revuelto y ensalada verde' },
];

test('all four days and eleven meals fit one portrait Letter page at full scale', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.setContent(buildMealPrintPage(buildMealMenuDocument(completeMeals, 'Bi-Campore Legado'), back, '1234567890abcdef1234567890abcdef'));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.day')).toHaveCount(4);
  await expect(page.locator('dd')).toHaveCount(11);
  await expect(page.locator('footer')).toContainText('11 comidas planificadas');
  const logo = page.getByRole('img', { name: 'Logo oficial del II Bi-Camporee Legado' });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  const pdf = await page.pdf({ preferCSSPageSize: true, scale: 1, printBackground: true, displayHeaderFooter: false });
  const output = pdf.toString('latin1');
  expect(output.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  expect(output).toMatch(/\/MediaBox\s*\[0 0 612 792\]/);
});

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
