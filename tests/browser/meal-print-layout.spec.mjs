import { test, expect } from '@playwright/test';
import { buildMealMenuDocument } from '../../lib/meal-menu.ts';
import { buildMealPrintPage } from '../../lib/meal-print-page.ts';
import { back, completeMeals, openPrintDocument } from '../fixtures/meal-print.mjs';

for (const withFonts of [true, false]) {
  test(`Letter layout leaves room for native print margins with ${withFonts ? 'Poppins' : 'offline fonts'}`, async ({ page }) => {
    // Include a longer event title than the live menu; it must remain readable.
    await openPrintDocument(page, buildMealPrintPage(buildMealMenuDocument(completeMeals,
      'Fusión Conqui-Guía Rayo de Luz Élite — Bi-Camporee Legado'), back,
      '1234567890abcdef1234567890abcdef'), withFonts);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.print-controls')).toBeHidden();
    const layout = await page.locator('.menu').evaluate(menu => {
      const bounds = menu.getBoundingClientRect();
      const descriptions = [...menu.querySelectorAll('dd')];
      return {
        width: bounds.width, height: bounds.height,
        fontLoaded: [...document.fonts].some(font => font.family === 'Poppins' && font.status === 'loaded'),
        days: [...menu.querySelectorAll('h2')].map(el => el.textContent),
        meals: descriptions.map(el => el.textContent),
        unclipped: descriptions.every(el => {
          const range = document.createRange(); range.selectNodeContents(el);
          const text = range.getBoundingClientRect(), box = el.getBoundingClientRect();
          return text.right <= box.right + 1 && text.bottom <= box.bottom + 1 && box.bottom <= bounds.bottom;
        }),
      };
    });
    expect(layout.fontLoaded).toBe(withFonts);
    // Stable physical width even when print media retains the iPhone viewport.
    expect(layout.width).toBeCloseTo(696, 0);
    // Previous layout was 842px tall and pushed Monday onto a second AirPrint page.
    expect(layout.height).toBeLessThan(700);
    expect(layout.unclipped).toBe(true);
    expect(layout.days).toEqual(['viernes', 'sábado', 'domingo', 'lunes']);
    expect(layout.meals).toHaveLength(11);
    expect(layout.meals.at(-1)).toBe('Moro de guandules con huevo revuelto y ensalada verde');
  });
}
