import { err, ok, type DomainError, type Result } from '../../../../shared/kernel/index.ts';
import type { PresetRepository } from '../../application/ports.ts';
import type { PresetId } from '../../domain/catalog-item.ts';
import type { Preset } from '../../domain/preset.ts';
import { domainError } from '../../../../shared/kernel/index.ts';

export class InMemoryPresetRepository implements PresetRepository {
  private readonly rows = new Map<PresetId, Preset>();

  get(id: PresetId): Promise<Preset | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  create(preset: Preset): Promise<Result<void, DomainError>> {
    if (this.rows.has(preset.id)) {
      return Promise.resolve(err(domainError('conflict', 'catalog.preset-exists', 'Exists')));
    }
    this.rows.set(preset.id, preset);
    return Promise.resolve(ok(undefined));
  }
}
