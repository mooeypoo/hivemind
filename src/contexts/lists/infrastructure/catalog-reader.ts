import type {
  CatalogModule,
  ItemSourceRef as CatalogSourceRef,
  PresetId,
} from '../../catalog/index.ts';
import { domainError, err, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { Catalog } from '../application/ports.ts';
import type { ItemSourceRef } from '../domain/list.ts';

/** What lists needs from the catalog module's public interface. */
export type CatalogApi = Pick<
  CatalogModule,
  'checkSource' | 'search' | 'resolve' | 'seedItems' | 'snapshotRetentionDays'
>;

const unknownSource = (): Promise<Result<never, DomainError>> =>
  Promise.resolve(
    err(
      domainError(
        'invalid',
        'catalog.source-unavailable',
        'This item source is not available on this site.',
      ),
    ),
  );

/** Lists keep the source reference opaque; here it becomes the catalog's typed reference. */
const toCatalogRef = (ref: ItemSourceRef): CatalogSourceRef | null => {
  if (
    ref.kind === 'tmdb-movie' ||
    ref.kind === 'tvdb-series' ||
    ref.kind === 'igdb-game' ||
    ref.kind === 'freeform'
  )
    return { kind: ref.kind };
  if (ref.kind === 'preset' && ref.presetId !== undefined) {
    return { kind: 'preset', presetId: ref.presetId as PresetId };
  }
  return null;
};

export const createCatalogReader = (catalog: CatalogApi): Catalog => ({
  checkSource(ref, options) {
    const catalogRef = toCatalogRef(ref);
    return catalogRef === null ? unknownSource() : catalog.checkSource(catalogRef, options);
  },
  search(ref, query) {
    const catalogRef = toCatalogRef(ref);
    return catalogRef === null ? unknownSource() : catalog.search(catalogRef, query);
  },
  resolve(ref, key) {
    const catalogRef = toCatalogRef(ref);
    return catalogRef === null ? unknownSource() : catalog.resolve(catalogRef, key);
  },
  snapshotRetentionDays: (source) => catalog.snapshotRetentionDays(source),
  seedItems(ref) {
    const catalogRef = toCatalogRef(ref);
    return catalogRef === null ? unknownSource() : catalog.seedItems(catalogRef);
  },
});
