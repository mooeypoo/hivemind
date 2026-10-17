import {
  err,
  ok,
  type Brand,
  type DomainError,
  type Result,
  type RoleId,
} from '../../../shared/kernel/index.ts';
import { invalidConfig, invalidSchedule, listsErrors, lockedFields } from './errors.ts';

export type ListId = Brand<string, 'ListId'>;

/**
 * Where items come from. Opaque to lists: the catalog defines and validates the kinds,
 * so a new source never changes this context.
 */
export interface ItemSourceRef {
  readonly kind: string;
  readonly presetId?: string;
}

/** `nominations`: members nominate entries. `seeded`: every item of the source is an entry from the start. */
export type EntryMode = 'nominations' | 'seeded';
export type ResultsVisibility = 'live' | 'after-close';

export interface Scale {
  readonly min: number;
  readonly max: number;
}

export interface RankingConfig {
  readonly strategy: 'bayesian';
  readonly minVotes: number;
}

export interface ListConfig {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly itemSource: ItemSourceRef;
  readonly entryMode: EntryMode;
  readonly scale: Scale;
  /** Null: unlimited. */
  readonly maxNominationsPerMember: number | null;
  readonly resultsVisibility: ResultsVisibility;
  readonly ranking: RankingConfig;
  readonly showNominators: boolean;
  /** When non-empty, only members holding at least one of these roles may nominate and vote. */
  readonly requiredRoleIds: readonly RoleId[];
  /**
   * `private`: each member sees only their own scores. `public`: members see who gave what,
   * when results are visible. Chosen before publishing; afterwards it can only become private.
   */
  readonly scoreVisibility: ScoreVisibility;
}

export type ScoreVisibility = 'private' | 'public';

export interface Schedule {
  /** From here, members can see the list, nominate and rate. */
  readonly opensAt: Date;
  /** After this, no new nominations; rating continues. Null: nominations stay open while voting is. */
  readonly nominationsCloseAt: Date | null;
  /** When voting ends and scores are final. Null: open-ended, until an Admin closes voting. */
  readonly closesAt: Date | null;
}

/** A saved plan, not publication. Null opening means "when published". */
export type DraftSchedule = Omit<Schedule, 'opensAt'> & { readonly opensAt: Date | null };

/** `hidden`: only Admins can see the list. Changeable at any time. */
export type Visibility = 'public' | 'hidden';

/** What is stored. `scheduled`, `open` and `closed` are derived from the schedule and the Clock. */
export type Phase = 'draft' | 'published' | 'archived';
export type Lifecycle = 'draft' | 'scheduled' | 'open' | 'closed' | 'archived';

export interface List {
  readonly id: ListId;
  readonly config: ListConfig;
  readonly schedule: Schedule | null;
  readonly draftSchedule?: DraftSchedule | null;
  readonly phase: Phase;
  readonly createdAt: Date;
  /** When it was archived; snapshot retention counts from here. */
  readonly archivedAt: Date | null;
  readonly visibility: Visibility;
  /** Changes on entry-write admission, fencing source edits against in-flight nominations. */
  readonly entryWriteToken?: string;
  readonly deletionRequested?: boolean;
  readonly entryDeletion?: {
    readonly entryId: string;
    readonly token: string;
    readonly title: string;
    readonly phase: 'cleaning' | 'finishing';
  } | null;
  /** Changes when an entry is permanently deleted; old admitted work cannot target its replacement. */
  readonly entryDeletionRevision?: string;
}

export const DEFAULT_SCALE: Scale = { min: 1, max: 10 };

/** What a new list starts with, for any field the Admin leaves out. */
export const LIST_DEFAULTS = {
  description: '',
  entryMode: 'nominations',
  scale: DEFAULT_SCALE,
  maxNominationsPerMember: 3,
  resultsVisibility: 'live',
  ranking: { strategy: 'bayesian', minVotes: 5 },
  showNominators: true,
  requiredRoleIds: [],
  scoreVisibility: 'private',
} as const satisfies Partial<ListConfig>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_REQUIRED_ROLES = 25;
const isWhole = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;
const lengthWithin = (value: string, min: number, max: number): boolean =>
  value.trim().length >= min && value.trim().length <= max;

export const validateConfig = (config: ListConfig): Result<ListConfig, DomainError> => {
  const problems: string[] = [];
  if (!lengthWithin(config.title, 1, 120)) problems.push('title must be 1 to 120 characters');
  if (!SLUG.test(config.slug) || config.slug.length > 60) {
    problems.push('slug must be lowercase letters, digits and single hyphens, up to 60 characters');
  }
  if (config.description.length > 2000)
    problems.push('description must be at most 2000 characters');
  const { min, max } = config.scale;
  if (!isWhole(min, 0, 100) || !isWhole(max, 0, 100) || min >= max) {
    problems.push('scale must be whole numbers from 0 to 100 with min below max');
  }
  const cap = config.maxNominationsPerMember;
  if (config.entryMode === 'nominations' && cap !== null && !isWhole(cap, 1, 50)) {
    problems.push('maxNominationsPerMember must be a whole number from 1 to 50, or unlimited');
  }
  const roles = config.requiredRoleIds;
  if (roles.length > MAX_REQUIRED_ROLES || new Set(roles).size !== roles.length) {
    problems.push(`requiredRoleIds must list at most ${String(MAX_REQUIRED_ROLES)} distinct roles`);
  }
  if (!isWhole(config.ranking.minVotes, 0, 1000)) {
    problems.push('ranking.minVotes must be a whole number from 0 to 1000');
  }
  return problems.length > 0
    ? err(invalidConfig(problems))
    : ok({ ...config, title: config.title.trim(), description: config.description.trim() });
};

/**
 * AGENTS.md: `opensAt < nominationsCloseAt ≤ closesAt`, for whichever dates are set.
 * A list with an end date must end in the future; without one it is open-ended.
 */
export const validateSchedule = (schedule: Schedule, now: Date): Result<Schedule, DomainError> => {
  const { opensAt, nominationsCloseAt, closesAt } = schedule;
  const problems: string[] = [];
  if (closesAt !== null && opensAt >= closesAt) problems.push('opensAt must be before closesAt');
  if (
    nominationsCloseAt !== null &&
    (nominationsCloseAt <= opensAt || (closesAt !== null && nominationsCloseAt > closesAt))
  ) {
    problems.push('nominationsCloseAt must be after opensAt and no later than closesAt');
  }
  if (closesAt !== null && closesAt <= now) problems.push('closesAt must be in the future');
  return problems.length > 0 ? err(invalidSchedule(problems)) : ok(schedule);
};

export const validateDraftSchedule = (plan: DraftSchedule): Result<DraftSchedule, DomainError> => {
  const { opensAt, nominationsCloseAt, closesAt } = plan;
  const problems: string[] = [];
  if (
    [opensAt, nominationsCloseAt, closesAt].some(
      (date) => date !== null && !Number.isFinite(date.getTime()),
    )
  )
    problems.push('planned dates must be valid');
  if (opensAt !== null && closesAt !== null && opensAt >= closesAt)
    problems.push('opensAt must be before closesAt');
  if (
    nominationsCloseAt !== null &&
    ((opensAt !== null && nominationsCloseAt <= opensAt) ||
      (closesAt !== null && nominationsCloseAt > closesAt))
  )
    problems.push('nominationsCloseAt must be after opensAt and no later than closesAt');
  return problems.length > 0 ? err(invalidSchedule(problems)) : ok(plan);
};

export const newList = (id: ListId, config: ListConfig, now: Date): List => ({
  id,
  config,
  schedule: null,
  draftSchedule: null,
  phase: 'draft',
  createdAt: now,
  archivedAt: null,
  visibility: 'public',
});

export const lifecycleOf = (list: List, now: Date): Lifecycle => {
  if (list.phase !== 'published' || list.schedule === null) {
    return list.phase === 'archived' ? 'archived' : 'draft';
  }
  if (now < list.schedule.opensAt) return 'scheduled';
  if (list.schedule.closesAt === null || now < list.schedule.closesAt) return 'open';
  return 'closed';
};

export const publish = (list: List, schedule: Schedule, now: Date): Result<List, DomainError> => {
  if (list.phase !== 'draft') return err(listsErrors.notADraft);
  const valid = validateSchedule(schedule, now);
  return valid.ok
    ? ok({ ...list, schedule: valid.value, draftSchedule: null, phase: 'published' })
    : valid;
};

/**
 * Files a published list away, at any time: voting and nominations end now, the list becomes
 * read-only and its final results are shown. It can't be undone.
 */
export const archive = (list: List, now: Date): Result<List, DomainError> =>
  list.phase === 'published'
    ? ok({ ...list, phase: 'archived', archivedAt: now })
    : err(listsErrors.notPublished);

/**
 * Ends voting now on an open list, timed or open-ended: scores become final and results
 * that wait for the close are revealed. Distinct from editing, which never shortens a list.
 */
export const closeVoting = (list: List, now: Date): Result<List, DomainError> =>
  lifecycleOf(list, now) === 'open' && list.schedule !== null
    ? ok({ ...list, schedule: { ...list.schedule, closesAt: now } })
    : err(listsErrors.notOpen);

/** A change to a list. `closesAt` moves the end; a live cap can only be removed, never restored. */
export type ListEdit = Partial<ListConfig> & {
  readonly closesAt?: Date | null;
  readonly draftSchedule?: DraftSchedule | null;
};

const EDITABLE_WHEN_LIVE: ReadonlySet<string> = new Set(['description', 'closesAt']);
const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * All config is editable in `draft`. Once published, description and an extension of `closesAt`
 * may change; an active finite nomination cap may be removed, but never added or restored.
 */
export const editList = (
  list: List,
  edit: ListEdit,
  now: Date,
  options: { readonly itemSourceEditable: boolean } = { itemSourceEditable: false },
): Result<List, DomainError> => {
  const lifecycle = lifecycleOf(list, now);
  const { closesAt, draftSchedule, ...configEdit } = edit;

  if (lifecycle === 'closed' || lifecycle === 'archived') return err(listsErrors.locked);

  if (lifecycle !== 'draft') {
    if (draftSchedule !== undefined) return err(lockedFields(['draftSchedule']));
    const locked = Object.entries(configEdit)
      .filter(([field, value]) => {
        const current = list.config[field as keyof ListConfig];
        const removesCap =
          field === 'maxNominationsPerMember' && current !== null && value === null;
        const changesUnusedSource =
          field === 'itemSource' &&
          list.config.entryMode === 'nominations' &&
          options.itemSourceEditable;
        return (
          !EDITABLE_WHEN_LIVE.has(field) &&
          !removesCap &&
          !changesUnusedSource &&
          !sameValue(value, current)
        );
      })
      .map(([field]) => field);
    if (locked.length > 0) return err(lockedFields(locked));
  }

  if (draftSchedule != null) {
    const valid = validateDraftSchedule(draftSchedule);
    if (!valid.ok) return valid;
  }
  let schedule = list.schedule;
  if (closesAt !== undefined) {
    if (schedule === null) return err(listsErrors.notScheduled);
    // Removing the end date or moving it later only lengthens voting. An open-ended list may
    // be given an end in the future. Ending sooner is "close voting", not an edit.
    const current = schedule.closesAt;
    const lengthens =
      closesAt === null || (current === null ? closesAt > now : closesAt >= current);
    if (!lengthens) return err(listsErrors.closesAtNotExtended);
    schedule = { ...schedule, closesAt };
  }

  const config = validateConfig({ ...list.config, ...configEdit });
  return config.ok
    ? ok({
        ...list,
        config: config.value,
        schedule,
        ...(draftSchedule === undefined ? {} : { draftSchedule }),
      })
    : config;
};

/** Nominations: the list is open, it is not seeded, and `nominationsCloseAt` has not passed. */
export const nominationsOpen = (list: List, now: Date): boolean =>
  list.config.entryMode === 'nominations' &&
  lifecycleOf(list, now) === 'open' &&
  (list.schedule?.nominationsCloseAt == null || now < list.schedule.nominationsCloseAt);

/** Everyone, unless the list requires roles; then any one of them. */
export const mayParticipate = (list: List, roleIds: readonly RoleId[]): boolean =>
  list.config.requiredRoleIds.length === 0 ||
  list.config.requiredRoleIds.some((role) => roleIds.includes(role));

/** Whether a member who has used this many nominations may make another. */
export const underNominationCap = (list: List, used: number): boolean =>
  list.config.maxNominationsPerMember === null || used < list.config.maxNominationsPerMember;

/**
 * Scores can be made public only before publishing, so nobody's vote cast in private is ever
 * revealed. Making them private is always allowed.
 */
export const changeScoreVisibility = (
  list: List,
  scoreVisibility: ScoreVisibility,
  now: Date,
): Result<List, DomainError> =>
  scoreVisibility === 'public' && lifecycleOf(list, now) !== 'draft'
    ? err(listsErrors.scoresPrivateOnly)
    : ok({ ...list, config: { ...list.config, scoreVisibility } });

/** Hidden lists exist only for Admins. */
export const setVisibility = (list: List, visibility: Visibility): List => ({
  ...list,
  visibility,
});

/** Whether this member may see the list at all: drafts and hidden lists are Admin-only. */
export const visibleTo = (list: List, isAdmin: boolean): boolean =>
  isAdmin ||
  (list.deletionRequested !== true && list.phase !== 'draft' && list.visibility === 'public');

/** When retention starts for an archived list. Lists archived before `archivedAt` existed use their close. */
export const archivedSince = (list: List): Date | null =>
  list.phase !== 'archived' ? null : (list.archivedAt ?? list.schedule?.closesAt ?? list.createdAt);
