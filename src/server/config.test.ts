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
  test.each([
    ['', '', false],
    ['client', '', false],
    ['', 'secret', false],
    [' client ', ' secret ', true],
  ])('enables IGDB only with both credentials: %j / %j', (clientId, clientSecret, enabled) => {
    const result = loadConfig({
      ...valid,
      IGDB_CLIENT_ID: clientId,
      IGDB_CLIENT_SECRET: clientSecret,
    });
    expect(result.ok && result.value.igdb).toEqual(
      enabled ? { clientId: 'client', clientSecret: 'secret' } : null,
    );
  });

  test('accepts a complete environment; TMDB is optional', () => {
    const result = loadConfig(valid);
    expect(result.ok && result.value.tmdbReadToken).toBeNull();
    expect(result.ok && result.value.tvdbReadToken).toBeNull();
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
        'SESSION_SECRET is not set',
        'Set ADMIN_ROLE_ID, ADMIN_MEMBER_IDS, or both, so someone can manage lists',
      ]);
    }
  });

  test.each([
    { tmdb: '', tvdb: '', expectedTmdb: null, expectedTvdb: null },
    { tmdb: ' movie-token ', tvdb: '', expectedTmdb: 'movie-token', expectedTvdb: null },
    { tmdb: '', tvdb: ' tv-key ', expectedTmdb: null, expectedTvdb: 'tv-key' },
    { tmdb: 'movie-token', tvdb: 'tv-key', expectedTmdb: 'movie-token', expectedTvdb: 'tv-key' },
  ])(
    'enables media sources independently: $tmdb / $tvdb',
    ({ tmdb, tvdb, expectedTmdb, expectedTvdb }) => {
      const result = loadConfig({ ...valid, TMDB_READ_TOKEN: tmdb, TVDB_READ_TOKEN: tvdb });
      expect(result.ok && result.value.tmdbReadToken).toBe(expectedTmdb);
      expect(result.ok && result.value.tvdbReadToken).toBe(expectedTvdb);
    },
  );

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

  describe('admins', () => {
    const withoutRole = { ...valid, ADMIN_ROLE_ID: undefined };

    test('can be a role alone', () => {
      const result = loadConfig(valid);
      expect(result.ok && result.value.admins).toEqual({
        roleId: '900000000000000002',
        memberIds: [],
      });
    });

    test('can be member IDs alone, comma separated with optional spaces', () => {
      const result = loadConfig({
        ...withoutRole,
        ADMIN_MEMBER_IDS: '900000000000000003, 900000000000000004,',
      });
      expect(result.ok && result.value.admins).toEqual({
        roleId: null,
        memberIds: ['900000000000000003', '900000000000000004'],
      });
    });

    test('must name at least one way to be an Admin', () => {
      const result = loadConfig({ ...withoutRole, ADMIN_MEMBER_IDS: ' , ' });
      expect(!result.ok && result.error).toEqual([
        'Set ADMIN_ROLE_ID, ADMIN_MEMBER_IDS, or both, so someone can manage lists',
      ]);
    });

    test('rejects member IDs that are usernames rather than Discord user IDs', () => {
      const result = loadConfig({ ...valid, ADMIN_MEMBER_IDS: '900000000000000003,ada' });
      expect(!result.ok && result.error).toEqual([
        'ADMIN_MEMBER_IDS must be Discord user IDs, separated by commas',
      ]);
    });
  });

  describe('community', () => {
    test.each([
      ['abc123', 'abc123'],
      ['https://discord.gg/abc123', 'abc123'],
      ['discord.gg/abc123/', 'abc123'],
      ['https://discord.com/invite/abc-123', 'abc-123'],
    ])('reads the invite code from %j', (raw, code) => {
      const result = loadConfig({ ...valid, DISCORD_INVITE_CODE: raw });
      expect(result.ok && result.value.community.inviteCode).toBe(code);
    });

    test('rejects something that is not an invite', () => {
      const result = loadConfig({ ...valid, DISCORD_INVITE_CODE: 'https://example.com/join/abc' });
      expect(!result.ok && result.error).toEqual([
        'DISCORD_INVITE_CODE must be an invite code or link, like https://discord.gg/abc123',
      ]);
    });

    test('both settings are optional', () => {
      const result = loadConfig(valid);
      expect(result.ok && result.value.community).toEqual({ inviteCode: null, name: null });
    });
  });

  test('BACKUP_KEY is optional, and long when set', () => {
    expect(
      loadConfig(valid).ok &&
        (loadConfig(valid) as { value: { backupKey: unknown } }).value.backupKey,
    ).toBeNull();
    const short = loadConfig({ ...valid, BACKUP_KEY: 'short' });
    expect(!short.ok && short.error).toEqual(['BACKUP_KEY must be at least 32 characters']);
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
