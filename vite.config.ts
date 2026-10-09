import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Per-deployment display name (see AGENTS.md, Environment). Unset or blank falls back to the default.
const siteName = process.env.VITE_SITE_NAME?.trim();
process.env.VITE_SITE_NAME = siteName === undefined || siteName === '' ? 'hivemind' : siteName;

// Where the source code lives (footer link). Forks set their own.
const sourceUrl = process.env.VITE_SOURCE_URL?.trim();
process.env.VITE_SOURCE_URL =
  sourceUrl === undefined || sourceUrl === '' ? 'https://github.com/mooeypoo/hivemind' : sourceUrl;

export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
});
