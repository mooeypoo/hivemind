import type { DomainError, Result } from '../../../shared/kernel/index.ts';
import type { CatalogItem, ItemSourceRef } from '../domain/catalog-item.ts';
import type { ItemSources } from './ports.ts';
import { sourceFor } from './source-for.ts';

/**
 * Validates an item against its source and returns its current details, ready to snapshot.
 * A service for other contexts; the calling use case authorizes.
 */
export const makeResolve =
  (deps: { readonly sources: ItemSources }) =>
  async (ref: ItemSourceRef, key: string): Promise<Result<CatalogItem, DomainError>> => {
    const source = sourceFor(deps.sources, ref);
    if (!source.ok) return source;
    return source.value.resolve(ref, key);
  };
