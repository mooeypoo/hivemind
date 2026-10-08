import { err, ok } from '../../../shared/kernel/index.ts';
import type { ItemSource, PresetRepository } from '../application/ports.ts';
import { catalogErrors } from '../domain/errors.ts';
import { titleKey } from '../domain/title.ts';

const MAX_RESULTS = 20;

/** Items from an Admin's CSV preset. Search matches any part of the title or subtitle. */
export const createPresetSource = (presets: PresetRepository): ItemSource => ({
  async search(ref, query) {
    if (ref.kind !== 'preset') return err(catalogErrors.sourceUnavailable);
    const preset = await presets.get(ref.presetId);
    if (preset === null) return err(catalogErrors.presetNotFound);
    const needle = titleKey(query);
    return ok(
      preset.items
        .filter((item) => titleKey(`${item.title} ${item.subtitle ?? ''}`).includes(needle))
        .slice(0, MAX_RESULTS),
    );
  },

  async resolve(ref, externalId) {
    if (ref.kind !== 'preset') return err(catalogErrors.sourceUnavailable);
    const preset = await presets.get(ref.presetId);
    if (preset === null) return err(catalogErrors.presetNotFound);
    const item = preset.items.find((candidate) => candidate.externalId === externalId);
    return item === undefined ? err(catalogErrors.itemNotFound) : ok(item);
  },
});
