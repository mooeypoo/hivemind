import type { BallotId } from '../domain/ballot.ts';
export interface ListReader {
  exists(id: BallotId): boolean;
}
