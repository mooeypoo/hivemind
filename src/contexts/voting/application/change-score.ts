import {
  err,
  ok,
  withConflictRetry,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { clearScore, emptyBallot, setScore, type BallotEntryId } from '../domain/ballot.ts';
import { votingErrors } from '../domain/errors.ts';
import { mayVote } from './participation.ts';
import type { BallotRepository, ListReader } from './ports.ts';
import { toMyBallot, type MyBallot } from './views.ts';

export interface ChangeScoreDeps {
  readonly lists: ListReader;
  readonly ballots: BallotRepository;
}

export interface ChangeScoreInput {
  readonly revision?: string | null;
  readonly list: string;
  readonly entryId: string;
  /** Null clears the score. */
  readonly score: number | null;
}

/**
 * Sets or clears one score on the caller's ballot. AGENTS.md: only while the list is open,
 * only for an existing entry, and a score within the list's scale.
 */
export const makeChangeScore =
  (deps: ChangeScoreDeps) =>
  async (actor: Actor, input: ChangeScoreInput): Promise<Result<MyBallot, DomainError>> => {
    const allowed = await mayVote(deps.lists, actor, input.list);
    if (!allowed.ok) return allowed;
    if ((input.revision ?? null) !== (allowed.value.rules.writeRevision ?? null)) {
      return err(votingErrors.listChanged);
    }
    return deps.lists.withWrite(
      allowed.value.rules.listId,
      async () => {
        const fresh = await mayVote(deps.lists, actor, input.list);
        if (!fresh.ok) return fresh;
        const { member, rules } = fresh.value;
        const entryId = input.entryId as BallotEntryId;
        if (!(await deps.lists.entryExists(rules.listId, entryId)))
          return err(votingErrors.unknownEntry);

        return withConflictRetry(async () => {
          const current = await deps.ballots.get(rules.listId, member.memberId);
          const existing = current?.ballot ?? emptyBallot(rules.listId, member.memberId);
          // Names are kept only where scores are public.
          const ballot = {
            ...existing,
            voterName: rules.namesWithScores ? member.displayName : null,
          };
          const changed =
            input.score === null
              ? ok(clearScore(ballot, entryId))
              : setScore(ballot, entryId, input.score, rules.scale);
          if (!changed.ok) return changed;
          return (await deps.ballots.save(changed.value, current?.version ?? null))
            ? ok(toMyBallot(changed.value))
            : err(votingErrors.conflict);
        });
      },
      allowed.value.rules.writeRevision ?? null,
    );
  };
