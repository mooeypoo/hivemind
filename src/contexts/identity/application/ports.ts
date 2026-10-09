import type { DomainError, MemberId, Result } from '../../../shared/kernel/index.ts';
import type { CachedCommunity, Community } from '../domain/community.ts';
import type { Member } from '../domain/member.ts';
import type { RoleLabel } from '../domain/role-labels.ts';
import type { Membership } from '../domain/membership.ts';
import type { Session } from '../domain/session.ts';

/**
 * Discord, as identity needs it. The OAuth access token never crosses this port:
 * the adapter uses it for the membership check and discards it.
 */
export interface DiscordGateway {
  authorizeUrl(state: string): string;
  /** Errors: `identity.not-a-member`, `identity.login-rejected`, `identity.discord-unavailable`. */
  verifyMembership(code: string): Promise<Result<Membership, DomainError>>;
}

export interface VersionedMember {
  readonly member: Member;
  /** Opaque concurrency token (the Blobs ETag). */
  readonly version: string;
}

export interface MemberRepository {
  get(id: MemberId): Promise<VersionedMember | null>;
  /**
   * Creates the member when `expectedVersion` is null, otherwise updates it only if
   * it is unchanged. A lost race returns `identity.member-conflict`.
   */
  save(member: Member, expectedVersion: string | null): Promise<Result<void, DomainError>>;
  delete(id: MemberId): Promise<void>;
}

export interface SessionSigner {
  sign(session: Session): string;
  /** The session, or null if the token is malformed or its signature is wrong. Expiry is not checked here. */
  verify(token: string): Session | null;
}

/**
 * A context that stores data about members. Identity's export and erasure use cases
 * call every contributor, so "my data" always means all of it.
 */
export interface PersonalDataContributor {
  /** Key for this context's section of the export, e.g. `voting`. */
  readonly context: string;
  exportFor(memberId: MemberId): Promise<unknown>;
  /** An error stops the erasure; the member record is kept so they can try again. */
  eraseFor(memberId: MemberId): Promise<Result<void, DomainError>>;
}

/** Looks up the community's name and icon (from a Discord invite). */
export interface CommunityLookup {
  lookup(): Promise<Result<Community, DomainError>>;
}

export interface CommunityCache {
  get(): Promise<CachedCommunity | null>;
  put(cached: CachedCommunity): Promise<void>;
}

export interface RoleLabelRepository {
  get(): Promise<{ readonly labels: readonly RoleLabel[]; readonly version: string } | null>;
  /** Replaces the whole table if `expectedVersion` still matches (null: none saved yet). */
  save(labels: readonly RoleLabel[], expectedVersion: string | null): Promise<boolean>;
}

/**
 * Remembers that a member erased their data, as a one-way keyed fingerprint and a date,
 * so restoring an older backup can never bring their data back. Present only when backups
 * are configured.
 */
export interface ErasureRegistry {
  record(memberId: MemberId, at: Date): Promise<void>;
  wasErased(memberId: MemberId): Promise<boolean>;
  /** Removes fingerprints recorded before `cutoff`; returns how many. */
  forgetBefore(cutoff: Date): Promise<number>;
}
