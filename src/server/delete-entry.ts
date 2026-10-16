import type { ListsModule } from '../contexts/lists/index.ts';
import type { VotingModule } from '../contexts/voting/index.ts';
import type { RankingModule } from '../contexts/ranking/index.ts';
import {
  requireAdmin,
  ok,
  type Actor,
  type DomainError,
  type Result,
} from '../shared/kernel/index.ts';

export const makeDeleteEntry =
  (deps: {
    readonly lists: Pick<
      ListsModule,
      'prepareEntryDeletion' | 'withEntryDeletion' | 'finishEntryDeletion'
    >;
    readonly voting: Pick<VotingModule, 'deleteEntryScores'>;
    readonly ranking: Pick<RankingModule, 'deleteListData'>;
  }) =>
  async (
    actor: Actor,
    input: {
      readonly listId: string;
      readonly entryId: string;
      readonly token: string;
      readonly confirmation: string;
    },
  ): Promise<Result<void, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const prepared = await deps.lists.prepareEntryDeletion(actor, input);
    if (!prepared.ok) return prepared;
    if (prepared.value === null) return ok(undefined);
    if (prepared.value === 'cleaning') {
      const cleaned = await deps.lists.withEntryDeletion(actor, input, async () => {
        const scores = await deps.voting.deleteEntryScores(actor, input);
        if (!scores.ok) return scores;
        return deps.ranking.deleteListData(actor, input);
      });
      if (!cleaned.ok) return cleaned;
    }
    return deps.lists.finishEntryDeletion(actor, input);
  };
