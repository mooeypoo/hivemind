import { beforeEach, describe, expect, test } from 'vitest';
import type { RoleId } from '../../../shared/kernel/index.ts';
import { FixedClock } from '../../../shared/kernel/testing/index.ts';
import { demoActor, operatorActor } from '../domain/demo.ts';
import { FakeSessionSigner } from '../infrastructure/testing/fake-session-signer.ts';
import { InMemoryMemberRepository } from '../infrastructure/testing/in-memory-member-repository.ts';
import { makeResolveActor } from './resolve-actor.ts';
import { makeStartDemoSession } from './start-demo-session.ts';

let members: InMemoryMemberRepository;
const signer = new FakeSessionSigner();
const clock = new FixedClock(new Date('2026-03-01T00:00:00Z'));
beforeEach(() => {
  members = new InMemoryMemberRepository();
});

const start = (enabled: boolean, persona: string) =>
  makeStartDemoSession({ enabled, members, signer, clock })(persona);
const resolve = (token: string) =>
  makeResolveActor({
    signer,
    members,
    clock,
    admins: { roleId: 'r' as RoleId, memberIds: [demoActor('admin').memberId] },
  })(token);

describe('demo sign-in', () => {
  test('is refused when demo mode is off', async () => {
    const result = await start(false, 'admin');
    expect(!result.ok && result.error.code).toBe('identity.demo-off');
    expect(members.all()).toEqual([]);
  });

  test('signs in as a pretend member, with a normal session', async () => {
    const result = await start(true, 'member-a');
    if (!result.ok) throw new Error(result.error.code);
    expect(await resolve(result.value.token)).toMatchObject({
      kind: 'member',
      memberId: 'demo-member-a',
      displayName: 'Demo Member A',
      isAdmin: false,
    });
  });

  test('the Demo Admin persona is an Admin', async () => {
    const result = await start(true, 'admin');
    if (!result.ok) throw new Error(result.error.code);
    expect((await resolve(result.value.token)).kind === 'member').toBe(true);
    expect(await resolve(result.value.token)).toMatchObject({ isAdmin: true });
  });

  test('only known personas exist', async () => {
    const result = await start(true, 'root');
    expect(!result.ok && result.error.code).toBe('identity.unknown-persona');
  });

  test('demo ids can never be Discord ids', () => {
    expect(demoActor('admin').memberId).toMatch(/^demo-/);
    expect(demoActor('admin').memberId).not.toMatch(/^\d+$/);
  });
});

describe('operator actor', () => {
  test('is an Admin named after its job, and not a Discord id', () => {
    expect(operatorActor('seed')).toMatchObject({
      kind: 'member',
      memberId: 'operator-seed',
      isAdmin: true,
    });
  });
});
