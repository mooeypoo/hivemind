import { beforeEach, describe, expect, test } from 'vitest';
import {
  anonymous,
  domainError,
  err,
  type Actor,
  type MemberId,
} from '../../../shared/kernel/index.ts';
import { FixedClock } from '../../../shared/kernel/testing/index.ts';
import { COMMUNITY_TTL_SECONDS } from '../domain/community.ts';
import {
  communityOk,
  FakeCommunityLookup,
  InMemoryCommunityCache,
  InMemoryRoleLabelRepository,
} from '../infrastructure/testing/in-memory-community.ts';
import { makeGetCommunity } from './get-community.ts';
import { makeGetRoleLabels, makeSaveRoleLabels } from './role-labels.ts';

const down = err(domainError('unavailable', 'identity.discord-unavailable', 'Down'));

describe('community', () => {
  let clock: FixedClock;
  let cache: InMemoryCommunityCache;
  beforeEach(() => {
    clock = new FixedClock(new Date('2026-03-01T00:00:00Z'));
    cache = new InMemoryCommunityCache();
  });

  test('without an invite code, uses COMMUNITY_NAME, or nothing', async () => {
    expect(
      await makeGetCommunity({ lookup: null, cache, clock, fallbackName: 'Film Club' })(),
    ).toEqual({
      name: 'Film Club',
      iconUrl: null,
      inviteUrl: null,
    });
    expect(await makeGetCommunity({ lookup: null, cache, clock, fallbackName: null })()).toBeNull();
  });

  test('looks it up once a day', async () => {
    const lookup = new FakeCommunityLookup(communityOk('Film Club'));
    const get = makeGetCommunity({ lookup, cache, clock, fallbackName: null });
    expect((await get())?.name).toBe('Film Club');
    lookup.outcome = communityOk('Renamed');
    clock.advanceSeconds(COMMUNITY_TTL_SECONDS - 1);
    expect((await get())?.name).toBe('Film Club');
    clock.advanceSeconds(1);
    expect((await get())?.name).toBe('Renamed');
    expect(lookup.calls).toBe(2);
  });

  test('keeps the last known value when Discord fails, then falls back to the name', async () => {
    const lookup = new FakeCommunityLookup(communityOk('Film Club'));
    const get = makeGetCommunity({ lookup, cache, clock, fallbackName: 'Fallback' });
    await get();
    lookup.outcome = down;
    clock.advanceSeconds(COMMUNITY_TTL_SECONDS);
    expect((await get())?.name).toBe('Film Club');
    cache.value = null;
    expect((await get())?.name).toBe('Fallback');
  });
});

describe('role labels', () => {
  const member = (isAdmin: boolean): Actor => ({
    kind: 'member',
    memberId: '1' as MemberId,
    displayName: 'Ada',
    roleIds: [],
    isAdmin,
  });
  const admin = member(true);
  let roleLabels: InMemoryRoleLabelRepository;
  beforeEach(() => {
    roleLabels = new InMemoryRoleLabelRepository();
  });
  const film = { roleId: '900000000000000001', name: 'Film Club' };

  test('Admins save; members read', async () => {
    const saved = await makeSaveRoleLabels({ roleLabels })(admin, {
      labels: [film],
      version: null,
    });
    expect(saved.ok && saved.value.labels).toEqual([film]);
    const read = await makeGetRoleLabels({ roleLabels })(member(false));
    expect(read.ok && read.value.labels).toEqual([film]);
  });

  test('members cannot save, and anonymous callers cannot read', async () => {
    const saved = await makeSaveRoleLabels({ roleLabels })(member(false), {
      labels: [film],
      version: null,
    });
    expect(!saved.ok && saved.error.kind).toBe('forbidden');
    expect((await makeGetRoleLabels({ roleLabels })(anonymous)).ok).toBe(false);
  });

  test('a save based on an outdated version is refused, not merged', async () => {
    const first = await makeSaveRoleLabels({ roleLabels })(admin, {
      labels: [film],
      version: null,
    });
    if (!first.ok) throw new Error('fixture');
    await makeSaveRoleLabels({ roleLabels })(admin, { labels: [], version: first.value.version });
    const stale = await makeSaveRoleLabels({ roleLabels })(admin, {
      labels: [film],
      version: first.value.version,
    });
    expect(!stale.ok && stale.error.code).toBe('identity.role-labels-changed');
  });

  test('invalid rows are reported, nothing is saved', async () => {
    const result = await makeSaveRoleLabels({ roleLabels })(admin, {
      labels: [{ roleId: 'Moderators', name: 'Mods' }],
      version: null,
    });
    expect(!result.ok && result.error.details).toEqual([
      'Row 1: “Moderators” is not a Discord role ID.',
    ]);
    expect(await roleLabels.get()).toBeNull();
  });
});
