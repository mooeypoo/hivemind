import type { CatalogModule } from '../../catalog/index.ts';
import type { IdentityModule } from '../../identity/index.ts';
import type { ListBackup, ListsModule } from '../../lists/index.ts';
import type { VotingModule } from '../../voting/index.ts';
import type {
  BallotsBackup,
  ErasureCheck,
  ListsBackup,
  PresetsBackup,
} from '../application/ports.ts';

/** What backup needs from each upstream module's public interface. */
export type ListsApi = Pick<ListsModule, 'exportForBackup' | 'restoreFromBackup'>;
export type CatalogApi = Pick<CatalogModule, 'exportPreset' | 'restorePreset'>;
export type VotingApi = Pick<VotingModule, 'exportBallots' | 'restoreBallots'>;
export type IdentityApi = Pick<IdentityModule, 'wasErased'>;

/** The list part is the lists context's own format; backup passes it through unchanged. */
export const createListsBackup = (lists: ListsApi): ListsBackup => ({
  exportLists: async (ref) => {
    const result = await lists.exportForBackup(ref);
    return result.ok
      ? {
          ok: true,
          value: result.value.map(({ listId, backup }) => ({
            listId,
            backup,
          })),
        }
      : result;
  },
  restore: (backup, options) => lists.restoreFromBackup(backup as unknown as ListBackup, options),
});

export const createPresetsBackup = (catalog: CatalogApi): PresetsBackup => ({
  exportPreset: (presetId) => catalog.exportPreset(presetId),
  restorePreset: (rows) => catalog.restorePreset(rows),
});

export const createBallotsBackup = (voting: VotingApi): BallotsBackup => ({
  exportBallots: (listId) => voting.exportBallots(listId),
  restoreBallots: (listId, sealed, keep) => voting.restoreBallots(listId, sealed, keep),
});

export const createErasureCheck = (identity: IdentityApi): ErasureCheck => ({
  wasErased: (memberId) => identity.wasErased(memberId),
});
