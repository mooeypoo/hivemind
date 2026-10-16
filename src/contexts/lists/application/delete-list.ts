import {
  err,
  ok,
  requireAdmin,
  withConflictRetry,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { listsErrors } from '../domain/errors.ts';
import type { ListId } from '../domain/list.ts';
import type { EntryRepository, LedgerRepository, ListRepository, SlugIndex } from './ports.ts';

interface DeletionDeps {
  readonly lists: ListRepository;
  readonly entries: EntryRepository;
  readonly ledgers: LedgerRepository;
  readonly slugs: SlugIndex;
}

/** Persist intent before checking writers. No new writer can be admitted after this save. */
export const makePrepareListDeletion =
  (deps: Pick<DeletionDeps, 'lists' | 'slugs'>) =>
  async (
    actor: Actor,
    input: { readonly listId: string; readonly confirmation: string },
  ): Promise<Result<boolean, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    return withConflictRetry(async () => {
      const id = input.listId as ListId;
      const current = await deps.lists.get(id);
      if (current === null) {
        return (await deps.slugs.lookup(input.listId)) === null
          ? ok(false)
          : err(listsErrors.immutableIdRequired);
      }
      if (current.value.entryDeletion != null) return err(listsErrors.entryDeletionBusy);
      if (input.confirmation !== current.value.config.slug) {
        return err(listsErrors.confirmationMismatch);
      }
      if (
        current.value.deletionRequested !== true &&
        !(await deps.lists.save({ ...current.value, deletionRequested: true }, current.version))
      ) {
        return err(listsErrors.conflict);
      }
      return (await deps.lists.hasEntryWrites(id)) ? err(listsErrors.deletionBusy) : ok(true);
    });
  };

/** Called only after downstream cleanup; every step is safe to repeat after interruption. */
export const makeFinishListDeletion =
  (deps: DeletionDeps) =>
  async (actor: Actor, input: { readonly listId: string }): Promise<Result<void, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const id = input.listId as ListId;
    const current = await deps.lists.get(id);
    if (current === null) return ok(undefined);
    if (current.value.deletionRequested !== true) return err(listsErrors.deleting);
    if (await deps.lists.hasEntryWrites(id)) return err(listsErrors.deletionBusy);
    for (const entry of await deps.entries.forList(id)) {
      await deps.entries.delete(id, entry.id);
    }
    for (const ledger of await deps.ledgers.forList(id)) {
      await deps.ledgers.delete(ledger.memberId, id);
    }
    await deps.slugs.release(current.value.config.slug, id);
    await deps.lists.delete(id);
    return ok(undefined);
  };
