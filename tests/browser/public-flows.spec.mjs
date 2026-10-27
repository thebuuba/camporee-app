import { test, expect } from '@playwright/test';

async function observeLaunches(page, installed = false) {
  await page.addInitScript(({ installed }) => {
    window.__launchCount = 0;
    if (installed) Object.defineProperty(navigator, 'standalone', { value: true });
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element) window.__launchCount += (node.matches('.pm-launch-screen') ? 1 : 0) + node.querySelectorAll('.pm-launch-screen').length;
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }, { installed });
}

test('login supports zoom, readable contrast and narrow mobile screens', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  const measured = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Iniciar sesión');
    const style = getComputedStyle(button);
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return { contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), viewport: document.querySelector('meta[name="viewport"]').content,
      targets: [...document.querySelectorAll('.pm-login-register a,.pm-login-password-toggle,.pm-login-options>button')].map(node => ({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),
      width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
  });
  expect(measured.contrast).toBeGreaterThanOrEqual(4.5);
  expect(measured.viewport).not.toMatch(/user-scalable=no|maximum-scale=1(?:,|$)/);
  expect(measured.scroll).toBeLessThanOrEqual(measured.width);
  expect(measured.targets).toHaveLength(3);
  for (const target of measured.targets) { expect(target.height).toBeGreaterThanOrEqual(44); expect(target.width).toBeGreaterThanOrEqual(44); }
  await page.locator('input[name=password]').focus();
  await page.keyboard.press('Tab');
  const toggle = page.getByRole('button', { name:'Mostrar contraseña', exact:true });
  await expect(toggle).toBeFocused();
  expect(await toggle.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: info.outputPath('login.png'), fullPage: true });
});

test('registration and reload do not replay the startup screen when storage is blocked', async ({ page }) => {
  await observeLaunches(page);
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
  await page.goto('/login'); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__launchCount)).toBeLessThanOrEqual(1);
  await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Crear|cuenta|Registro/i }).first()).toBeVisible();
  await expect(page.locator('.pm-launch-screen')).toHaveCount(0);
  await page.reload(); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__launchCount)).toBe(0);
});

test('installed PWA relies on system startup without an extra application cover', async ({ page }) => {
  await observeLaunches(page, true);
  await page.goto('/login'); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__launchCount)).toBe(0);
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
});
