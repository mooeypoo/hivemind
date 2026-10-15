import {
  err,
  ok,
  domainError,
  type MemberId,
  type DomainError,
  type Result,
} from '../../../../shared/kernel/index.ts';
import type {
  BallotRepository,
  ListReader,
  ListVotingRules,
  VersionedBallot,
} from '../../application/ports.ts';
import type { Ballot, BallotEntryId, BallotListId } from '../../domain/ballot.ts';

export class InMemoryBallotRepository implements BallotRepository {
  private readonly rows = new Map<string, VersionedBallot>();
  private counter = 0;
  private key = (listId: string, memberId: string) => `${listId}/${memberId}`;

  get(listId: BallotListId, memberId: MemberId): Promise<VersionedBallot | null> {
    return Promise.resolve(this.rows.get(this.key(listId, memberId)) ?? null);
  }

  save(ballot: Ballot, expectedVersion: string | null): Promise<boolean> {
    const key = this.key(ballot.listId, ballot.memberId);
    if ((this.rows.get(key)?.version ?? null) !== expectedVersion) return Promise.resolve(false);
    this.counter += 1;
    this.rows.set(key, { ballot, version: `v${String(this.counter)}` });
    return Promise.resolve(true);
  }

  delete(listId: BallotListId, memberId: MemberId): Promise<void> {
    this.rows.delete(this.key(listId, memberId));
    return Promise.resolve();
  }

  forList(listId: BallotListId): Promise<Ballot[]> {
    return Promise.resolve(
      [...this.rows.values()].map((row) => row.ballot).filter((b) => b.listId === listId),
    );
  }

  forMember(memberId: MemberId): Promise<Ballot[]> {
    return Promise.resolve(
      [...this.rows.values()].map((row) => row.ballot).filter((b) => b.memberId === memberId),
    );
  }
}

/** Lists as voting sees them: set the rules and entries per list directly. */
export class FakeListReader implements ListReader {
  withWrite<T>(_listId: string, work: () => Promise<Result<T, DomainError>>) {
    return work();
  }
  readonly lists = new Map<string, ListVotingRules & { entries: Set<string> }>();

  add(
    list: string,
    rules: Partial<ListVotingRules> = {},
    entries: string[] = ['e1', 'e2', 'e3'],
  ): void {
    this.lists.set(list, {
      listId: list as BallotListId,
      isOpen: true,
      scale: { min: 1, max: 10 },
      requiredRoleIds: [],
      scoresPublic: false,
      namesWithScores: false,
      ...rules,
      entries: new Set(entries),
    });
  }

  /** Lists marked hidden here are not found unless the viewer is an Admin. */
  readonly hidden = new Set<string>();

  rulesFor(list: string, viewer: { readonly isAdmin: boolean }) {
    const found = this.lists.get(list);
    return Promise.resolve(
      found === undefined || (this.hidden.has(list) && !viewer.isAdmin)
        ? err(domainError('not-found', 'lists.not-found', 'Not found'))
        : ok(found),
    );
  }

  entryExists(listId: BallotListId, entryId: BallotEntryId): Promise<boolean> {
    return Promise.resolve(this.lists.get(listId)?.entries.has(entryId) ?? false);
  }
}
