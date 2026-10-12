import type { Store } from '@netlify/blobs';
import type { Clock, IdGenerator } from '../../shared/kernel/index.ts';
import { makeArchiveList } from './application/archive-list.ts';
import { makeCloseVoting, makeSetVisibility } from './application/close-voting.ts';
import { makeSetScoreVisibility } from './application/score-visibility.ts';
import { makeCreateList } from './application/create-list.ts';
import { makeEditList } from './application/edit-list.ts';
import { makeGetList, makeGetSharePreview } from './application/get-list.ts';
import { makeListLists } from './application/list-lists.ts';
import { makeNominate } from './application/nominate.ts';
import { makeWithdrawNomination } from './application/withdraw-nomination.ts';
import { makeListsPersonalData } from './application/personal-data.ts';
import { makeScheduleList } from './application/schedule-list.ts';
import { makeSearchForList } from './application/search-for-list.ts';
import { makeEntryExists, makeRulesForVoting } from './application/voting-rules.ts';
import { makeEntriesForRanking, makeRankingContext } from './application/ranking-services.ts';
import { makePurgeExpiredSnapshots } from './application/purge-expired-snapshots.ts';
import { makeExportForBackup, makeRestoreFromBackup } from './application/backup.ts';
import {
  createBlobsEntryRepository,
  createBlobsLedgerRepository,
  createBlobsListRepository,
  createBlobsSlugIndex,
} from './infrastructure/blobs-lists-repositories.ts';
import { createCatalogReader, type CatalogApi } from './infrastructure/catalog-reader.ts';

export interface ListsModuleDeps {
  /** The `lists` Blobs store. */
  readonly store: Store;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The catalog module's public interface (upstream). */
  readonly catalog: CatalogApi;
}

export const createListsModule = (deps: ListsModuleDeps) => {
  const repositories = {
    lists: createBlobsListRepository(deps.store),
    slugs: createBlobsSlugIndex(deps.store),
    entries: createBlobsEntryRepository(deps.store),
    ledgers: createBlobsLedgerRepository(deps.store),
  };
  const shared = {
    ...repositories,
    catalog: createCatalogReader(deps.catalog),
    clock: deps.clock,
  };

  return {
    createList: makeCreateList({ ...shared, ids: deps.ids }),
    editList: makeEditList(shared),
    scheduleList: makeScheduleList(shared),
    archiveList: makeArchiveList(shared),
    closeVoting: makeCloseVoting(shared),
    setVisibility: makeSetVisibility(shared),
    setScoreVisibility: makeSetScoreVisibility(shared),
    listLists: makeListLists(shared),
    getList: makeGetList(shared),
    getSharePreview: makeGetSharePreview(shared),
    searchForList: makeSearchForList(shared),
    nominate: makeNominate({ ...shared, ids: deps.ids }),
    withdrawNomination: makeWithdrawNomination(shared),
    personalData: makeListsPersonalData(repositories),
    // Services for downstream contexts (voting, ranking).
    rulesForVoting: makeRulesForVoting(shared),
    entryExists: makeEntryExists(repositories),
    rankingContext: makeRankingContext(shared),
    entriesForRanking: makeEntriesForRanking(repositories),
    /** Scheduled job (TMDB retention); never from a request. */
    purgeExpiredSnapshots: makePurgeExpiredSnapshots(shared),
    /** Backup services; the backup context authorizes the Admin. */
    exportForBackup: makeExportForBackup(repositories),
    restoreFromBackup: makeRestoreFromBackup({ ...repositories, ids: deps.ids, clock: deps.clock }),
  };
};

export type ListsModule = ReturnType<typeof createListsModule>;
