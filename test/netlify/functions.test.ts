import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { rateLimits } from '../../src/server/functions.ts';

/**
 * AGENTS.md: rate limits on search and on every mutation (and on sign-in). Backup export is a
 * GET, but heavy, so it is limited like a mutation. Every function file
 * is checked, so a new route can't forget its limit.
 */
const dir = fileURLToPath(new URL('../../netlify/functions/', import.meta.url));
const files = readdirSync(dir).filter((file) => file.endsWith('.mts'));

interface FunctionConfig {
  path?: string;
  method?: string;
  schedule?: string;
  rateLimit?: unknown;
}

const SIGN_IN = ['/api/auth/login', '/api/auth/callback', '/api/auth/demo'];

const load = async (file: string): Promise<FunctionConfig> =>
  ((await import(`${dir}${file}`)) as { config: FunctionConfig }).config;

describe('Netlify functions', () => {
  test('exist', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test('leaves the homepage to the static app', async () => {
    const configs = await Promise.all(files.map(load));
    expect(configs.some((config) => config.path === '/')).toBe(false);
  });

  test.each(files)('%s has the right rate limit', async (file) => {
    const config = await load(file);
    if (config.schedule !== undefined) return; // scheduled jobs have no route
    const path = config.path ?? '';
    const expected = SIGN_IN.includes(path)
      ? rateLimits.signIn
      : path.endsWith('/search') || path.endsWith('/item')
        ? rateLimits.search
        : config.method !== 'GET' || path.startsWith('/api/admin/backup')
          ? rateLimits.mutation
          : undefined;
    expect(config.rateLimit).toEqual(expected);
  });
});
