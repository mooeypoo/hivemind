import {
  ok,
  requireAdmin,
  type Actor,
  type DomainError,
  type IdGenerator,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { PresetId } from '../domain/catalog-item.ts';
import { parsePreset } from '../domain/preset.ts';
import type { PresetRepository } from './ports.ts';

export interface ImportPresetDeps {
  readonly presets: PresetRepository;
  readonly ids: IdGenerator;
}

export interface PresetImported {
  readonly presetId: PresetId;
  readonly count: number;
}

export const makeImportPreset =
  (deps: ImportPresetDeps) =>
  async (
    actor: Actor,
    input: { readonly csv: string },
  ): Promise<Result<PresetImported, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const preset = parsePreset(deps.ids.next() as PresetId, input.csv);
    if (!preset.ok) return preset;
    const saved = await deps.presets.create(preset.value);
    if (!saved.ok) return saved;
    return ok({ presetId: preset.value.id, count: preset.value.items.length });
  };
