import {
  err,
  ok,
  requireAdmin,
  withConflictRetry,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { clearScore, type BallotEntryId, type BallotListId } from '../domain/ballot.ts';
import { votingErrors } from '../domain/errors.ts';
import type { BallotRepository } from './ports.ts';

/** Called inside lists' exclusive deletion guard, after ordinary writers have drained. */
export const makeDeleteEntryScores =
  (deps: { readonly ballots: BallotRepository }) =>
  async (
    actor: Actor,
    input: { readonly listId: string; readonly entryId: string },
  ): Promise<Result<void, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const id = input.listId as BallotListId;
    for (const ballot of await deps.ballots.forList(id)) {
      if (ballot.scores[input.entryId] === undefined) continue;
      const changed = await withConflictRetry(async () => {
        const current = await deps.ballots.get(id, ballot.memberId);
        if (current?.ballot.scores[input.entryId] === undefined) return ok(undefined);
        return (await deps.ballots.save(
          clearScore(current.ballot, input.entryId as BallotEntryId),
          current.version,
        ))
          ? ok(undefined)
          : err(votingErrors.conflict);
      });
      if (!changed.ok) return changed;
    }
    return ok(undefined);
  };
