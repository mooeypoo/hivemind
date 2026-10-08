import { describe, expect, test } from 'vitest';
import type { MemberId, RoleId } from '../../../shared/kernel/index.ts';
import type { Session } from '../domain/session.ts';
import { createHmacSessionSigner } from './hmac-session-signer.ts';

const session: Session = {
  memberId: '1001' as MemberId,
  roleIds: ['admin' as RoleId],
  expiresAt: 1_800_000_000,
};
const signer = createHmacSessionSigner('a-secret-of-at-least-thirty-two-bytes!');

describe('HMAC session signer', () => {
  test('round-trips a session', () => {
    expect(signer.verify(signer.sign(session))).toEqual(session);
  });

  test('rejects a token whose payload was changed', () => {
    const [, signature] = signer.sign(session).split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: 1, sub: '1001', roles: ['admin', 'owner'], exp: 9_999_999_999 }),
    ).toString('base64url');
    expect(signer.verify(`${forged}.${signature ?? ''}`)).toBeNull();
  });

  test('rejects a token signed with another secret (rotating the secret signs everyone out)', () => {
    const rotated = createHmacSessionSigner('a-completely-different-secret-value!!');
    expect(rotated.verify(signer.sign(session))).toBeNull();
  });

  test.each(['', 'garbage', 'a.b.c', 'abc.', '.abc'])('rejects malformed token %j', (token) => {
    expect(signer.verify(token)).toBeNull();
  });

  test('stores only the member id, roles and expiry in the cookie', () => {
    const [body] = signer.sign(session).split('.');
    const payload = JSON.parse(Buffer.from(body ?? '', 'base64url').toString('utf8')) as object;
    expect(Object.keys(payload).sort()).toEqual(['exp', 'roles', 'sub', 'v']);
  });
});
