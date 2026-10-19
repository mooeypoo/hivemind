import {
  err,
  ok,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { isActiveEntry, type EntryId } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import {
  lifecycleOf,
  mayRate,
  mayView,
  type ListId,
  type Scale,
  type Viewer,
} from '../domain/list.ts';
import type { EntryRepository, ListRepository, SlugIndex } from './ports.ts';

export interface VotingRules {
  readonly writeRevision: string | null;
  readonly listId: ListId;
  /** Scores can be set or cleared only while the list is open. */
  readonly isOpen: boolean;
  readonly scale: Scale;
  /** Whether this viewer may set and clear scores here, list lifecycle aside. */
  readonly mayRate: boolean;
  /** The list's scores are public, and results (so public scores) may be shown right now. */
  readonly scoresPublic: boolean;
  /** The list's scores are public at all: voters' names are kept with their scores. */
  readonly namesWithScores: boolean;
}

/**
 * What voting needs to know about a list. A service for other contexts: the calling
 * use case authorizes. Lists the viewer may not view are not found.
 */
export const makeRulesForVoting =
  (deps: { readonly lists: ListRepository; readonly slugs: SlugIndex; readonly clock: Clock }) =>
  async (idOrSlug: string, viewer: Viewer): Promise<Result<VotingRules, DomainError>> => {
    const byId = await deps.lists.get(idOrSlug as ListId);
    const id = byId === null ? await deps.slugs.lookup(idOrSlug) : null;
    const found = byId ?? (id === null ? null : await deps.lists.get(id));
    if (found === null || !mayView(found.value, viewer)) return err(listsErrors.notFound);
    const list = found.value;
    if (list.deletionRequested === true) return err(listsErrors.deleting);
    if (list.entryDeletion != null) return err(listsErrors.entryDeletionBusy);
    const lifecycle = lifecycleOf(list, deps.clock.now());
    const publicScores = list.config.scoreVisibility === 'public';
    const resultsVisible =
      list.config.resultsVisibility === 'live' ||
      lifecycle === 'closed' ||
      lifecycle === 'archived';
    return ok({
      listId: list.id,
      writeRevision: list.entryDeletionRevision ?? null,
      isOpen: lifecycle === 'open',
      scoresPublic: publicScores && resultsVisible,
      namesWithScores: publicScores,
      scale: list.config.scale,
      mayRate: mayRate(list, viewer),
    });
  };

/** Whether an entry exists in a list. A service for other contexts. */
export const makeEntryExists =
  (deps: { readonly entries: EntryRepository }) =>
  async (listId: ListId, entryId: EntryId): Promise<boolean> => {
    const entry = await deps.entries.get(listId, entryId);
    return entry !== null && isActiveEntry(entry.value);
  };
