import {
  ok,
  requireMember,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { emptyBallot } from '../domain/ballot.ts';
import type { BallotRepository, ListReader } from './ports.ts';
import { toMyBallot, type MyBallot } from './views.ts';

/** The caller's own ballot, on any visible list, open or not. Never anyone else's. */
export const makeGetMyBallot =
  (deps: { readonly lists: ListReader; readonly ballots: BallotRepository }) =>
  async (
    actor: Actor,
    input: { readonly list: string },
  ): Promise<Result<MyBallot, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const rules = await deps.lists.rulesFor(input.list, member.value);
    if (!rules.ok) return rules;
    const found = await deps.ballots.get(rules.value.listId, member.value.memberId);
    return ok(toMyBallot(found?.ballot ?? emptyBallot(rules.value.listId, member.value.memberId)));
  };
