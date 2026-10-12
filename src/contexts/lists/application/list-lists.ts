import {
  ok,
  requireMember,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { visibleTo } from '../domain/list.ts';
import type { EntryRepository, LedgerRepository, ListRepository } from './ports.ts';
import { activeLedger } from './nomination-ledger.ts';
import { toListView, type ListView } from './views.ts';

/** Every list the caller may see, newest first. Drafts and hidden lists only for Admins. */
export const makeListLists =
  (deps: {
    readonly lists: ListRepository;
    readonly ledgers: LedgerRepository;
    readonly entries: EntryRepository;
    readonly clock: Clock;
  }) =>
  async (actor: Actor): Promise<Result<readonly ListView[], DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const now = deps.clock.now();
    const [lists, ledgers] = await Promise.all([
      deps.lists.all(),
      deps.ledgers.forMember(member.value.memberId),
    ]);
    const active = await Promise.all(ledgers.map((ledger) => activeLedger(deps.entries, ledger)));
    const used = new Map(active.map((ledger) => [ledger.listId, ledger.entryIds.length]));
    return ok(
      lists
        .filter((list) => visibleTo(list, member.value.isAdmin))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((list) => toListView(list, member.value, now, used.get(list.id) ?? 0)),
    );
  };
