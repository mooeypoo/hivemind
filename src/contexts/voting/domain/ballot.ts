import {
  domainError,
  err,
  ok,
  type Brand,
  type DomainError,
  type MemberId,
  type Result,
} from '../../../shared/kernel/index.ts';

/** Ids owned by lists; voting only carries them. */
export type BallotListId = Brand<string, 'ListId'>;
export type BallotEntryId = Brand<string, 'EntryId'>;

export interface Scale {
  readonly min: number;
  readonly max: number;
}

/** One member's scores in one list. Private: only its owner ever sees it. */
export interface Ballot {
  readonly listId: BallotListId;
  readonly memberId: MemberId;
  readonly scores: Readonly<Record<string, number>>;
}

export const emptyBallot = (listId: BallotListId, memberId: MemberId): Ballot => ({
  listId,
  memberId,
  scores: {},
});

export const scoreOutOfRange = (scale: Scale): DomainError =>
  domainError(
    'invalid',
    'voting.score-out-of-range',
    `A score must be a whole number from ${String(scale.min)} to ${String(scale.max)}.`,
  );

/** AGENTS.md: a score is an integer within the list's scale. */
export const setScore = (
  ballot: Ballot,
  entryId: BallotEntryId,
  score: number,
  scale: Scale,
): Result<Ballot, DomainError> =>
  Number.isInteger(score) && score >= scale.min && score <= scale.max
    ? ok({ ...ballot, scores: { ...ballot.scores, [entryId]: score } })
    : err(scoreOutOfRange(scale));

export const clearScore = (ballot: Ballot, entryId: BallotEntryId): Ballot => ({
  ...ballot,
  scores: Object.fromEntries(Object.entries(ballot.scores).filter(([id]) => id !== entryId)),
});
