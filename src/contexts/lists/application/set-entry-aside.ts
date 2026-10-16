import {
  domainError,
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
import {
  isActiveEntry,
  nominationToken,
  validateSetAsideReason,
  type EntryId,
} from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { findList } from './find-list.ts';
import { withEntryWrite } from './entry-write.ts';
import type { EntryRepository, ListRepository, SlugIndex } from './ports.ts';
import { toEntryView, type EntryView } from './views.ts';

interface Deps {
  readonly lists: ListRepository;
  readonly entries: EntryRepository;
  readonly slugs: SlugIndex;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export const makeSetEntryAside =
  (deps: Deps) =>
  async (
    actor: Actor,
    input: {
      readonly list: string;
      readonly entryId: string;
      readonly token: string;
      readonly expectedReason: string | null;
      readonly reason: string | null;
    },
  ): Promise<Result<EntryView, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const reason = validateSetAsideReason(input.reason);
    if (!reason.ok) return reason;
    const found = await findList(deps, admin.value, input.list);
    if (!found.ok) return found;
    return withEntryWrite(deps.lists, found.value.value, deps.ids.next(), async (current) => {
      if (current.value.phase === 'archived') {
        return err(domainError('conflict', 'lists.archived', 'Archived lists are read-only.'));
      }
      return withConflictRetry(async () => {
        const entry = await deps.entries.get(current.value.id, input.entryId as EntryId);
        if (entry === null || !isActiveEntry(entry.value)) {
          return err(
            domainError('not-found', 'lists.entry-not-found', 'That entry does not exist.'),
          );
        }
        if (
          nominationToken(entry.value) !== input.token ||
          (entry.value.setAsideReason ?? null) !== input.expectedReason
        ) {
          return err(
            domainError(
              'conflict',
              'lists.set-aside-changed',
              'This entry changed. Reload the list before editing its set-aside status.',
            ),
          );
        }
        const updated = { ...entry.value, setAsideReason: reason.value };
        if (!(await deps.entries.save(updated, entry.version))) return err(listsErrors.conflict);
        return ok(toEntryView(updated, current.value, admin.value, deps.clock.now()));
      });
    });
  };
