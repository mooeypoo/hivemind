import { beforeEach, describe, expect, test } from 'vitest';
import {
  anonymous,
  err,
  ok,
  type Actor,
  type MemberId,
  type RoleId,
} from '../../../shared/kernel/index.ts';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import { identityErrors } from '../domain/errors.ts';
import type { Membership } from '../domain/membership.ts';
import { SESSION_TTL_SECONDS } from '../domain/session.ts';
import { FakeDiscordGateway } from '../infrastructure/testing/fake-discord-gateway.ts';
import { FakeSessionSigner } from '../infrastructure/testing/fake-session-signer.ts';
import { InMemoryMemberRepository } from '../infrastructure/testing/in-memory-member-repository.ts';
import { makeCompleteLogin } from './complete-login.ts';
import { makeDeleteMyData } from './delete-my-data.ts';
import { ERASURE_MEMORY_DAYS, makeForgetOldErasures, makeWasErased } from './erasures.ts';
import { InMemoryErasureRegistry } from '../infrastructure/testing/in-memory-erasures.ts';
import { makeExportMyData } from './export-my-data.ts';
import { makeGetMe } from './get-me.ts';
import type { PersonalDataContributor } from './ports.ts';
import { makeResolveActor } from './resolve-actor.ts';
import { makeStartLogin } from './start-login.ts';

const ADMIN = 'role-admin' as RoleId;
const ada: Membership = {
  member: {
    id: '1001' as MemberId,
    displayName: 'Ada',
    avatarUrl: 'https://cdn.discordapp.com/avatars/1001/abc.png',
  },
  roleIds: [ADMIN],
};

let clock: FixedClock;
let discord: FakeDiscordGateway;
let members: InMemoryMemberRepository;
let signer: FakeSessionSigner;

beforeEach(() => {
  clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  discord = new FakeDiscordGateway(ok(ada));
  members = new InMemoryMemberRepository();
  signer = new FakeSessionSigner();
});

const completeLogin = () => makeCompleteLogin({ discord, members, signer, clock });
const resolveActor = () =>
  makeResolveActor({ signer, members, clock, admins: { roleId: ADMIN, memberIds: [] } });

const signIn = async (): Promise<string> => {
  const result = await completeLogin()({ code: 'c', state: 's', expectedState: 's' });
  if (!result.ok) throw new Error(result.error.code);
  return result.value.token;
};

const signedInActor = async (): Promise<Actor> => resolveActor()(await signIn());

describe('start login', () => {
  test('creates a fresh state and points at Discord with it', () => {
    const start = makeStartLogin({ discord, ids: new SequentialIds() });
    const first = start();
    const second = start();
    expect(first.state).not.toBe(second.state);
    expect(first.redirectTo).toContain(`state=${first.state}`);
  });
});

describe('complete login', () => {
  test.each([
    ['missing', null],
    ['mismatched', 'other-state'],
  ])('rejects a %s state cookie before calling Discord', async (_, expectedState) => {
    const result = await completeLogin()({ code: 'c', state: 's', expectedState });
    expect(result).toEqual(err(identityErrors.invalidLoginState));
    expect(discord.codes).toEqual([]);
  });

  test('stores nothing for someone outside the community', async () => {
    discord.willReturn(err(identityErrors.notAMember));
    const result = await completeLogin()({ code: 'c', state: 's', expectedState: 's' });
    expect(result).toEqual(err(identityErrors.notAMember));
    expect(members.all()).toEqual([]);
  });

  test('stores the member and grants a 12-hour session', async () => {
    const result = await completeLogin()({ code: 'c', state: 's', expectedState: 's' });
    expect(result.ok && result.value.maxAgeSeconds).toBe(SESSION_TTL_SECONDS);
    expect(members.all()).toEqual([ada.member]);
  });

  test('updates the profile of a returning member', async () => {
    await signIn();
    const renamed = { ...ada, member: { ...ada.member, displayName: 'Ada L.' } };
    discord.willReturn(ok(renamed));
    await signIn();
    expect(members.all()).toEqual([renamed.member]);
  });

  test('retries the save once after a conflict', async () => {
    members.conflictOnNextSaves(1);
    const result = await completeLogin()({ code: 'c', state: 's', expectedState: 's' });
    expect(result.ok).toBe(true);
    expect(members.saves).toBe(2);
    expect(discord.codes).toEqual(['c']);
  });

  test('gives up with a conflict after the retry also conflicts', async () => {
    members.conflictOnNextSaves(2);
    const result = await completeLogin()({ code: 'c', state: 's', expectedState: 's' });
    expect(result).toEqual(err(identityErrors.memberConflict));
  });
});

describe('resolve actor', () => {
  test('a valid session resolves to a member with the admin role applied', async () => {
    expect(await signedInActor()).toEqual({
      kind: 'member',
      memberId: '1001',
      displayName: 'Ada',
      roleIds: [ADMIN],
      isAdmin: true,
    });
  });

  test('without the admin role the member is not an Admin', async () => {
    discord.willReturn(ok({ ...ada, roleIds: ['role-regular' as RoleId] }));
    const actor = await signedInActor();
    expect(actor.kind === 'member' && actor.isAdmin).toBe(false);
  });

  test('a member listed by ID is an Admin without the admin role', async () => {
    discord.willReturn(ok({ ...ada, roleIds: [] }));
    const token = await signIn();
    const actor = await makeResolveActor({
      signer,
      members,
      clock,
      admins: { roleId: null, memberIds: [ada.member.id] },
    })(token);
    expect(actor.kind === 'member' && actor.isAdmin).toBe(true);
  });

  test('no token is anonymous', async () => {
    expect(await resolveActor()(null)).toEqual(anonymous);
  });

  test('a tampered token is anonymous', async () => {
    const token = await signIn();
    expect(await resolveActor()(`x${token}`)).toEqual(anonymous);
  });

  test('an expired session is anonymous', async () => {
    const token = await signIn();
    clock.advanceSeconds(SESSION_TTL_SECONDS);
    expect(await resolveActor()(token)).toEqual(anonymous);
  });

  test('a session of an erased member is anonymous', async () => {
    const token = await signIn();
    await members.delete(ada.member.id);
    expect(await resolveActor()(token)).toEqual(anonymous);
  });
});

describe('my data', () => {
  const contributor = (context: string, log: string[]): PersonalDataContributor => ({
    context,
    exportFor: (memberId) => Promise.resolve({ from: context, memberId }),
    eraseFor: (memberId) => {
      log.push(`${context}:${memberId}`);
      return Promise.resolve(ok(undefined));
    },
  });

  test.each(['get me', 'export', 'delete'] as const)(
    '%s requires a signed-in member',
    async (name) => {
      const useCases = {
        'get me': makeGetMe({ members }),
        export: makeExportMyData({ members, contributors: [], clock }),
        delete: makeDeleteMyData({ members, contributors: [], erasures: null, clock }),
      };
      const result = await useCases[name](anonymous);
      expect(result.ok || result.error.kind).toBe('unauthenticated');
    },
  );

  test('get me returns the profile and admin flag', async () => {
    const result = await makeGetMe({ members })(await signedInActor());
    expect(result).toEqual(ok({ ...ada.member, isAdmin: true }));
  });

  test('export includes the identity record and every contributor', async () => {
    const contributors = [contributor('voting', []), contributor('lists', [])];
    const result = await makeExportMyData({ members, contributors, clock })(await signedInActor());
    expect(result).toEqual(
      ok({
        exportedAt: '2026-01-01T00:00:00.000Z',
        identity: ada.member,
        voting: { from: 'voting', memberId: '1001' },
        lists: { from: 'lists', memberId: '1001' },
      }),
    );
  });

  test('a failing contributor stops the erasure and keeps the member, so they can retry', async () => {
    const failing: PersonalDataContributor = {
      context: 'voting',
      exportFor: () => Promise.resolve({}),
      eraseFor: () => Promise.resolve(err(identityErrors.memberConflict)),
    };
    const log: string[] = [];
    const actor = await signedInActor();
    const result = await makeDeleteMyData({
      members,
      contributors: [failing, contributor('lists', log)],
      erasures: null,
      clock,
    })(actor);
    expect(result).toEqual(err(identityErrors.memberConflict));
    expect(log).toEqual([]);
    expect(members.all()).toEqual([ada.member]);
  });

  test('delete erases every contributor, then the member', async () => {
    const log: string[] = [];
    const contributors = [contributor('voting', log), contributor('lists', log)];
    const actor = await signedInActor();
    const result = await makeDeleteMyData({ members, contributors, erasures: null, clock })(actor);
    expect(result.ok).toBe(true);
    expect(log).toEqual(['voting:1001', 'lists:1001']);
    expect(members.all()).toEqual([]);
  });
});

describe('remembering erasures (when backups are configured)', () => {
  test('deleting my data records a fingerprint first, so a backup can never restore it', async () => {
    const erasures = new InMemoryErasureRegistry();
    const actor = await signedInActor();
    await makeDeleteMyData({ members, contributors: [], erasures, clock })(actor);
    expect(await makeWasErased({ erasures })('1001')).toBe(true);
    expect(await makeWasErased({ erasures })('2002')).toBe(false);
  });

  test('without backups nothing is recorded, and nobody counts as erased', async () => {
    expect(await makeWasErased({ erasures: null })('1001')).toBe(false);
  });

  test('erasures are forgotten after two years', async () => {
    const erasures = new InMemoryErasureRegistry();
    await erasures.record('1001' as MemberId, clock.now());
    clock.advanceSeconds((ERASURE_MEMORY_DAYS - 1) * 86_400);
    expect(await makeForgetOldErasures({ erasures, clock })()).toBe(0);
    clock.advanceSeconds(2 * 86_400);
    expect(await makeForgetOldErasures({ erasures, clock })()).toBe(1);
  });
});
