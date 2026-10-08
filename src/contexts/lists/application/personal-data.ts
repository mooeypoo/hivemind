import {
  err,
  ok,
  type DomainError,
  type MemberId,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { EntryId } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import type { ListId } from '../domain/list.ts';
import type { EntryRepository, LedgerRepository } from './ports.ts';

export interface ListsPersonalDataDeps {
  readonly entries: EntryRepository;
  readonly ledgers: LedgerRepository;
}

/**
 * Lists' part of "my data". Export: the member's nominations. Erase: their entries stay,
 * because others have rated them, but no longer name them; their ledgers are deleted.
 */
export const makeListsPersonalData = (deps: ListsPersonalDataDeps) => ({
  context: 'lists',

  async exportFor(memberId: MemberId) {
    const ledgers = await deps.ledgers.forMember(memberId);
    const nominations = await Promise.all(
      ledgers.flatMap((ledger) =>
        ledger.entryIds.map(async (entryId) => {
          const entry = await deps.entries.get(ledger.listId, entryId);
          return entry === null
            ? null
            : {
                listId: ledger.listId,
                entryId,
                title: entry.value.item.title,
                nominatedAt: entry.value.nominatedAt.toISOString(),
              };
        }),
      ),
    );
    return { nominations: nominations.filter((nomination) => nomination !== null) };
  },

  async eraseFor(memberId: MemberId): Promise<Result<void, DomainError>> {
    for (const ledger of await deps.ledgers.forMember(memberId)) {
      for (const entryId of ledger.entryIds) {
        if (!(await anonymise(deps, ledger.listId, entryId, memberId))) {
          return err(listsErrors.conflict);
        }
      }
      await deps.ledgers.delete(memberId, ledger.listId);
    }
    return ok(undefined);
  },
});

/** Removes the nominator from an entry, retrying once on a concurrent write. */
const anonymise = async (
  deps: ListsPersonalDataDeps,
  listId: ListId,
  entryId: EntryId,
  memberId: MemberId,
): Promise<boolean> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const entry = await deps.entries.get(listId, entryId);
    if (entry?.value.nominatedBy?.memberId !== memberId) return true;
    if (await deps.entries.save({ ...entry.value, nominatedBy: null }, entry.version)) return true;
  }
  return false;
};
