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
  readonly maxNominationsPerMember: number;
  readonly resultsVisibility: ResultsVisibility;
  readonly ranking: RankingConfig;
  readonly showNominators: boolean;
  /** When set, only members holding this role may nominate (and, later, vote). */
  readonly requiredRoleId: RoleId | null;
}

export interface Schedule {
  readonly opensAt: Date;
  /** Null: nominations stay open until the list closes. */
  readonly nominationsCloseAt: Date | null;
  readonly closesAt: Date;
}

/** What is stored. `scheduled`, `open` and `closed` are derived from the schedule and the Clock. */
export type Phase = 'draft' | 'published' | 'archived';
export type Lifecycle = 'draft' | 'scheduled' | 'open' | 'closed' | 'archived';

export interface List {
  readonly id: ListId;
  readonly config: ListConfig;
  readonly schedule: Schedule | null;
  readonly phase: Phase;
  readonly createdAt: Date;
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
  requiredRoleId: null,
} as const satisfies Partial<ListConfig>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
  if (config.entryMode === 'nominations' && !isWhole(config.maxNominationsPerMember, 1, 50)) {
    problems.push('maxNominationsPerMember must be a whole number from 1 to 50');
  }
  if (!isWhole(config.ranking.minVotes, 0, 1000)) {
    problems.push('ranking.minVotes must be a whole number from 0 to 1000');
  }
  return problems.length > 0
    ? err(invalidConfig(problems))
    : ok({ ...config, title: config.title.trim(), description: config.description.trim() });
};

/** AGENTS.md: `opensAt < nominationsCloseAt ≤ closesAt`. A list must also close in the future. */
export const validateSchedule = (schedule: Schedule, now: Date): Result<Schedule, DomainError> => {
  const { opensAt, nominationsCloseAt, closesAt } = schedule;
  const problems: string[] = [];
  if (opensAt >= closesAt) problems.push('opensAt must be before closesAt');
  if (
    nominationsCloseAt !== null &&
    (nominationsCloseAt <= opensAt || nominationsCloseAt > closesAt)
  ) {
    problems.push('nominationsCloseAt must be after opensAt and no later than closesAt');
  }
  if (closesAt <= now) problems.push('closesAt must be in the future');
  return problems.length > 0 ? err(invalidSchedule(problems)) : ok(schedule);
};

export const newList = (id: ListId, config: ListConfig, now: Date): List => ({
  id,
  config,
  schedule: null,
  phase: 'draft',
  createdAt: now,
});

export const lifecycleOf = (list: List, now: Date): Lifecycle => {
  if (list.phase !== 'published' || list.schedule === null) {
    return list.phase === 'archived' ? 'archived' : 'draft';
  }
  if (now < list.schedule.opensAt) return 'scheduled';
  if (now < list.schedule.closesAt) return 'open';
  return 'closed';
};

export const publish = (list: List, schedule: Schedule, now: Date): Result<List, DomainError> => {
  if (list.phase !== 'draft') return err(listsErrors.notADraft);
  const valid = validateSchedule(schedule, now);
  return valid.ok ? ok({ ...list, schedule: valid.value, phase: 'published' }) : valid;
};

export const archive = (list: List, now: Date): Result<List, DomainError> =>
  lifecycleOf(list, now) === 'closed'
    ? ok({ ...list, phase: 'archived' })
    : err(listsErrors.notClosed);

/** A change to a list. Config fields replace the current ones; `closesAt` moves the close. */
export type ListEdit = Partial<ListConfig> & { readonly closesAt?: Date };

const EDITABLE_WHEN_LIVE: ReadonlySet<string> = new Set(['description', 'closesAt']);
const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * AGENTS.md: all of the config is editable in `draft`. Once `scheduled` or `open`, only
 * `description` and an extension of `closesAt`. Nothing after that.
 */
export const editList = (list: List, edit: ListEdit, now: Date): Result<List, DomainError> => {
  const lifecycle = lifecycleOf(list, now);
  const { closesAt, ...configEdit } = edit;

  if (lifecycle === 'closed' || lifecycle === 'archived') return err(listsErrors.locked);

  if (lifecycle !== 'draft') {
    const locked = Object.entries(configEdit)
      .filter(([field]) => !EDITABLE_WHEN_LIVE.has(field))
      .filter(([field, value]) => !sameValue(value, list.config[field as keyof ListConfig]))
      .map(([field]) => field);
    if (locked.length > 0) return err(lockedFields(locked));
  }

  let schedule = list.schedule;
  if (closesAt !== undefined) {
    if (schedule === null) return err(listsErrors.notScheduled);
    if (closesAt < schedule.closesAt) return err(listsErrors.closesAtNotExtended);
    schedule = { ...schedule, closesAt };
  }

  const config = validateConfig({ ...list.config, ...configEdit });
  return config.ok ? ok({ ...list, config: config.value, schedule }) : config;
};

/** Nominations: the list is open, it is not seeded, and `nominationsCloseAt` has not passed. */
export const nominationsOpen = (list: List, now: Date): boolean =>
  list.config.entryMode === 'nominations' &&
  lifecycleOf(list, now) === 'open' &&
  (list.schedule?.nominationsCloseAt == null || now < list.schedule.nominationsCloseAt);

export const mayParticipate = (list: List, roleIds: readonly RoleId[]): boolean =>
  list.config.requiredRoleId === null || roleIds.includes(list.config.requiredRoleId);
