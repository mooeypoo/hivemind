import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    // Web tests opt into a DOM with `// @vitest-environment happy-dom`.
    environment: 'node',
    // Build-time public settings, as vite.config.ts provides them to the app.
    env: {
      VITE_SITE_NAME: 'hivemind',
      VITE_SOURCE_URL: 'https://github.com/mooeypoo/hivemind',
    },
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // test/e2e runs in real browsers under Playwright (npm run test:e2e).
    exclude: ['test/boundaries/fixture/**', 'test/e2e/**'],
  },
});
