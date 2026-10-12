import {
  domainError,
  err,
  ok,
  requireMember,
  withConflictRetry,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { isActiveEntry, nominationToken, type EntryId } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { nominationsOpen } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { NominateDeps } from './nominate.ts';

export const makeWithdrawNomination =
  (deps: Pick<NominateDeps, 'lists' | 'slugs' | 'entries' | 'clock'>) =>
  async (
    actor: Actor,
    input: { readonly list: string; readonly entryId: string; readonly token: string },
  ): Promise<Result<void, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    return withConflictRetry(async () => {
      const found = await findList(deps, member.value, input.list);
      if (!found.ok) return found;
      if (!nominationsOpen(found.value.value, deps.clock.now()))
        return err(listsErrors.nominationsClosed);
      const entry = await deps.entries.get(found.value.value.id, input.entryId as EntryId);
      if (entry === null)
        return err(domainError('not-found', 'lists.entry-not-found', 'That entry does not exist.'));
      if (nominationToken(entry.value) !== input.token) return err(listsErrors.conflict);
      if (!isActiveEntry(entry.value)) return ok(undefined);
      if (entry.value.nominatedBy?.memberId !== member.value.memberId) {
        return err(
          domainError(
            'forbidden',
            'lists.not-your-nomination',
            'You can only withdraw your own nomination.',
          ),
        );
      }
      return (await deps.entries.save(
        {
          ...entry.value,
          withdrawnAt: deps.clock.now(),
          nominatedBy: null,
          withdrawnNominationIds: [
            ...(entry.value.withdrawnNominationIds ?? []),
            nominationToken(entry.value),
          ],
        },
        entry.version,
      ))
        ? ok(undefined)
        : err(listsErrors.conflict);
    });
  };
