import { readFileSync } from 'node:fs';

export const back = '/o/00000000-0000-4000-8000-000000000001/c/57ad4342-8b3f-4735-a467-7e04c318a705/more/meals';
const meals = [
  { meal_date: '2026-11-07', meal_type: 'dinner', menu: 'Papas fritas y pechurina' },
  { meal_date: '2026-11-07', meal_type: 'snack_pm', menu: 'Jugo y empanadas' },
  { meal_date: '2026-11-07', meal_type: 'lunch', menu: 'Arroz, pescado, habichuelas y ensalada verde' },
  { meal_date: '2026-11-07', meal_type: 'breakfast', menu: 'Avena con pan' },
];
export const completeMeals = [
  { meal_date: '2026-11-06', meal_type: 'dinner', menu: 'Víveres, queso y/o huevo' },
  ...meals,
  { meal_date: '2026-11-08', meal_type: 'breakfast', menu: 'Mangú con queso y cebollita' },
  { meal_date: '2026-11-08', meal_type: 'lunch', menu: 'Moro de habichuelas negras, ensalada y pechuga a la crema' },
  { meal_date: '2026-11-08', meal_type: 'snack_pm', menu: 'Pan con aderezo, arepita y jugo' },
  { meal_date: '2026-11-08', meal_type: 'dinner', menu: 'Espaguetis con plátanos fritos' },
  { meal_date: '2026-11-09', meal_type: 'breakfast', menu: 'Chocolate con tostadas' },
  { meal_date: '2026-11-09', meal_type: 'lunch', menu: 'Moro de guandules con huevo revuelto y ensalada verde' },
];

// Real Poppins metrics, served locally so CDN failures cannot hide print regressions.
export async function openPrintDocument(page, html, withFonts = true) {
  await page.route('https://fonts.googleapis.com/**', route => withFonts
    ? route.fulfill({ contentType: 'text/css', body: [400, 500, 600].map(weight =>
      `@font-face { font-family: Poppins; font-style: normal; font-weight: ${weight}; src: url(https://fonts.gstatic.com/print-test/${weight}.woff) format('woff'); }`).join('\n') })
    : route.abort());
  await page.route('https://fonts.gstatic.com/print-test/*', route => {
    const weight = route.request().url().match(/(400|500|600)\.woff$/)[1];
    return route.fulfill({ contentType: 'font/woff', body: readFileSync(new URL(`./poppins/${weight}-latin.woff`, import.meta.url)) });
  });
  await page.setContent(html);
  if (withFonts) {
    await page.waitForFunction(() => [...document.styleSheets].some(sheet => sheet.href?.includes('fonts.googleapis.com')));
    await page.evaluate(() => Promise.all([400, 500, 600].map(weight => document.fonts.load(`${weight} 12px Poppins`))));
  }
}

