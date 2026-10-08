import { describe, expect, test } from 'vitest';
import type { MemberId, RoleId } from '../../../shared/kernel/index.ts';
import { actorFor, type AdminPolicy } from './actor.ts';
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
  const policy = (roleId: string | null, memberIds: string[] = []): AdminPolicy => ({
    roleId: roleId as RoleId | null,
    memberIds: memberIds as MemberId[],
  });

  test('is an Admin when the session holds the admin role', () => {
    expect(actorFor(session, policy('admin')).isAdmin).toBe(true);
  });

  test('is not an Admin without the admin role', () => {
    expect(actorFor(session, policy('moderator')).isAdmin).toBe(false);
  });

  test('is an Admin when listed by member ID, whatever their roles', () => {
    expect(actorFor(session, policy('moderator', ['42'])).isAdmin).toBe(true);
    expect(actorFor(session, policy(null, ['42'])).isAdmin).toBe(true);
  });

  test('is not an Admin when neither the role nor the member list matches', () => {
    expect(actorFor(session, policy(null, ['7', '8'])).isAdmin).toBe(false);
    expect(actorFor(session, policy(null)).isAdmin).toBe(false);
  });

  test('carries the member id and role snapshot', () => {
    expect(actorFor(session, policy('admin'))).toEqual({
      kind: 'member',
      memberId: '42',
      roleIds: ['admin', 'regular'],
      isAdmin: true,
    });
  });
});
