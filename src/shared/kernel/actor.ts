import type { Brand } from './brand.ts';
import { domainError, type DomainError } from './domain-error.ts';
import { err, ok, type Result } from './result.ts';

/** A member's Discord user ID. */
export type MemberId = Brand<string, 'MemberId'>;
/** A Discord role ID in the community's server. */
export type RoleId = Brand<string, 'RoleId'>;

/**
 * Who is asking, and what they may do. Every use case receives one.
 * Only the identity context creates Actors; every other context only reads them.
 */
export type Actor =
  | { readonly kind: 'anonymous' }
  | {
      readonly kind: 'member';
      readonly memberId: MemberId;
      readonly roleIds: readonly RoleId[];
      readonly isAdmin: boolean;
    };

export type MemberActor = Extract<Actor, { kind: 'member' }>;

export const anonymous: Actor = { kind: 'anonymous' };

/** The guard every member-only use case starts with. */
export const requireMember = (actor: Actor): Result<MemberActor, DomainError> =>
  actor.kind === 'member'
    ? ok(actor)
    : err(domainError('unauthenticated', 'auth.sign-in-required', 'Sign in to continue.'));
