import { ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { CatalogItem, ItemSourceRef } from '../domain/catalog-item.ts';
import type { ItemSources } from './ports.ts';
import { sourceFor } from './source-for.ts';

export const MAX_QUERY_LENGTH = 100;

/**
 * Searches one source. A service for other contexts: the calling use case
 * (e.g. lists' search for a list) has already authorized the Actor.
 */
export const makeSearch =
  (deps: { readonly sources: ItemSources }) =>
  async (
    ref: ItemSourceRef,
    query: string,
  ): Promise<Result<readonly CatalogItem[], DomainError>> => {
    const source = sourceFor(deps.sources, ref);
    if (!source.ok) return source;
    const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (trimmed === '') return ok([]);
    return source.value.search(ref, trimmed);
  };
