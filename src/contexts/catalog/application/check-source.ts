import { err, ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { ItemSourceRef } from '../domain/catalog-item.ts';
import { catalogErrors } from '../domain/errors.ts';
import type { ItemSources, PresetRepository } from './ports.ts';
import { canSeed } from './seed-items.ts';
import { sourceFor } from './source-for.ts';

/**
 * Whether a list may use this source: it is offered on this site, a referenced preset
 * exists, and, for a seeded list, the source can seed.
 */
export const makeCheckSource =
  (deps: { readonly sources: ItemSources; readonly presets: PresetRepository }) =>
  async (
    ref: ItemSourceRef,
    options: { readonly seeded: boolean },
  ): Promise<Result<void, DomainError>> => {
    const source = sourceFor(deps.sources, ref);
    if (!source.ok) return source;
    if (options.seeded && !canSeed(ref)) return err(catalogErrors.cannotSeed);
    if (ref.kind === 'preset' && (await deps.presets.get(ref.presetId)) === null) {
      return err(catalogErrors.presetNotFound);
    }
    return ok(undefined);
  };
