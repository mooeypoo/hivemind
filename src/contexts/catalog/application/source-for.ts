import { err, ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { ItemSourceRef } from '../domain/catalog-item.ts';
import { catalogErrors } from '../domain/errors.ts';
import type { ItemSource, ItemSources } from './ports.ts';

export const sourceFor = (
  sources: ItemSources,
  ref: ItemSourceRef,
): Result<ItemSource, DomainError> => {
  const source = sources[ref.kind];
  return source === undefined ? err(catalogErrors.sourceUnavailable) : ok(source);
};
