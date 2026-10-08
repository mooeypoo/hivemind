/**
 * The API's wire types. The web app imports only types from this file.
 * Keep these plain data: no classes, no functions, no imports from contexts.
 */

export interface ErrorDto {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly string[];
  };
}

/** `GET /api/me` */
export interface MeDto {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly isAdmin: boolean;
}

/** `GET /api/me/export`: every context's data about the caller, keyed by context. */
export interface MyDataExportDto {
  readonly exportedAt: string;
  readonly identity: {
    readonly id: string;
    readonly displayName: string;
    readonly avatarUrl: string;
  };
  readonly [context: string]: unknown;
}

/** Sign-in failures are reported to the web app as `/?login=<code>`. */
export type LoginOutcomeCode =
  | 'cancelled'
  | 'identity.invalid-login-state'
  | 'identity.not-a-member'
  | 'identity.login-rejected'
  | 'identity.discord-unavailable'
  | 'identity.member-conflict';

// ---- Catalog ----

export type ItemSourceKind = 'tmdb-movie' | 'freeform' | 'preset';

export type ItemSourceDto =
  | { readonly kind: 'tmdb-movie' }
  | { readonly kind: 'freeform' }
  | { readonly kind: 'preset'; readonly presetId: string };

export interface CatalogItemDto {
  readonly source: string;
  readonly externalId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
}

/** `GET /api/catalog/sources` */
export interface SourcesDto {
  readonly sources: readonly ItemSourceKind[];
}

/** `POST /api/catalog/presets` body. CSV with a `title` or `title,subtitle` header. */
export interface ImportPresetRequest {
  readonly csv: string;
}

/** `POST /api/catalog/presets` */
export interface PresetImportedDto {
  readonly presetId: string;
  readonly count: number;
}

// ---- Lists ----

export type Lifecycle = 'draft' | 'scheduled' | 'open' | 'closed' | 'archived';

export interface ListConfigDto {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly itemSource: ItemSourceDto;
  /** `seeded`: every preset item is an entry from the start, and there are no nominations. */
  readonly entryMode: 'nominations' | 'seeded';
  readonly scale: { readonly min: number; readonly max: number };
  readonly maxNominationsPerMember: number;
  readonly resultsVisibility: 'live' | 'after-close';
  readonly ranking: { readonly strategy: 'bayesian'; readonly minVotes: number };
  readonly showNominators: boolean;
  readonly requiredRoleId: string | null;
}

/** ISO 8601 timestamps. */
export interface ScheduleDto {
  readonly opensAt: string;
  readonly nominationsCloseAt: string | null;
  readonly closesAt: string;
}

export interface ListDto extends ListConfigDto {
  readonly id: string;
  readonly lifecycle: Lifecycle;
  readonly schedule: ScheduleDto | null;
  readonly viewer: {
    readonly canParticipate: boolean;
    readonly canNominate: boolean;
    readonly nominationsUsed: number;
  };
}

export interface EntryDto {
  readonly id: string;
  readonly item: CatalogItemDto;
  /** Only when the list shows nominators. */
  readonly nominatedBy: string | null;
  readonly isMine: boolean;
  readonly nominatedAt: string;
}

/** `GET /api/lists` */
export interface ListsDto {
  readonly lists: readonly ListDto[];
}

/** `GET /api/lists/:list` (id or slug) */
export interface ListDetailDto extends ListDto {
  readonly entries: readonly EntryDto[];
}

/** `POST /api/lists` body. Omitted fields take the list defaults. */
export type CreateListRequest = Pick<ListConfigDto, 'title' | 'slug' | 'itemSource'> &
  Partial<ListConfigDto>;

/** `PUT /api/lists/:list` body. Once scheduled, only `description` and a later `closesAt`. */
export type EditListRequest = Partial<ListConfigDto> & { readonly closesAt?: string };

/** `POST /api/lists/:list/schedule` body. */
export type ScheduleListRequest = ScheduleDto;

/** `GET /api/lists/:list/search?q=` */
export interface SearchResultsDto {
  readonly items: readonly CatalogItemDto[];
}

/** `POST /api/lists/:list/entries` body: an item from search, or a title for a free-text list. */
export type NominateRequest = { readonly externalId: string } | { readonly title: string };
