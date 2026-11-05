import { test, expect } from '@playwright/test';

test('Legado starts during preparation offline, loads its cached emblem and dismisses once', async ({ page, context }) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.waitForFunction(async () => Boolean(await caches.match('/legado-emblem-v1.png')));
  await page.evaluate(() => {
    const scope = '50000000-0000-4000-8000-000000000001:60000000-0000-4000-8000-000000000001';
    localStorage.setItem('camporee:launch:last-scope', scope);
    localStorage.setItem(`camporee:launch:${scope}`, JSON.stringify({ legado: true, status: 'planning', startsOn: '2026-11-06', endsOn: '2026-11-09', timeZone: 'America/Santo_Domingo' }));
  });
  const launch = await context.newPage();
  await launch.clock.install({ time: new Date('2026-11-05T12:00:00Z') });
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
    const footer = await launch.locator('.legado-launch-stage').boundingBox();
    expect(footer.x).toBeGreaterThanOrEqual(0);
    expect(footer.x + footer.width).toBeLessThanOrEqual(launch.viewportSize().width);
    await expect(launch.locator('#camporee-launch')).toBeHidden({ timeout: 3500 });
    await expect(launch.getByRole('heading', { name: 'Seguimos en campamento' })).toBeVisible();
    await launch.reload({ waitUntil: 'networkidle' });
    await expect(launch.locator('#camporee-launch')).toBeHidden();
  } finally {
    await context.setOffline(false);
    await launch.close();
  }
});

for (const tone of ['light', 'dark']) {
  test(`first paint shows the ${tone} loader before hydration and blends into ready content`, async ({ page }, info) => {
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(({ tone }) => {
      const scope = '50000000-0000-4000-8000-000000000001:60000000-0000-4000-8000-000000000001';
      localStorage.setItem('camporee-theme', tone);
      localStorage.setItem('camporee:launch:last-scope', scope);
      localStorage.setItem(`camporee:launch:${scope}`, JSON.stringify({ legado: true, status: 'planning', startsOn: '2026-11-06', endsOn: '2026-11-09', timeZone: 'America/Santo_Domingo' }));
      window.__startupFrames = [];
      function sample() {
        const app = document.getElementById('camporee-app');
        const cover = document.getElementById('camporee-launch');
        if (app && cover) window.__startupFrames.push({ stage: document.documentElement.dataset.camporeeLaunchStage, app: getComputedStyle(app).opacity, visible: getComputedStyle(app).visibility, cover: getComputedStyle(cover).opacity });
        if (window.__startupFrames.length < 500) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, { tone });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async route => { await held; await route.continue(); });
    await page.goto('/offline?from=%2F', { waitUntil: 'commit' });
    await expect(page.getByRole('status', { name: 'Cargando el camporee Legado' })).toBeVisible();
    expect(await page.locator('#camporee-app').evaluate(node => getComputedStyle(node).visibility)).toBe('hidden');
    // Longer than the old fixed intro: the page's JavaScript is still held.
    await page.waitForTimeout(2700);
    await expect(page.locator('html')).toHaveAttribute('data-camporee-launch-stage', 'loading');
    expect(await page.locator('#camporee-launch').evaluate(node => getComputedStyle(node).backgroundColor)).toBe(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor));
    await page.screenshot({ path: info.outputPath(`startup-${tone}.png`) });
    release();
    await expect(page.locator('#camporee-launch')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Seguimos en campamento' })).toBeVisible();
    const frames = await page.evaluate(() => window.__startupFrames);
    expect(frames.filter(frame => frame.stage === 'loading').every(frame => frame.visible === 'hidden' && frame.app === '0' && frame.cover === '1')).toBe(true);
    expect(frames.some(frame => frame.stage === 'leaving' && Number(frame.app) > 0 && Number(frame.app) < 1 && Number(frame.cover) > 0 && Number(frame.cover) < 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
