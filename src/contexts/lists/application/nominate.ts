import {
  err,
  ok,
  requireMember,
  withConflictRetry,
  type Actor,
  type Clock,
  type DomainError,
  type MemberActor,
  type Result,
} from '../../../shared/kernel/index.ts';
import { entryIdFor, type Entry, type EntryId } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { emptyLedger, release, reserve, type NominationLedger } from '../domain/ledger.ts';
import { mayParticipate, nominationsOpen, type List } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type {
  Catalog,
  EntryRepository,
  LedgerRepository,
  ListRepository,
  SlugIndex,
} from './ports.ts';
import { toEntryView, type EntryView } from './views.ts';

export interface NominateDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly entries: EntryRepository;
  readonly ledgers: LedgerRepository;
  readonly catalog: Catalog;
  readonly clock: Clock;
}

export interface NominateInput {
  readonly list: string;
  /** The item's externalId, or for a free-text list, its title. */
  readonly key: string;
}

/**
 * Nominates an item: the member reserves one of their nominations, then the entry is
 * created only if no entry for the same item exists. A duplicate gives the reservation back.
 */
export const makeNominate =
  (deps: NominateDeps) =>
  async (actor: Actor, input: NominateInput): Promise<Result<EntryView, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const found = await findList(deps, member.value, input.list);
    if (!found.ok) return found;
    const list = found.value.value;
    const now = deps.clock.now();
    if (!mayParticipate(list, member.value.roleIds)) return err(listsErrors.roleRequired);
    if (!nominationsOpen(list, now)) return err(listsErrors.nominationsClosed);

    const item = await deps.catalog.resolve(list.config.itemSource, input.key);
    if (!item.ok) return item;
    const entry: Entry = {
      id: entryIdFor(item.value),
      listId: list.id,
      item: item.value,
      nominatedBy: { memberId: member.value.memberId, displayName: member.value.displayName },
      nominatedAt: now,
    };

    const reserved = await withConflictRetry(() =>
      updateLedger(deps, member.value, list, (ledger) =>
        reserve(ledger, entry.id, list.config.maxNominationsPerMember),
      ),
    );
    if (!reserved.ok) return reserved;

    if (!(await deps.entries.create(entry))) {
      await withConflictRetry(() =>
        updateLedger(deps, member.value, list, (ledger) => ok(release(ledger, entry.id))),
      );
      return err(listsErrors.alreadyNominated);
    }
    return ok(toEntryView(entry, list, member.value));
  };

const updateLedger = async (
  deps: NominateDeps,
  member: MemberActor,
  list: List,
  change: (ledger: NominationLedger) => Result<NominationLedger, DomainError>,
): Promise<Result<readonly EntryId[], DomainError>> => {
  const current = await deps.ledgers.get(member.memberId, list.id);
  const changed = change(current?.value ?? emptyLedger(member.memberId, list.id));
  if (!changed.ok) return changed;
  return (await deps.ledgers.save(changed.value, current?.version ?? null))
    ? ok(changed.value.entryIds)
    : err(listsErrors.conflict);
};
