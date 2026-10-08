import { err, ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { CatalogItem, ItemSourceRef } from '../domain/catalog-item.ts';
import { catalogErrors } from '../domain/errors.ts';
import type { PresetRepository } from './ports.ts';

/** Sources whose whole contents can become a list's entries up front. Today: presets. */
export const canSeed = (ref: ItemSourceRef): boolean => ref.kind === 'preset';

/** Every item a seeded list starts with. A service for other contexts. */
export const makeSeedItems =
  (deps: { readonly presets: PresetRepository }) =>
  async (ref: ItemSourceRef): Promise<Result<readonly CatalogItem[], DomainError>> => {
    if (ref.kind !== 'preset') return err(catalogErrors.cannotSeed);
    const preset = await deps.presets.get(ref.presetId);
    return preset === null ? err(catalogErrors.presetNotFound) : ok(preset.items);
  };
