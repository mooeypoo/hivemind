import {
  err,
  ok,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { isActiveEntry, type EntryId, type ItemSnapshot } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { lifecycleOf, visibleTo, type ListId, type ResultsVisibility } from '../domain/list.ts';
import type { EntryRepository, ListRepository, SlugIndex } from './ports.ts';

export interface RankingContextView {
  readonly listId: ListId;
  readonly resultsVisibility: ResultsVisibility;
  /** Voting has ended: closed, or archived. Final results may be shown. */
  readonly votingEnded: boolean;
  /** When voting is due to end, if it has an end date. */
  readonly closesAt: Date | null;
  readonly strategy: string;
  readonly minVotes: number;
  readonly entryIds: readonly EntryId[];
}

/**
 * What ranking needs to decide whether to show or rebuild a leaderboard. A service for
 * other contexts; the calling use case authorizes. Drafts and hidden lists are not found unless
 * the viewer is an Admin.
 */
export const makeRankingContext =
  (deps: {
    readonly lists: ListRepository;
    readonly slugs: SlugIndex;
    readonly entries: EntryRepository;
    readonly clock: Clock;
  }) =>
  async (
    idOrSlug: string,
    viewer: { readonly isAdmin: boolean },
  ): Promise<Result<RankingContextView, DomainError>> => {
    const byId = await deps.lists.get(idOrSlug as ListId);
    const id = byId === null ? await deps.slugs.lookup(idOrSlug) : null;
    const found = byId ?? (id === null ? null : await deps.lists.get(id));
    if (found === null || !visibleTo(found.value, viewer.isAdmin)) return err(listsErrors.notFound);
    const list = found.value;
    if (list.deletionRequested === true) return err(listsErrors.deleting);
    return ok({
      listId: list.id,
      resultsVisibility: list.config.resultsVisibility,
      votingEnded: ['closed', 'archived'].includes(lifecycleOf(list, deps.clock.now())),
      closesAt: list.schedule?.closesAt ?? null,
      strategy: list.config.ranking.strategy,
      minVotes: list.config.ranking.minVotes,
      entryIds: await deps.entries.idsForList(list.id),
    });
  };

/** Every entry with its snapshot, for building a leaderboard. */
export const makeEntriesForRanking =
  (deps: { readonly entries: EntryRepository }) =>
  async (listId: ListId): Promise<{ readonly id: EntryId; readonly item: ItemSnapshot }[]> =>
    (await deps.entries.forList(listId))
      .filter(isActiveEntry)
      .map((entry) => ({ id: entry.id, item: entry.item }));
