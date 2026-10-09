import {
  ok,
  requireMember,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { BallotRepository, ListReader } from './ports.ts';

export interface PublicScore {
  readonly displayName: string;
  readonly score: number;
}

export type PublicScores =
  | { readonly visible: false }
  | { readonly visible: true; readonly entries: Readonly<Record<string, readonly PublicScore[]>> };

/**
 * Who gave what, for lists whose scores are public, once their results are visible.
 * Private lists never reach this: their ballots stay private (AGENTS.md).
 */
export const makeGetPublicScores =
  (deps: { readonly lists: ListReader; readonly ballots: BallotRepository }) =>
  async (
    actor: Actor,
    input: { readonly list: string },
  ): Promise<Result<PublicScores, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const rules = await deps.lists.rulesFor(input.list, member.value);
    if (!rules.ok) return rules;
    if (!rules.value.scoresPublic) return ok({ visible: false });

    const entries: Record<string, PublicScore[]> = {};
    for (const ballot of await deps.ballots.forList(rules.value.listId)) {
      for (const [entryId, score] of Object.entries(ballot.scores)) {
        (entries[entryId] ??= []).push({ displayName: ballot.voterName ?? 'A member', score });
      }
    }
    for (const scores of Object.values(entries)) {
      scores.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
    }
    return ok({ visible: true, entries });
  };
