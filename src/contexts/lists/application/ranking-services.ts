import { err, ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { EntryId, ItemSnapshot } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import type { ListId, ResultsVisibility } from '../domain/list.ts';
import type { EntryRepository, ListRepository, SlugIndex } from './ports.ts';

export interface RankingContextView {
  readonly listId: ListId;
  readonly resultsVisibility: ResultsVisibility;
  readonly closesAt: Date | null;
  readonly strategy: string;
  readonly minVotes: number;
  readonly entryIds: readonly EntryId[];
}

/**
 * What ranking needs to decide whether to show or rebuild a leaderboard. A service for
 * other contexts; the calling use case authorizes. Drafts are not found.
 */
export const makeRankingContext =
  (deps: {
    readonly lists: ListRepository;
    readonly slugs: SlugIndex;
    readonly entries: EntryRepository;
  }) =>
  async (idOrSlug: string): Promise<Result<RankingContextView, DomainError>> => {
    const byId = await deps.lists.get(idOrSlug as ListId);
    const id = byId === null ? await deps.slugs.lookup(idOrSlug) : null;
    const found = byId ?? (id === null ? null : await deps.lists.get(id));
    if (found === null || found.value.phase === 'draft') return err(listsErrors.notFound);
    const list = found.value;
    return ok({
      listId: list.id,
      resultsVisibility: list.config.resultsVisibility,
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
    (await deps.entries.forList(listId)).map((entry) => ({ id: entry.id, item: entry.item }));
