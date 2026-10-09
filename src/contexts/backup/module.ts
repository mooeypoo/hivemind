import type { Clock } from '../../shared/kernel/index.ts';
import { makeExportLists, makeImportLists } from './application/backups.ts';
import {
  createBallotsBackup,
  createErasureCheck,
  createListsBackup,
  createPresetsBackup,
  type CatalogApi,
  type IdentityApi,
  type ListsApi,
  type VotingApi,
} from './infrastructure/upstream.ts';

export interface BackupModuleDeps {
  /** Upstream modules' public interfaces. Backup is downstream of all of them. */
  readonly lists: ListsApi;
  readonly catalog: CatalogApi;
  readonly voting: VotingApi;
  readonly identity: IdentityApi;
  /** Identifies `BACKUP_KEY`; null when backups aren't configured. */
  readonly keyId: string | null;
  readonly clock: Clock;
}

export const createBackupModule = (deps: BackupModuleDeps) => {
  const backupDeps = {
    lists: createListsBackup(deps.lists),
    presets: createPresetsBackup(deps.catalog),
    ballots: createBallotsBackup(deps.voting),
    erasures: createErasureCheck(deps.identity),
    keyId: deps.keyId,
    clock: deps.clock,
  };
  return {
    exportLists: makeExportLists(backupDeps),
    importLists: makeImportLists(backupDeps),
  };
};

export type BackupModule = ReturnType<typeof createBackupModule>;
