import {
  err,
  ok,
  requireAdmin,
  withConflictRetry,
  type Actor,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Result,
} from '../../../shared/kernel/index.ts';
import { nominationToken, type EntryId } from '../domain/entry.ts';
import { release } from '../domain/ledger.ts';
import { listsErrors } from '../domain/errors.ts';
import type { List, ListId } from '../domain/list.ts';
import type { EntryRepository, LedgerRepository, ListRepository, SlugIndex } from './ports.ts';
import { appendListActivity } from '../domain/list-activity.ts';

export interface EntryDeletionInput {
  readonly listId: string;
  readonly entryId: string;
  readonly token: string;
  readonly confirmation: string;
}

interface Deps {
  readonly lists: ListRepository;
  readonly entries: EntryRepository;
  readonly ledgers: LedgerRepository;
  readonly slugs: SlugIndex;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

const matches = (list: List, input: EntryDeletionInput): boolean =>
  list.entryDeletion?.entryId === input.entryId &&
  list.entryDeletion.token === input.token &&
  list.entryDeletion.title === input.confirmation;

export const makePrepareEntryDeletion =
  (deps: Deps) =>
  async (
    actor: Actor,
    input: EntryDeletionInput,
  ): Promise<Result<'cleaning' | 'finishing' | null, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    return withConflictRetry(async () => {
      const id = input.listId as ListId;
      const current = await deps.lists.get(id);
      if (current === null) {
        return (await deps.slugs.lookup(input.listId)) === null
          ? err(listsErrors.notFound)
          : err(listsErrors.immutableIdRequired);
      }
      if (current.value.deletionRequested === true) return err(listsErrors.deleting);
      if (current.value.entryDeletion != null) {
        if (!matches(current.value, input)) return err(listsErrors.entryDeletionBusy);
        if (await deps.lists.hasEntryWrites(id)) return err(listsErrors.deletionBusy);
        const entry = await deps.entries.get(id, input.entryId as EntryId);
        if (entry !== null && nominationToken(entry.value) !== input.token) {
          if (!(await deps.lists.save({ ...current.value, entryDeletion: null }, current.version)))
            return err(listsErrors.conflict);
          return err(listsErrors.conflict);
        }
        return (await deps.lists.hasEntryWrites(id))
          ? err(listsErrors.deletionBusy)
          : ok(current.value.entryDeletion.phase);
      }
      const entry = await deps.entries.get(id, input.entryId as EntryId);
      if (entry === null) return ok(null);
      if (nominationToken(entry.value) !== input.token) return err(listsErrors.conflict);
      if (entry.value.item.title !== input.confirmation) {
        return err(listsErrors.entryConfirmationMismatch);
      }
      if (
        !(await deps.lists.save(
          {
            ...current.value,
            entryDeletion: {
              entryId: input.entryId,
              token: input.token,
              title: input.confirmation,
              phase: 'cleaning',
            },
            entryDeletionRevision: deps.ids.next(),
          },
          current.version,
        ))
      )
        return err(listsErrors.conflict);
      return (await deps.lists.hasEntryWrites(id)) ? err(listsErrors.deletionBusy) : ok('cleaning');
    });
  };

/** Cleanup writers are fenced too: a delayed retry must never erase a fresh nomination's scores. */
export const makeWithEntryDeletion =
  (deps: Deps) =>
  async (
    actor: Actor,
    input: EntryDeletionInput,
    work: () => Promise<Result<void, DomainError>>,
  ): Promise<Result<void, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const id = input.listId as ListId;
    const token = deps.ids.next();
    let completed = false;
    try {
      await deps.lists.beginEntryWrite(id, token);
      const admitted = await withConflictRetry(async () => {
        const current = await deps.lists.get(id);
        if (
          current === null ||
          !matches(current.value, input) ||
          current.value.entryDeletion?.phase !== 'cleaning'
        )
          return err(listsErrors.conflict);
        const entry = await deps.entries.get(id, input.entryId as EntryId);
        if (entry !== null && nominationToken(entry.value) !== input.token) {
          return err(listsErrors.conflict);
        }
        return (await deps.lists.save(
          { ...current.value, entryWriteToken: token },
          current.version,
        ))
          ? ok(undefined)
          : err(listsErrors.conflict);
      });
      if (!admitted.ok) {
        completed = true;
        return admitted;
      }
      const result = await work();
      if (result.ok) {
        for (const ledger of await deps.ledgers.forList(id)) {
          if (
            !ledger.entryIds.includes(input.entryId as EntryId) &&
            ledger.claims?.[input.entryId] === undefined
          )
            continue;
          const changed = await withConflictRetry(async () => {
            const current = await deps.ledgers.get(ledger.memberId, id);
            if (current === null) return ok(undefined);
            return (await deps.ledgers.save(
              release(current.value, input.entryId as EntryId),
              current.version,
            ))
              ? ok(undefined)
              : err(listsErrors.conflict);
          });
          if (!changed.ok) {
            completed = true;
            return changed;
          }
        }
        await deps.entries.delete(id, input.entryId as EntryId);
      }
      completed = true;
      return result;
    } finally {
      if (completed) await deps.lists.endEntryWrite(id, token);
    }
  };

/** Close cleanup admission before draining cleaners and reopening normal participation. */
export const makeFinishEntryDeletion =
  (deps: Deps) =>
  async (actor: Actor, input: EntryDeletionInput): Promise<Result<void, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    return withConflictRetry(async () => {
      const id = input.listId as ListId;
      let current = await deps.lists.get(id);
      if (current === null) return err(listsErrors.notFound);
      if (current.value.entryDeletion == null) return ok(undefined);
      if (!matches(current.value, input)) return err(listsErrors.conflict);
      if (current.value.entryDeletion.phase === 'cleaning') {
        if (
          !(await deps.lists.save(
            {
              ...current.value,
              entryDeletion: { ...current.value.entryDeletion, phase: 'finishing' },
            },
            current.version,
          ))
        )
          return err(listsErrors.conflict);
        current = await deps.lists.get(id);
        if (current === null) return err(listsErrors.notFound);
      }
      if (!matches(current.value, input)) return err(listsErrors.conflict);
      if (await deps.lists.hasEntryWrites(id)) return err(listsErrors.deletionBusy);
      // The entry's own history is deleted with it; retain no entry ID, title or explanation.
      const recorded = appendListActivity(
        {
          ...current.value,
          entryDeletion: null,
          settingsVersion: (current.value.settingsVersion ?? 0) + 1,
        },
        'entry-deleted',
        admin.value,
        deps.clock.now(),
      );
      return (await deps.lists.save(recorded, current.version))
        ? ok(undefined)
        : err(listsErrors.conflict);
    });
  };
