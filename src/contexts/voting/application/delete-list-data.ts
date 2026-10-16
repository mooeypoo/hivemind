import {
  ok,
  requireAdmin,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { BallotListId } from '../domain/ballot.ts';
import type { BallotRepository } from './ports.ts';

/** The deletion coordinator has already blocked and drained this list's writers. */
export const makeDeleteListData =
  (deps: { readonly ballots: BallotRepository }) =>
  async (actor: Actor, input: { readonly listId: string }): Promise<Result<void, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const id = input.listId as BallotListId;
    for (const ballot of await deps.ballots.forList(id)) {
      await deps.ballots.delete(id, ballot.memberId);
    }
    return ok(undefined);
  };
