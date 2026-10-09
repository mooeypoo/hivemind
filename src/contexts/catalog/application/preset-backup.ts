import {
  ok,
  type DomainError,
  type IdGenerator,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { PresetId } from '../domain/catalog-item.ts';
import { presetFromItems } from '../domain/preset.ts';
import type { PresetRepository } from './ports.ts';

export interface PresetRows {
  readonly items: readonly { readonly title: string; readonly subtitle: string | null }[];
}

/** A preset's rows for a backup, or null if it doesn't exist. A service for the backup context. */
export const makeExportPreset =
  (deps: { readonly presets: PresetRepository }) =>
  async (presetId: string): Promise<PresetRows | null> => {
    const preset = await deps.presets.get(presetId as PresetId);
    return preset === null
      ? null
      : { items: preset.items.map(({ title, subtitle }) => ({ title, subtitle })) };
  };

/** Restores a preset from a backup under a new id. Validated like an import. */
export const makeRestorePreset =
  (deps: { readonly presets: PresetRepository; readonly ids: IdGenerator }) =>
  async (rows: PresetRows): Promise<Result<PresetId, DomainError>> => {
    const preset = presetFromItems(deps.ids.next() as PresetId, rows.items);
    if (!preset.ok) return preset;
    const saved = await deps.presets.create(preset.value);
    return saved.ok ? ok(preset.value.id) : saved;
  };
