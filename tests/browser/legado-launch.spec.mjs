import { test, expect } from '@playwright/test';

test('Legado starts from the installed app offline, loads its cached emblem and dismisses once', async ({ page, context }) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.waitForFunction(async () => Boolean(await caches.match('/legado-emblem-v1.png')));
  await page.evaluate(() => {
    const scope = '50000000-0000-4000-8000-000000000001:60000000-0000-4000-8000-000000000001';
    localStorage.setItem('camporee:launch:last-scope', scope);
    localStorage.setItem(`camporee:launch:${scope}`, JSON.stringify({ legado: true, status: 'active', startsOn: '2026-11-06', endsOn: '2026-11-09', timeZone: 'America/Santo_Domingo' }));
  });
  const launch = await context.newPage();
  await launch.clock.install({ time: new Date('2026-11-06T12:00:00Z') });
  await launch.emulateMedia({ reducedMotion: 'no-preference' });
  await launch.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await context.setOffline(true);
  try {
    await launch.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(launch).toHaveURL(/\/offline\?from=%2F$/);
    await expect(launch.getByRole('status', { name: 'Cargando el camporee Legado' })).toBeVisible();
    const image = launch.locator('.legado-launch img');
    await image.evaluate(img => img.decode());
    expect(await image.evaluate(img => img.naturalWidth)).toBe(432);
    const footer = await launch.locator('.legado-launch-footer').boundingBox();
    expect(footer.x).toBeGreaterThanOrEqual(0);
    expect(footer.x + footer.width).toBeLessThanOrEqual(launch.viewportSize().width);
    await expect(launch.locator('.legado-launch')).toHaveCount(0, { timeout: 3500 });
    await expect(launch.getByRole('heading', { name: 'Seguimos en campamento' })).toBeVisible();
    await launch.reload({ waitUntil: 'networkidle' });
    await expect(launch.locator('.legado-launch')).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    await launch.close();
  }
});
