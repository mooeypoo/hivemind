import {
  err,
  ok,
  requireAdmin,
  type Actor,
  type Clock,
  type DomainError,
  type MemberId,
  type Result,
} from '../../../shared/kernel/index.ts';
import { isActiveEntry } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { lifecycleOf, type Lifecycle, type Visibility } from '../domain/list.ts';
import type { EntryRepository, ListRepository } from './ports.ts';

interface ListSummary {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly lifecycle: Lifecycle;
  readonly visibility: Visibility;
  readonly source: string;
  readonly entryMode: 'nominations' | 'seeded';
}

export type ParticipationList = ListSummary &
  (
    | { readonly status: 'after-close'; readonly revealsAt: string | null }
    | { readonly status: 'paused' }
    | {
        readonly status: 'available';
        readonly entries: number;
        readonly withdrawnEntries: number;
        readonly setAsideEntries: number;
        readonly nominators: number;
        readonly minVotes: number;
        readonly activeEntryIds: readonly string[];
      }
  );

/** Identities stay in lists; even cross-list deduplication returns only a count. */
export const makeParticipationScope =
  (deps: {
    readonly lists: ListRepository;
    readonly entries: EntryRepository;
    readonly clock: Clock;
  }) =>
  async (
    actor: Actor,
    input: { readonly list?: string },
  ): Promise<
    Result<
      { readonly lists: readonly ParticipationList[]; readonly nominators: number },
      DomainError
    >
  > => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const all = await deps.lists.all();
    const match =
      all.find((list) => list.id === input.list) ??
      all.find((list) => list.config.slug === input.list);
    if (input.list !== undefined && match === undefined) return err(listsErrors.notFound);
    const selected = (input.list === undefined ? all : match === undefined ? [] : [match]).sort(
      (a, b) => a.config.title.localeCompare(b.config.title) || a.id.localeCompare(b.id),
    );
    const nominators = new Set<MemberId>();
    const summaries: ParticipationList[] = [];
    const now = deps.clock.now();
    for (let offset = 0; offset < selected.length; offset += 4) {
      const batch = await Promise.all(
        selected.slice(offset, offset + 4).map(async (list): Promise<ParticipationList> => {
          const lifecycle = lifecycleOf(list, now);
          const base: ListSummary = {
            id: list.id,
            title: list.config.title,
            slug: list.config.slug,
            lifecycle,
            visibility: list.visibility,
            source: list.config.itemSource.kind,
            entryMode: list.config.entryMode,
          };
          if (list.deletionRequested === true || list.entryDeletion != null)
            return { ...base, status: 'paused' };
          if (
            list.config.resultsVisibility === 'after-close' &&
            lifecycle !== 'closed' &&
            lifecycle !== 'archived'
          )
            return {
              ...base,
              status: 'after-close',
              revealsAt: list.schedule?.closesAt?.toISOString() ?? null,
            };
          const stored = await deps.entries.forList(list.id);
          const active = stored.filter(isActiveEntry);
          const members = new Set(
            active.flatMap((entry) =>
              list.config.entryMode === 'nominations' && entry.nominatedBy !== null
                ? [entry.nominatedBy.memberId]
                : [],
            ),
          );
          for (const member of members) nominators.add(member);
          return {
            ...base,
            status: 'available',
            entries: active.length,
            withdrawnEntries: stored.length - active.length,
            setAsideEntries: active.filter((entry) => entry.setAsideReason != null).length,
            nominators: members.size,
            minVotes: list.config.ranking.minVotes,
            activeEntryIds: active.map((entry) => entry.id),
          };
        }),
      );
      summaries.push(...batch);
    }
    return ok({ lists: summaries, nominators: nominators.size });
  };
