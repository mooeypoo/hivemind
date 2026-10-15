import {
  ok,
  requireMember,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { findList } from './find-list.ts';
import { archivedSince, lifecycleOf, visibleTo, type ListId } from '../domain/list.ts';
import type {
  Catalog,
  EntryRepository,
  LedgerRepository,
  ListRepository,
  SlugIndex,
} from './ports.ts';
import { toEntryView, toListView, type ListDetail } from './views.ts';
import { isActiveEntry } from '../domain/entry.ts';
import { activeLedger } from './nomination-ledger.ts';

export interface GetListDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly entries: EntryRepository;
  readonly ledgers: LedgerRepository;
  readonly clock: Clock;
  readonly catalog: Pick<Catalog, 'snapshotRetentionDays'>;
}

export const makeGetSharePreview =
  (deps: Pick<GetListDeps, 'lists' | 'slugs'>) =>
  async (input: { readonly list: string }): Promise<{ title: string; slug: string } | null> => {
    const byId = await deps.lists.get(input.list as ListId);
    const id = byId === null ? await deps.slugs.lookup(input.list) : null;
    const found = byId ?? (id === null ? null : await deps.lists.get(id));
    if (found === null || !visibleTo(found.value, false)) return null;
    return { title: found.value.config.title, slug: found.value.config.slug };
  };

export const makeGetList =
  (deps: GetListDeps) =>
  async (
    actor: Actor,
    input: { readonly list: string },
  ): Promise<Result<ListDetail, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const found = await findList(deps, member.value, input.list, {
      allowDeleting: member.value.isAdmin,
    });
    if (!found.ok) return found;
    const list = found.value.value;
    const writingEntries = member.value.isAdmin && (await deps.lists.hasEntryWrites(list.id));
    const [entries, ledger] = await Promise.all([
      deps.entries.forList(list.id),
      deps.ledgers.get(member.value.memberId, list.id),
    ]);
    return ok({
      ...toListView(
        list,
        member.value,
        deps.clock.now(),
        ledger === null ? 0 : (await activeLedger(deps.entries, ledger.value)).entryIds.length,
      ),
      itemSourceEditable:
        member.value.isAdmin &&
        list.deletionRequested !== true &&
        !writingEntries &&
        entries.length === 0 &&
        (list.phase === 'draft' ||
          (list.config.entryMode === 'nominations' &&
            ['scheduled', 'open'].includes(lifecycleOf(list, deps.clock.now())))),
      snapshotsExpireAt: expiry(list, deps.catalog),
      entries: entries
        .filter(isActiveEntry)
        .sort(
          (a, b) =>
            a.nominatedAt.getTime() - b.nominatedAt.getTime() ||
            a.item.title.localeCompare(b.item.title),
        )
        .map((entry) => toEntryView(entry, list, member.value, deps.clock.now())),
    });
  };

const expiry = (
  list: Parameters<typeof archivedSince>[0],
  catalog: Pick<Catalog, 'snapshotRetentionDays'>,
): Date | null => {
  const since = archivedSince(list);
  const days = catalog.snapshotRetentionDays(list.config.itemSource.kind);
  return since === null || days === null ? null : new Date(since.getTime() + days * 86_400_000);
};
