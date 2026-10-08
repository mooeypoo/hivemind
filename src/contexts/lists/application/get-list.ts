import {
  ok,
  requireMember,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { findList } from './find-list.ts';
import type { EntryRepository, LedgerRepository, ListRepository, SlugIndex } from './ports.ts';
import { toEntryView, toListView, type ListDetail } from './views.ts';

export interface GetListDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly entries: EntryRepository;
  readonly ledgers: LedgerRepository;
  readonly clock: Clock;
}

export const makeGetList =
  (deps: GetListDeps) =>
  async (
    actor: Actor,
    input: { readonly list: string },
  ): Promise<Result<ListDetail, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const found = await findList(deps, member.value, input.list);
    if (!found.ok) return found;
    const list = found.value.value;
    const [entries, ledger] = await Promise.all([
      deps.entries.forList(list.id),
      deps.ledgers.get(member.value.memberId, list.id),
    ]);
    return ok({
      ...toListView(list, member.value, deps.clock.now(), ledger?.value.entryIds.length ?? 0),
      entries: entries
        .sort(
          (a, b) =>
            a.nominatedAt.getTime() - b.nominatedAt.getTime() ||
            a.item.title.localeCompare(b.item.title),
        )
        .map((entry) => toEntryView(entry, list, member.value)),
    });
  };
