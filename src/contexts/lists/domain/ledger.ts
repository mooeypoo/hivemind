import {
  err,
  ok,
  type DomainError,
  type MemberId,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { EntryId } from './entry.ts';
import { listsErrors } from './errors.ts';
import type { ListId } from './list.ts';

/** A member's nominations in one list. Enforces the per-member cap. */
export interface NominationLedger {
  readonly memberId: MemberId;
  readonly listId: ListId;
  readonly entryIds: readonly EntryId[];
}

export const emptyLedger = (memberId: MemberId, listId: ListId): NominationLedger => ({
  memberId,
  listId,
  entryIds: [],
});

export const reserve = (
  ledger: NominationLedger,
  entryId: EntryId,
  cap: number,
): Result<NominationLedger, DomainError> =>
  ledger.entryIds.length >= cap
    ? err(listsErrors.nominationCapReached)
    : ok({ ...ledger, entryIds: [...ledger.entryIds, entryId] });

export const release = (ledger: NominationLedger, entryId: EntryId): NominationLedger => ({
  ...ledger,
  entryIds: ledger.entryIds.filter((id) => id !== entryId),
});
