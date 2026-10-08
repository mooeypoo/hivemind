import { describe, expect, test } from 'vitest';
import { loadConfig } from './config.ts';

const valid = {
  SITE_URL: 'https://lists.example.org',
  DISCORD_CLIENT_ID: 'client',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_GUILD_ID: '900000000000000001',
  ADMIN_ROLE_ID: '900000000000000002',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  test('accepts a complete environment; TMDB is optional', () => {
    const result = loadConfig(valid);
    expect(result.ok && result.value.tmdbReadToken).toBeNull();
    expect(result.ok && result.value.siteUrl).toBe('https://lists.example.org');
  });

  test('reports every missing variable at once', () => {
    const result = loadConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual([
        'SITE_URL is not set',
        'DISCORD_CLIENT_ID is not set',
        'DISCORD_CLIENT_SECRET is not set',
        'DISCORD_GUILD_ID is not set',
        'ADMIN_ROLE_ID is not set',
        'SESSION_SECRET is not set',
      ]);
    }
  });

  test.each([
    'https://lists.example.org/',
    'https://lists.example.org/app',
    'lists.example.org',
    'ftp://lists.example.org',
  ])('rejects SITE_URL %j: it must be a bare origin', (siteUrl) => {
    const result = loadConfig({ ...valid, SITE_URL: siteUrl });
    expect(!result.ok && result.error[0]).toMatch(/^SITE_URL must be an origin/);
  });

  test.each(['http://localhost:8888', 'http://127.0.0.1:8888'])(
    'accepts the local development origin %s over http',
    (siteUrl) => {
      expect(loadConfig({ ...valid, SITE_URL: siteUrl }).ok).toBe(true);
    },
  );

  test('rejects http:// for a deployed site', () => {
    const result = loadConfig({ ...valid, SITE_URL: 'http://lists.netlify.app' });
    expect(!result.ok && result.error).toEqual([
      'SITE_URL must use https:// (http:// is only allowed for localhost)',
    ]);
  });

  test('rejects a short session secret', () => {
    const result = loadConfig({ ...valid, SESSION_SECRET: 'short' });
    expect(!result.ok && result.error).toEqual(['SESSION_SECRET must be at least 32 characters']);
  });

  test('rejects Discord IDs that are not IDs', () => {
    const result = loadConfig({ ...valid, DISCORD_GUILD_ID: 'my-server', ADMIN_ROLE_ID: 'Admins' });
    expect(!result.ok && result.error).toEqual([
      'DISCORD_GUILD_ID must be a Discord ID',
      'ADMIN_ROLE_ID must be a Discord ID',
    ]);
  });
});
