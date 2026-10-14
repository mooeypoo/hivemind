import type { Store } from '@netlify/blobs';
import type { IdGenerator } from '../../shared/kernel/index.ts';
import { makeAvailableSources } from './application/available-sources.ts';
import { makeCheckSource } from './application/check-source.ts';
import { makeImportPreset } from './application/import-preset.ts';
import type { ItemSources } from './application/ports.ts';
import { makeResolve } from './application/resolve.ts';
import { makeSearch } from './application/search.ts';
import { makeSeedItems } from './application/seed-items.ts';
import { makeExportPreset, makeRestorePreset } from './application/preset-backup.ts';
import { snapshotRetentionDays } from './domain/retention.ts';
import { createBlobsPresetRepository } from './infrastructure/blobs-preset-repository.ts';
import { createFreeformSource } from './infrastructure/freeform-source.ts';
import { createPresetSource } from './infrastructure/preset-source.ts';
import { createTmdbMovieSource } from './infrastructure/tmdb-movie-source.ts';
import { createTvdbSeriesSource } from './infrastructure/tvdb-series-source.ts';

export interface CatalogModuleDeps {
  /** The `catalog` Blobs store. */
  readonly store: Store;
  readonly ids: IdGenerator;
  /** Without a token, the `tmdb-movie` source is not offered. */
  readonly tmdbReadToken: string | null;
  readonly tvdbReadToken: string | null;
  readonly fetch?: typeof fetch;
}

export const createCatalogModule = (deps: CatalogModuleDeps) => {
  const presets = createBlobsPresetRepository(deps.store);
  const sources: ItemSources = {
    ...(deps.tmdbReadToken === null
      ? {}
      : { 'tmdb-movie': createTmdbMovieSource(deps.tmdbReadToken, deps.fetch) }),
    ...(deps.tvdbReadToken === null
      ? {}
      : { 'tvdb-series': createTvdbSeriesSource(deps.tvdbReadToken, deps.fetch) }),
    freeform: createFreeformSource(),
    preset: createPresetSource(presets),
  };

  return {
    importPreset: makeImportPreset({ presets, ids: deps.ids }),
    availableSources: makeAvailableSources({ sources }),
    search: makeSearch({ sources }),
    resolve: makeResolve({ sources }),
    checkSource: makeCheckSource({ sources, presets }),
    seedItems: makeSeedItems({ presets }),
    snapshotRetentionDays,
    /** Backup services. */
    exportPreset: makeExportPreset({ presets }),
    restorePreset: makeRestorePreset({ presets, ids: deps.ids }),
  };
};

export type CatalogModule = ReturnType<typeof createCatalogModule>;
