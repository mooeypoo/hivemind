import { ok, type MemberId } from '../../../shared/kernel/index.ts';
import type { Ballot, BallotListId } from '../domain/ballot.ts';
import type { BallotRepository, ListReader } from './ports.ts';

/**
 * Seals ballots so a backup file never shows anyone's scores. Implemented in infrastructure
 * with `BACKUP_KEY`; absent when backups aren't configured.
 */
export interface BallotSealer {
  seal(data: unknown): string;
  /** Null for data sealed with another key, or altered. */
  open(sealed: string): unknown;
}

interface SealedBallotsV1 {
  readonly v: 1;
  readonly ballots: readonly {
    readonly memberId: string;
    readonly scores: Readonly<Record<string, number>>;
    readonly voterName?: string | null;
  }[];
}

/** A list's ballots, sealed; null when backups are off or nobody has voted. */
export const makeExportBallots =
  (deps: { readonly ballots: BallotRepository; readonly sealer: BallotSealer | null }) =>
  async (listId: string): Promise<string | null> => {
    if (deps.sealer === null) return null;
    const ballots = await deps.ballots.forList(listId as BallotListId);
    if (ballots.length === 0) return null;
    const payload: SealedBallotsV1 = {
      v: 1,
      ballots: ballots.map(({ memberId, scores, voterName }) => ({ memberId, scores, voterName })),
    };
    return deps.sealer.seal(payload);
  };

export interface BallotsRestored {
  readonly restored: number;
  readonly membersLeftOut: readonly string[];
  /** The ballots couldn't be opened: another key, or the file was altered. */
  readonly unreadable: boolean;
}

export const makeGuardedRestoreBallots = (deps: {
  readonly ballots: BallotRepository;
  readonly sealer: BallotSealer | null;
  readonly lists: ListReader;
}) => {
  const restore = makeRestoreBallots(deps);
  return (listId: string, sealed: string, keepMember: (memberId: string) => Promise<boolean>) =>
    deps.lists.withWrite(listId, async () => ok(await restore(listId, sealed, keepMember)));
};

/** Opens sealed ballots and restores those of members `keepMember` accepts, into `listId`. */
export const makeRestoreBallots =
  (deps: { readonly ballots: BallotRepository; readonly sealer: BallotSealer | null }) =>
  async (
    listId: string,
    sealed: string,
    keepMember: (memberId: string) => Promise<boolean>,
  ): Promise<BallotsRestored> => {
    const opened = deps.sealer?.open(sealed) as Partial<SealedBallotsV1> | null | undefined;
    if (opened?.v !== 1 || !Array.isArray(opened.ballots)) {
      return { restored: 0, membersLeftOut: [], unreadable: true };
    }
    let restored = 0;
    const membersLeftOut: string[] = [];
    for (const saved of opened.ballots as unknown[]) {
      // The file came from outside: check each ballot's shape before using it.
      const candidate = saved as {
        memberId?: unknown;
        scores?: unknown;
        voterName?: unknown;
      } | null;
      if (
        typeof candidate?.memberId !== 'string' ||
        typeof candidate.scores !== 'object' ||
        candidate.scores === null
      ) {
        continue;
      }
      if (!(await keepMember(candidate.memberId))) {
        membersLeftOut.push(candidate.memberId);
        continue;
      }
      const ballot: Ballot = {
        listId: listId as BallotListId,
        memberId: candidate.memberId as MemberId,
        voterName: typeof candidate.voterName === 'string' ? candidate.voterName : null,
        scores: Object.fromEntries(
          Object.entries(candidate.scores).filter((pair): pair is [string, number] =>
            Number.isInteger(pair[1]),
          ),
        ),
      };
      if (await deps.ballots.save(ballot, null)) restored += 1;
    }
    return { restored, membersLeftOut, unreadable: false };
  };
