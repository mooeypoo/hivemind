import { describe, expect, test } from 'vitest';
import { anonymous, requireMember, type Actor, type MemberId } from './actor.ts';

describe('requireMember', () => {
  test('passes a member through', () => {
    const member: Actor = {
      kind: 'member',
      memberId: '1' as MemberId,
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
