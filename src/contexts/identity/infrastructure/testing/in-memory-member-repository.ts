import {
  err,
  ok,
  type DomainError,
  type MemberId,
  type Result,
} from '../../../../shared/kernel/index.ts';
import { identityErrors } from '../../domain/errors.ts';
import type { Member } from '../../domain/member.ts';
import type { MemberRepository, VersionedMember } from '../../application/ports.ts';

export class InMemoryMemberRepository implements MemberRepository {
  private readonly rows = new Map<MemberId, VersionedMember>();
  private version = 0;
  private pendingConflicts = 0;

  /** Makes the next `count` saves lose a concurrent-write race. */
  conflictOnNextSaves(count: number): void {
    this.pendingConflicts = count;
  }

  saves = 0;

  get(id: MemberId): Promise<VersionedMember | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  save(member: Member, expectedVersion: string | null): Promise<Result<void, DomainError>> {
    this.saves += 1;
    if (this.pendingConflicts > 0) {
      this.pendingConflicts -= 1;
      return Promise.resolve(err(identityErrors.memberConflict));
    }
    const current = this.rows.get(member.id)?.version ?? null;
    if (current !== expectedVersion) return Promise.resolve(err(identityErrors.memberConflict));
    this.version += 1;
    this.rows.set(member.id, { member, version: `v${String(this.version)}` });
    return Promise.resolve(ok(undefined));
  }

  delete(id: MemberId): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  all(): Member[] {
    return [...this.rows.values()].map((row) => row.member);
  }
}
