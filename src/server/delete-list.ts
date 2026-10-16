import type { ListsModule } from '../contexts/lists/index.ts';
import type { VotingModule } from '../contexts/voting/index.ts';
import type { RankingModule } from '../contexts/ranking/index.ts';
import {
  ok,
  requireAdmin,
  type Actor,
  type DomainError,
  type Result,
} from '../shared/kernel/index.ts';

/** Cross-context cleanup uses public services, never another context's store. */
export const makeDeleteList =
  (deps: {
    readonly lists: Pick<ListsModule, 'prepareListDeletion' | 'finishListDeletion'>;
    readonly voting: Pick<VotingModule, 'deleteListData'>;
    readonly ranking: Pick<RankingModule, 'deleteListData'>;
  }) =>
  async (
    actor: Actor,
    input: { readonly listId: string; readonly confirmation: string },
  ): Promise<Result<void, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const prepared = await deps.lists.prepareListDeletion(actor, input);
    if (!prepared.ok) return prepared;
    if (!prepared.value) return ok(undefined);
    const ballots = await deps.voting.deleteListData(actor, input);
    if (!ballots.ok) return ballots;
    const ranking = await deps.ranking.deleteListData(actor, input);
    if (!ranking.ok) return ranking;
    return deps.lists.finishListDeletion(actor, input);
  };
