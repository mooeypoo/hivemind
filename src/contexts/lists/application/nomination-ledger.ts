import { isActiveEntry } from '../domain/entry.ts';
import { release, type NominationLedger } from '../domain/ledger.ts';
import type { EntryRepository } from './ports.ts';

export const activeLedger = async (
  entries: EntryRepository,
  ledger: NominationLedger,
): Promise<NominationLedger> => {
  let active = ledger;
  for (const entryId of ledger.entryIds) {
    const entry = await entries.get(ledger.listId, entryId);
    if (entry === null) continue;
    const claim = ledger.claims?.[entryId];
    if (claim !== undefined && entry.value.withdrawnNominationIds?.includes(claim)) {
      active = release(active, entryId);
      continue;
    }
    if (claim !== undefined && claim !== entry.value.nominationId) continue;
    if (!isActiveEntry(entry.value) || entry.value.nominatedBy?.memberId !== ledger.memberId) {
      active = release(active, entryId);
    }
  }
  return active;
};
