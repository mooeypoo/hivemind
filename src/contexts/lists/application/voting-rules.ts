import {
  err,
  ok,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { EntryId } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { lifecycleOf, visibleTo, type ListId, type Scale } from '../domain/list.ts';
import type { RoleId } from '../../../shared/kernel/index.ts';
import type { EntryRepository, ListRepository, SlugIndex } from './ports.ts';

export interface VotingRules {
  readonly listId: ListId;
  /** Scores can be set or cleared only while the list is open. */
  readonly isOpen: boolean;
  readonly scale: Scale;
  readonly requiredRoleIds: readonly RoleId[];
}

/**
 * What voting needs to know about a list. A service for other contexts: the calling
 * use case authorizes. Drafts and hidden lists are not found unless the viewer is an Admin.
 */
export const makeRulesForVoting =
  (deps: { readonly lists: ListRepository; readonly slugs: SlugIndex; readonly clock: Clock }) =>
  async (
    idOrSlug: string,
    viewer: { readonly isAdmin: boolean },
  ): Promise<Result<VotingRules, DomainError>> => {
    const byId = await deps.lists.get(idOrSlug as ListId);
    const id = byId === null ? await deps.slugs.lookup(idOrSlug) : null;
    const found = byId ?? (id === null ? null : await deps.lists.get(id));
    if (found === null || !visibleTo(found.value, viewer.isAdmin)) return err(listsErrors.notFound);
    const list = found.value;
    return ok({
      listId: list.id,
      isOpen: lifecycleOf(list, deps.clock.now()) === 'open',
      scale: list.config.scale,
      requiredRoleIds: list.config.requiredRoleIds,
    });
  };

/** Whether an entry exists in a list. A service for other contexts. */
export const makeEntryExists =
  (deps: { readonly entries: EntryRepository }) =>
  async (listId: ListId, entryId: EntryId): Promise<boolean> =>
    (await deps.entries.get(listId, entryId)) !== null;
