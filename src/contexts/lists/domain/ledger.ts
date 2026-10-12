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
  readonly claims?: Readonly<Record<string, string>>;
}

export const emptyLedger = (memberId: MemberId, listId: ListId): NominationLedger => ({
  memberId,
  listId,
  entryIds: [],
});

export const reserve = (
  ledger: NominationLedger,
  entryId: EntryId,
  /** Null: unlimited. */
  cap: number | null,
  claim?: string,
): Result<NominationLedger, DomainError> =>
  ledger.entryIds.includes(entryId)
    ? err(listsErrors.alreadyNominated)
    : cap !== null && ledger.entryIds.length >= cap
      ? err(listsErrors.nominationCapReached)
      : ok({
          ...ledger,
          entryIds: [...ledger.entryIds, entryId],
          claims: { ...ledger.claims, ...(claim === undefined ? {} : { [entryId]: claim }) },
        });

export const release = (
  ledger: NominationLedger,
  entryId: EntryId,
  claim?: string,
): NominationLedger => {
  if (claim !== undefined && ledger.claims?.[entryId] !== claim) return ledger;
  return {
    ...ledger,
    entryIds: ledger.entryIds.filter((id) => id !== entryId),
    claims: Object.fromEntries(
      Object.entries(ledger.claims ?? {}).filter(([id]) => id !== entryId),
    ),
  };
};
