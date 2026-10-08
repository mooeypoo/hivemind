import type { DomainError, Result } from '../../../shared/kernel/index.ts';
import type {
  CatalogItem,
  ItemSourceKind,
  ItemSourceRef,
  PresetId,
} from '../domain/catalog-item.ts';
import type { Preset } from '../domain/preset.ts';

/**
 * One way of finding items. Adding a kind of list (books, games, ...) means adding an
 * adapter of this port and registering it in `module.ts`; nothing else changes.
 */
export interface ItemSource {
  search(ref: ItemSourceRef, query: string): Promise<Result<readonly CatalogItem[], DomainError>>;
  /** `key` is the item's `externalId`, or for free text, the typed title. */
  resolve(ref: ItemSourceRef, key: string): Promise<Result<CatalogItem, DomainError>>;
}

/** The sources this deployment offers. A source missing here is unavailable (e.g. no TMDB token). */
export type ItemSources = Partial<Readonly<Record<ItemSourceKind, ItemSource>>>;

export interface PresetRepository {
  get(id: PresetId): Promise<Preset | null>;
  /** Presets are immutable: create only. */
  create(preset: Preset): Promise<Result<void, DomainError>>;
}
