import type { Brand } from '../../../shared/kernel/index.ts';

export type ItemSourceKind = 'tmdb-movie' | 'freeform' | 'preset';
export type PresetId = Brand<string, 'PresetId'>;

/** Where a list's items come from. Chosen when the list is created. */
export type ItemSourceRef =
  | { readonly kind: 'tmdb-movie' }
  | { readonly kind: 'freeform' }
  | { readonly kind: 'preset'; readonly presetId: PresetId };

/**
 * An item as the catalog describes it. Lists snapshot it at nomination time.
 * `source` + `externalId` identify an item uniquely within its source.
 */
export interface CatalogItem {
  readonly source: ItemSourceKind;
  readonly externalId: string;
  readonly title: string;
  readonly subtitle: string | null;
  /** Only ever on a host allowed by the CSP `img-src`. */
  readonly imageUrl: string | null;
}
