import { describe, expect, test } from 'vitest';
import { anonymous, requireAdmin, requireMember, type Actor, type MemberId } from './actor.ts';

describe('requireMember', () => {
  test('passes a member through', () => {
    const member: Actor = {
      kind: 'member',
      memberId: '1' as MemberId,
      displayName: 'Ada',
      roleIds: [],
      isAdmin: false,
    };
    expect(requireMember(member)).toEqual({ ok: true, value: member });
  });

  test('rejects an anonymous actor as unauthenticated', () => {
    const result = requireMember(anonymous);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('unauthenticated');
  });
});

describe('requireAdmin', () => {
  const member = (isAdmin: boolean): Actor => ({
    kind: 'member',
    memberId: '1' as MemberId,
    displayName: 'Ada',
    roleIds: [],
    isAdmin,
  });

  test('passes an Admin through', () => {
    expect(requireAdmin(member(true)).ok).toBe(true);
  });

  test('forbids a member who is not an Admin', () => {
    const result = requireAdmin(member(false));
    expect(!result.ok && result.error.kind).toBe('forbidden');
  });

  test('asks an anonymous actor to sign in', () => {
    const result = requireAdmin(anonymous);
    expect(!result.ok && result.error.kind).toBe('unauthenticated');
  });
});
