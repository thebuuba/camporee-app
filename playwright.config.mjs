import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3117', reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [320, 390].map(width => ({ name: `mobile-${width}`, use: { browserName: 'chromium', viewport: { width, height: 844 }, isMobile: true, hasTouch: true } })),
  webServer: { command: 'npm run start -- -p 3117', url: 'http://127.0.0.1:3117/login', reuseExistingServer: false, timeout: 60_000 },
});
