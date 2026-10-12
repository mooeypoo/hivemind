import { defineConfig, devices } from '@playwright/test';

/** Real-browser layout tests (test/e2e) against the built web app and a fake API. */
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.test.ts',
  forbidOnly: process.env.CI !== undefined,
  reporter: process.env.CI === undefined ? 'list' : 'github',
  use: { baseURL: 'http://localhost:4173', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
});
