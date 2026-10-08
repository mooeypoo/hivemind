import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MemberId, RoleId } from '../../../shared/kernel/index.ts';
import type { SessionSigner } from '../application/ports.ts';
import type { Session } from '../domain/session.ts';

/** Versioned cookie payload. Bump `v` and keep reading old versions if this ever changes. */
interface SessionPayloadV1 {
  readonly v: 1;
  readonly sub: string;
  readonly roles: readonly string[];
  readonly exp: number;
}

/**
 * `base64url(payload).base64url(hmacSha256(payload))`. Rotating the secret
 * invalidates every token, which signs everyone out.
 */
export const createHmacSessionSigner = (secret: string): SessionSigner => {
  const mac = (data: string): Buffer => createHmac('sha256', secret).update(data).digest();

  return {
    sign(session) {
      const payload: SessionPayloadV1 = {
        v: 1,
        sub: session.memberId,
        roles: session.roleIds,
        exp: session.expiresAt,
      };
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${body}.${mac(body).toString('base64url')}`;
    },

    verify(token) {
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [body, signature] = parts as [string, string];
      const expected = mac(body);
      const given = Buffer.from(signature, 'base64url');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      return parsePayload(Buffer.from(body, 'base64url').toString('utf8'));
    },
  };
};

const parsePayload = (json: string): Session | null => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { v, sub, roles, exp } = value as Record<string, unknown>;
  if (v !== 1 || typeof sub !== 'string' || typeof exp !== 'number') return null;
  if (!Array.isArray(roles) || !roles.every((role) => typeof role === 'string')) return null;
  return { memberId: sub as MemberId, roleIds: roles as RoleId[], expiresAt: exp };
};
