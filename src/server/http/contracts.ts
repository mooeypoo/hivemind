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
  /** Null: unlimited. */
  readonly maxNominationsPerMember: number | null;
  readonly resultsVisibility: 'live' | 'after-close';
  readonly ranking: { readonly strategy: 'bayesian'; readonly minVotes: number };
  readonly showNominators: boolean;
  /** Empty: every member may take part. Otherwise, holders of any of these Discord role IDs. */
  readonly requiredRoleIds: readonly string[];
  /**
   * `public`: members see who gave what score, when results are visible. Set before publishing;
   * afterwards it can only become private.
   */
  readonly scoreVisibility: 'private' | 'public';
}

/** ISO 8601 timestamps. */
export interface ScheduleDto {
  /** From here members can see the list, nominate and rate. */
  readonly opensAt: string;
  /** After this, no new nominations; rating continues. */
  readonly nominationsCloseAt: string | null;
  /** When voting ends and results are final. Null: open until an Admin closes voting. */
  readonly closesAt: string | null;
}

/** `hidden`: only Admins can see the list. */
export type Visibility = 'public' | 'hidden';

export interface ListDto extends ListConfigDto {
  readonly id: string;
  readonly lifecycle: Lifecycle;
  readonly schedule: ScheduleDto | null;
  readonly visibility: Visibility;
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
  /** Archived movie lists: when movie details will be removed (TMDB terms). */
  readonly snapshotsExpireAt: string | null;
}

/** `POST /api/lists` body. Omitted fields take the list defaults. */
export type CreateListRequest = Pick<ListConfigDto, 'title' | 'slug' | 'itemSource'> &
  Partial<ListConfigDto>;

/** `PUT /api/lists/:list` body. Published lists may remove, but never restore, a nomination cap. */
export type EditListRequest = Partial<ListConfigDto> & {
  /** A later end, an end for an open-ended list, or null to remove the end. */
  readonly closesAt?: string | null;
};

/** `PUT /api/lists/:list/visibility` body. */
export interface SetVisibilityRequest {
  readonly visibility: Visibility;
}

/** `POST /api/lists/:list/schedule` body. */
export type ScheduleListRequest = ScheduleDto;

/** `GET /api/lists/:list/search?q=` */
export interface SearchResultsDto {
  readonly items: readonly CatalogItemDto[];
}

/** `POST /api/lists/:list/entries` body: an item from search, or a title for a free-text list. */
export type NominateRequest = { readonly externalId: string } | { readonly title: string };

// ---- Voting ----

/** `GET` and `PUT /api/lists/:list/ballot`: the caller's own scores, by entry id. Private. */
export interface BallotDto {
  readonly listId: string;
  readonly scores: Readonly<Record<string, number>>;
}

/** `PUT /api/lists/:list/ballot` body. `score: null` clears the score. */
export interface ChangeScoreRequest {
  readonly entryId: string;
  readonly score: number | null;
}

/** `GET /api/lists/:list/scores`; names are returned only for visible public scores. */
export type PublicScoresDto =
  | { readonly visible: false }
  | {
      readonly visible: true;
      readonly entries: Readonly<
        Record<string, readonly { readonly displayName: string; readonly score: number }[]>
      >;
    };

// ---- Ranking ----

export interface LeaderboardRowDto {
  /** Null while the entry has no votes. Equal scores share a rank. */
  readonly rank: number | null;
  readonly entryId: string;
  readonly item: CatalogItemDto;
  /** The ranking score, rounded to 2 decimals. Null without votes. */
  readonly score: number | null;
  readonly votes: number;
  /** Fewer votes than the list's minimum: shown in place, not yet confirmed. */
  readonly provisional: boolean;
  readonly votesNeeded: number;
}

/** `GET /api/lists/:list/leaderboard`. A hidden board carries no numbers at all. */
export type LeaderboardDto =
  | { readonly hidden: true; readonly revealsAt: string | null }
  | {
      readonly hidden: false;
      readonly computedAt: string;
      readonly minVotes: number;
      readonly rows: readonly LeaderboardRowDto[];
    };

// ---- Site and roles ----

export interface CommunityDto {
  readonly name: string;
  readonly iconUrl: string | null;
  /** Join link, when the deployment configured an invite. */
  readonly inviteUrl: string | null;
}

/** `GET /api/site` (public): what the footer and welcome page show. */
export interface SiteDto {
  /** Null when the deployment set neither an invite code nor a community name. */
  readonly community: CommunityDto | null;
  /** Whether movie lists (TMDB) are offered, for the attribution line. */
  readonly offersMovieData: boolean;
  /** Demo mode: pretend sign-in with sample data. Never true in production. */
  readonly demo: boolean;
  /** Whether backups are set up (`BACKUP_KEY`). */
  readonly backups: boolean;
}

export type DemoPersona = 'admin' | 'member-a' | 'member-b';

/** `POST /api/auth/demo` body. */
export interface DemoSignInRequest {
  readonly persona: DemoPersona;
}

export interface RoleLabelDto {
  readonly roleId: string;
  readonly name: string;
}

/** `GET` and `PUT /api/roles`: Admin-maintained names for Discord role IDs. */
export interface RoleLabelsDto {
  readonly labels: readonly RoleLabelDto[];
  /** Send back when saving; a save based on an older version is refused. */
  readonly version: string | null;
}

/** `PUT /api/roles` body. */
export interface SaveRoleLabelsRequest {
  readonly labels: readonly RoleLabelDto[];
  readonly version: string | null;
}

// ---- Backups ----

/**
 * What the web app reads from a backup file to preview it before importing. The full format
 * is the server's; votes inside it are sealed and unreadable.
 */
export interface BackupPreview {
  readonly format: 'votable-lists-backup';
  readonly version: number;
  readonly exportedAt: string;
  readonly lists: readonly {
    readonly list: { readonly config: { readonly title: string; readonly slug: string } };
    readonly entries: readonly unknown[];
    readonly ballots: string | null;
  }[];
}

export type ImportedListDto =
  | {
      readonly ok: true;
      readonly title: string;
      readonly slug: string;
      /** The original address was taken: imported under a new one, hidden for review. */
      readonly renamed: boolean;
      readonly hidden: boolean;
      readonly entries: number;
      readonly votesRestored: number;
      /** Members whose names and votes weren't restored (they deleted their data, or the key differs). */
      readonly membersLeftOut: number;
    }
  | { readonly ok: false; readonly title: string; readonly problem: string };

/** `POST /api/admin/backup` */
export interface ImportSummaryDto {
  /** False: made with a different backup key, so no names or votes were restored. */
  readonly keyMatched: boolean;
  readonly lists: readonly ImportedListDto[];
}
