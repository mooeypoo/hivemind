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
  | 'http.internal'
  | 'identity.invalid-login-state'
  | 'identity.not-a-member'
  | 'identity.login-rejected'
  | 'identity.discord-unavailable'
  | 'identity.member-conflict';

// ---- Insights (Admin only; current state, no score values or member identifiers) ----

export interface ParticipationMetricsDto {
  readonly entries: number;
  readonly withdrawnEntries: number;
  readonly setAsideEntries: number;
  readonly nominators: number;
  readonly ratings: number;
  readonly voters: number;
  readonly ratedEntries: number;
  readonly readyEntries: number;
}

export type ListInsightDto = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly lifecycle: Lifecycle;
  readonly viewers: Viewers;
  readonly source: string;
  readonly entryMode: 'nominations' | 'seeded';
} & (
  | { readonly status: 'after-close'; readonly revealsAt: string | null }
  | { readonly status: 'paused' }
  | {
      readonly status: 'available';
      readonly metrics: ParticipationMetricsDto;
      readonly minVotes: number;
      readonly distribution: readonly { readonly ratings: number; readonly entries: number }[];
    }
);

/** `GET /api/admin/insights[?list=<id or slug>]`. Totals include available lists only. */
export interface InsightsDto {
  readonly computedAt: string;
  readonly includedLists: number;
  readonly excludedLists: number;
  readonly totals: ParticipationMetricsDto;
  readonly lists: readonly ListInsightDto[];
}

// ---- Catalog ----

export type ItemSourceKind = 'tmdb-movie' | 'tvdb-series' | 'igdb-game' | 'freeform' | 'preset';

export type ItemSourceDto =
  | { readonly kind: 'tmdb-movie' }
  | { readonly kind: 'tvdb-series' }
  | { readonly kind: 'igdb-game' }
  | { readonly kind: 'freeform' }
  | { readonly kind: 'preset'; readonly presetId: string };

export interface CatalogItemDto {
  readonly source: string;
  readonly externalId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
  readonly overview?: string;
  readonly director?: string;
  readonly creator?: string;
  readonly developer?: string;
  readonly publisher?: string;
  readonly cast?: readonly string[];
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
  /** Who may view, nominate and rate. Site admins always may, whatever this says. */
  readonly access: ListAccessDto;
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

/** Draft-only plan. Null opening means "when published"; no participation starts on save. */
export type DraftScheduleDto = Omit<ScheduleDto, 'opensAt'> & { readonly opensAt: string | null };

/**
 * `everyone`: every member of the Discord server, with or without roles. `roles`: members
 * holding any of these Discord role IDs; with none, only site admins.
 */
export type AudienceDto =
  { readonly kind: 'everyone' } | { readonly kind: 'roles'; readonly roleIds: readonly string[] };

/** Nominating and rating also need viewing. Seeded lists ignore `nominate`. */
export interface ListAccessDto {
  readonly view: AudienceDto;
  readonly nominate: AudienceDto;
  readonly rate: AudienceDto;
}

export type AccessActionDto = keyof ListAccessDto;

/** Who may view, at a glance. `site-admins`: hidden from members. */
export type Viewers = 'everyone' | 'roles' | 'site-admins';

export interface ListDto extends ListConfigDto {
  /** Admin-only, null for older lists or after attribution expires/erasure. */
  readonly createdBy?: string | null;
  /** Admin-only settings revision, independent of votes and technical write markers. */
  readonly settingsVersion?: number;
  /** Send with score changes; a permanent entry deletion invalidates older list snapshots. */
  readonly writeRevision?: string | null;
  readonly participationPaused?: boolean;
  /** Pending permanent deletion: Admins may resume it, members cannot access it. */
  readonly deleting?: boolean;
  readonly id: string;
  readonly lifecycle: Lifecycle;
  readonly schedule: ScheduleDto | null;
  readonly draftSchedule?: DraftScheduleDto | null;
  readonly viewers: Viewers;
  /** Admin-only: who could view before the list was hidden from members. */
  readonly previousView?: AudienceDto | null;
  /**
   * Admin-only: an older version of the app changed this list's access, so it was hidden from
   * members until an Admin reviews who may view, nominate and rate.
   */
  readonly accessNeedsReview?: boolean;
  readonly viewer: {
    /** What the list's access allows the caller, whatever its lifecycle. */
    readonly allowed: { readonly nominate: boolean; readonly rate: boolean };
    /** Allowed to rate, and the list isn't paused; the lifecycle still decides if it is open. */
    readonly canRate: boolean;
    readonly canNominate: boolean;
    readonly nominationsUsed: number;
    /** What a site admin may do here only because they are a site admin. */
    readonly viaSiteAdmin: readonly AccessActionDto[];
  };
}

export interface DeleteListRequest {
  readonly confirmation: string;
}

export interface DeleteEntryRequest {
  readonly entryId: string;
  readonly token: string;
  readonly confirmation: string;
}

export interface EntryDto {
  /** Admin-only last moderation attribution, never part of ordinary member responses. */
  readonly moderation?: { readonly adminName: string | null; readonly at: string } | null;
  readonly setAsideReason?: string | null;
  readonly id: string;
  readonly item: CatalogItemDto;
  /** Only when the list shows nominators. */
  readonly nominatedBy: string | null;
  readonly isMine: boolean;
  readonly nominatedAt: string;
  /** Present only for the caller's own nomination while withdrawal is allowed. */
  readonly withdrawalToken?: string | null;
  /** Admin-only confirmation token, specific to this nomination/seeded entry. */
  readonly deletionToken?: string | null;
}

export interface SetEntryAsideRequest {
  readonly entryId: string;
  readonly token: string;
  readonly expectedReason: string | null;
  readonly reason: string | null;
}

/** `GET /api/lists` */
export interface ListsDto {
  readonly lists: readonly ListDto[];
}

export interface ListActivityDto {
  readonly events: readonly {
    readonly id: string;
    readonly action:
      | 'created'
      | 'imported'
      | 'settings-edited'
      | 'published'
      | 'archived'
      | 'voting-closed'
      | 'visibility-changed'
      | 'access-changed'
      | 'score-privacy-changed'
      | 'entry-set-aside'
      | 'entry-returned'
      | 'explanation-edited'
      | 'entry-deleted';
    readonly at: string;
    readonly adminName: string | null;
    readonly entryTitle: string | null;
    readonly changes: readonly {
      readonly field: string;
      readonly before: string | null;
      readonly after: string | null;
    }[];
  }[];
}

/** `GET /api/admin/activity` */
export interface AdminActivityDto {
  readonly events: readonly (ListActivityDto['events'][number] & {
    readonly list: { readonly id: string; readonly title: string; readonly slug: string };
  })[];
  readonly lists: readonly { readonly id: string; readonly title: string; readonly slug: string }[];
  readonly nextCursor: string | null;
}

/** `GET /api/lists/:list` (id or slug) */
export interface ListDetailDto extends ListDto {
  /** Admin-only management of retained withdrawals, never included in rankings. */
  readonly withdrawnEntries?: readonly EntryDto[];
  /** Admin-only retry information; no entry/member data in the ordinary list summary. */
  readonly entryDeletion?: {
    readonly entryId: string;
    readonly token: string;
    readonly title: string;
  } | null;
  /** Admin-only ability, checked again at save time; withdrawn entries also lock the source. */
  readonly itemSourceEditable: boolean;
  readonly entries: readonly EntryDto[];
  /** Archived movie lists: when movie details will be removed (TMDB terms). */
  readonly snapshotsExpireAt: string | null;
}

/** `POST /api/lists` body. Omitted fields take the list defaults. */
export type CreateListRequest = Pick<ListConfigDto, 'title' | 'slug' | 'itemSource'> &
  Partial<ListConfigDto>;

/** `PUT /api/lists/:list` body. Published lists may remove, but never restore, a nomination cap. */
export type EditListRequest = Partial<ListConfigDto> & {
  readonly expectedSettingsVersion?: number;
  readonly draftSchedule?: DraftScheduleDto | null;
  /** A later end, an end for an open-ended list, or null to remove the end. */
  readonly closesAt?: string | null;
};

/** `PUT /api/lists/:list/access` body. Any lifecycle; the list's entries and scores stay. */
export interface ChangeAccessRequest {
  readonly access: ListAccessDto;
  readonly expectedSettingsVersion?: number;
}

/** `POST /api/lists/:list/schedule` body. */
export type ScheduleListRequest = ScheduleDto & { readonly expectedSettingsVersion?: number };

/** `GET /api/lists/:list/search?q=` */
export interface SearchResultsDto {
  readonly items: readonly CatalogItemDto[];
}

/**
 * `POST /api/lists/:list/refresh-movie-details?after=`: fills missing TMDB details, or, on a
 * TVDB list, updates posters and missing details. TVDB runs in batches: pass `next` as `after`.
 */
export interface RefreshMovieDetailsDto {
  readonly eligible: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly remaining: number;
  readonly next: string | null;
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
  readonly revision?: string | null;
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
  /** Null until the entry has the list's minimum votes. Equal scores share a rank. */
  readonly rank: number | null;
  readonly entryId: string;
  readonly item: CatalogItemDto;
  /** The ranking score, rounded to 2 decimals. Null without votes. */
  readonly score: number | null;
  readonly votes: number;
  /** Fewer votes than the list's minimum: no rank yet, listed after every ranked entry. */
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
      /** Independently calculated groups. `rows` is always the combined ranking. */
      readonly groups?: {
        readonly main: readonly LeaderboardRowDto[];
        readonly setAside: readonly LeaderboardRowDto[];
      };
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
  readonly offersTvData: boolean;
  readonly offersGameData: boolean;
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
