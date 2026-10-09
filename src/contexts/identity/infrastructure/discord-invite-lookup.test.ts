import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  startLocalBlobs,
  type LocalBlobs,
} from '../../../shared/infrastructure/testing/local-blobs.ts';
import type { RoleId } from '../../../shared/kernel/index.ts';
import { createBlobsCommunityCache, createBlobsRoleLabelRepository } from './blobs-community.ts';
import { createDiscordInviteLookup } from './discord-invite-lookup.ts';

const invite =
  (guild: Record<string, unknown>): typeof fetch =>
  (input) => {
    expect(input instanceof Request ? input.url : input.toString()).toBe(
      'https://discord.com/api/v10/invites/filmclub',
    );
    return Promise.resolve(Response.json({ code: 'filmclub', guild }));
  };
const config = { inviteCode: 'filmclub', guildId: '900000000000000001' };

describe('Discord invite lookup', () => {
  test('maps the server name, icon and join link', async () => {
    const lookup = createDiscordInviteLookup(
      config,
      invite({ id: '900000000000000001', name: 'Film Club', icon: 'abc' }),
    );
    expect(await lookup.lookup()).toEqual({
      ok: true,
      value: {
        name: 'Film Club',
        iconUrl: 'https://cdn.discordapp.com/icons/900000000000000001/abc.png?size=64',
        inviteUrl: 'https://discord.gg/filmclub',
      },
    });
  });

  test('a server without an icon has none', async () => {
    const lookup = createDiscordInviteLookup(
      config,
      invite({ id: '900000000000000001', name: 'Film Club', icon: null }),
    );
    const result = await lookup.lookup();
    expect(result.ok && result.value.iconUrl).toBeNull();
  });

  test('ignores an invite to a different server', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lookup = createDiscordInviteLookup(
      config,
      invite({ id: '123456789012345678', name: 'Other', icon: null }),
    );
    expect((await lookup.lookup()).ok).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  test('treats Discord errors and network failures as unavailable', async () => {
    const notFound = createDiscordInviteLookup(config, () =>
      Promise.resolve(new Response(null, { status: 404 })),
    );
    expect((await notFound.lookup()).ok).toBe(false);
    const offline = createDiscordInviteLookup(config, () => Promise.reject(new Error('offline')));
    expect((await offline.lookup()).ok).toBe(false);
  });
});

describe('Blobs community cache and role labels', () => {
  let blobs: LocalBlobs;
  beforeAll(async () => {
    blobs = await startLocalBlobs();
  });
  afterAll(async () => {
    await blobs.close();
  });

  test('the community cache round-trips', async () => {
    const cache = createBlobsCommunityCache(blobs.store('identity'));
    expect(await cache.get()).toBeNull();
    const cached = {
      community: { name: 'Film Club', iconUrl: null, inviteUrl: null },
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    };
    await cache.put(cached);
    expect(await cache.get()).toEqual(cached);
  });

  test('role labels are saved with optimistic concurrency', async () => {
    const repo = createBlobsRoleLabelRepository(blobs.store('identity'));
    const labels = [{ roleId: '900000000000000001' as RoleId, name: 'Film Club' }];
    expect(await repo.save(labels, null)).toBe(true);
    const saved = await repo.get();
    expect(saved?.labels).toEqual(labels);
    expect(await repo.save([], null)).toBe(false);
    expect(await repo.save([], saved?.version ?? null)).toBe(true);
    expect((await repo.get())?.labels).toEqual([]);
  });
});
