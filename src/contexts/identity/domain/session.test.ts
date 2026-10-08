import { describe, expect, test } from 'vitest';
import type { MemberId, RoleId } from '../../../shared/kernel/index.ts';
import { actorFor } from './actor.ts';
import type { Membership } from './membership.ts';
import { isExpired, issueSession, SESSION_TTL_SECONDS } from './session.ts';

const membership: Membership = {
  member: {
    id: '42' as MemberId,
    displayName: 'Ada',
    avatarUrl: 'https://cdn.discordapp.com/x.png',
  },
  roleIds: ['admin' as RoleId, 'regular' as RoleId],
};
const now = new Date('2026-01-01T00:00:00Z');

describe('Session', () => {
  test('lasts exactly 12 hours', () => {
    expect(SESSION_TTL_SECONDS).toBe(43_200);
    const session = issueSession(membership, now);
    expect(session.expiresAt).toBe(now.getTime() / 1000 + 43_200);
  });

  test('snapshots the member id and roles', () => {
    const session = issueSession(membership, now);
    expect(session.memberId).toBe('42');
    expect(session.roleIds).toEqual(['admin', 'regular']);
  });

  test('is valid until the moment it expires', () => {
    const session = issueSession(membership, now);
    const justBefore = new Date((session.expiresAt - 1) * 1000);
    const atExpiry = new Date(session.expiresAt * 1000);
    expect(isExpired(session, justBefore)).toBe(false);
    expect(isExpired(session, atExpiry)).toBe(true);
  });
});

describe('actorFor', () => {
  const session = issueSession(membership, now);

  test('is an Admin when the session holds the admin role', () => {
    expect(actorFor(session, 'admin' as RoleId).isAdmin).toBe(true);
  });

  test('is not an Admin without the admin role', () => {
    expect(actorFor(session, 'moderator' as RoleId).isAdmin).toBe(false);
  });

  test('carries the member id and role snapshot', () => {
    expect(actorFor(session, 'admin' as RoleId)).toEqual({
      kind: 'member',
      memberId: '42',
      roleIds: ['admin', 'regular'],
      isAdmin: true,
    });
  });
});
