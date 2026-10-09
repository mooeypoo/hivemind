import { describe, expect, test } from 'vitest';
import type { RoleId } from '../../../shared/kernel/index.ts';
import {
  archive,
  changeScoreVisibility,
  closeVoting,
  DEFAULT_SCALE,
  editList,
  LIST_DEFAULTS,
  lifecycleOf,
  mayParticipate,
  newList,
  nominationsOpen,
  publish,
  validateConfig,
  validateSchedule,
  type List,
  type ListConfig,
  type ListId,
  type Schedule,
} from './list.ts';

const t = (iso: string) => new Date(`2026-03-${iso}Z`);
const config: ListConfig = {
  title: 'Best Sci-Fi Movies',
  slug: 'best-sci-fi-movies',
  description: 'Our favourites.',
  itemSource: { kind: 'tmdb-movie' },
  entryMode: 'nominations',
  scale: DEFAULT_SCALE,
  maxNominationsPerMember: 3,
  resultsVisibility: 'live',
  ranking: { strategy: 'bayesian', minVotes: 5 },
  showNominators: true,
  requiredRoleIds: [],
  scoreVisibility: 'private',
};
const schedule: Schedule = {
  opensAt: t('10T00:00:00'),
  nominationsCloseAt: t('15T00:00:00'),
  closesAt: t('20T00:00:00'),
};
const draft = newList('l1' as ListId, config, t('01T00:00:00'));
const published = (s: Schedule = schedule): List => {
  const result = publish(draft, s, t('01T00:00:00'));
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

describe('lifecycle', () => {
  test('a new list is a draft', () => {
    expect(lifecycleOf(draft, t('12T00:00:00'))).toBe('draft');
  });

  test('an open-ended list stays open', () => {
    const list = published({ ...schedule, closesAt: null });
    expect(lifecycleOf(list, t('09T00:00:00'))).toBe('scheduled');
    expect(lifecycleOf(list, new Date('2030-01-01T00:00:00Z'))).toBe('open');
  });

  test('a published list is scheduled, open, then closed, by the clock', () => {
    const list = published();
    expect(lifecycleOf(list, t('09T23:59:59'))).toBe('scheduled');
    expect(lifecycleOf(list, t('10T00:00:00'))).toBe('open');
    expect(lifecycleOf(list, t('19T23:59:59'))).toBe('open');
    expect(lifecycleOf(list, t('20T00:00:00'))).toBe('closed');
  });

  test.each([
    ['scheduled', '05T00:00:00'],
    ['open', '12T00:00:00'],
    ['closed', '21T00:00:00'],
  ])('a %s list can be archived, at any time, which ends it', (_, at) => {
    const archived = archive(published(), t(at));
    expect(archived.ok && lifecycleOf(archived.value, t(at))).toBe('archived');
    expect(archived.ok && archived.value.archivedAt).toEqual(t(at));
  });

  test('a draft cannot be archived', () => {
    const result = archive(draft, t('01T00:00:00'));
    expect(!result.ok && result.error.code).toBe('lists.not-published');
  });

  test('only a draft can be published', () => {
    const result = publish(published(), schedule, t('01T00:00:00'));
    expect(!result.ok && result.error.code).toBe('lists.not-a-draft');
  });
});

describe('schedule', () => {
  const now = t('01T00:00:00');

  test('requires opensAt < nominationsCloseAt ≤ closesAt', () => {
    expect(validateSchedule(schedule, now).ok).toBe(true);
    expect(validateSchedule({ ...schedule, nominationsCloseAt: schedule.closesAt }, now).ok).toBe(
      true,
    );
    expect(validateSchedule({ ...schedule, nominationsCloseAt: schedule.opensAt }, now).ok).toBe(
      false,
    );
    expect(validateSchedule({ ...schedule, nominationsCloseAt: t('21T00:00:00') }, now).ok).toBe(
      false,
    );
  });

  test('nominationsCloseAt is optional, but opensAt < closesAt still holds', () => {
    expect(validateSchedule({ ...schedule, nominationsCloseAt: null }, now).ok).toBe(true);
    expect(
      validateSchedule({ ...schedule, nominationsCloseAt: null, closesAt: schedule.opensAt }, now)
        .ok,
    ).toBe(false);
  });

  test('may have no end: voting stays open until an Admin closes it', () => {
    expect(validateSchedule({ ...schedule, closesAt: null }, now).ok).toBe(true);
    expect(
      validateSchedule(
        { opensAt: schedule.opensAt, nominationsCloseAt: t('15T00:00:00'), closesAt: null },
        now,
      ).ok,
    ).toBe(true);
    expect(
      validateSchedule(
        { opensAt: schedule.opensAt, nominationsCloseAt: t('05T00:00:00'), closesAt: null },
        now,
      ).ok,
    ).toBe(false);
  });

  test('must close in the future', () => {
    expect(validateSchedule(schedule, t('20T00:00:00')).ok).toBe(false);
  });
});

describe('config', () => {
  const problems = (patch: Partial<ListConfig>) => {
    const result = validateConfig({ ...config, ...patch });
    return result.ok ? [] : (result.error.details ?? []);
  };

  test('accepts a valid config with the default 1–10 scale', () => {
    expect(validateConfig(config).ok).toBe(true);
    expect(DEFAULT_SCALE).toEqual({ min: 1, max: 10 });
  });

  test('reports every invalid field', () => {
    expect(
      problems({
        title: ' ',
        slug: 'Not A Slug',
        scale: { min: 5, max: 5 },
        maxNominationsPerMember: 0,
        ranking: { strategy: 'bayesian', minVotes: -1 },
      }),
    ).toEqual([
      'title must be 1 to 120 characters',
      'slug must be lowercase letters, digits and single hyphens, up to 60 characters',
      'scale must be whole numbers from 0 to 100 with min below max',
      'maxNominationsPerMember must be a whole number from 1 to 50, or unlimited',
      'ranking.minVotes must be a whole number from 0 to 1000',
    ]);
  });

  test('nominations can be unlimited', () => {
    expect(problems({ maxNominationsPerMember: null })).toEqual([]);
  });

  test('allows up to 25 distinct required roles', () => {
    const roles = (n: number) => Array.from({ length: n }, (_, i) => `r${String(i)}` as RoleId);
    expect(problems({ requiredRoleIds: roles(25) })).toEqual([]);
    expect(problems({ requiredRoleIds: roles(26) })).toEqual([
      'requiredRoleIds must list at most 25 distinct roles',
    ]);
    expect(problems({ requiredRoleIds: ['r1' as RoleId, 'r1' as RoleId] })).toEqual([
      'requiredRoleIds must list at most 25 distinct roles',
    ]);
  });

  test('a seeded list does not need a nomination cap', () => {
    expect(problems({ entryMode: 'seeded', maxNominationsPerMember: 0 })).toEqual([]);
  });
});

describe('editing', () => {
  test('a draft can change any part of its config', () => {
    const result = editList(draft, { title: 'New', scale: { min: 0, max: 5 } }, t('01T00:00:00'));
    expect(result.ok && result.value.config.title).toBe('New');
    expect(result.ok && result.value.config.scale).toEqual({ min: 0, max: 5 });
  });

  test.each([
    ['scheduled', '05T00:00:00'],
    ['open', '12T00:00:00'],
  ])('a %s list can change its description and extend closesAt', (_, at) => {
    const list = published();
    const ok = editList(list, { description: 'Updated', closesAt: t('25T00:00:00') }, t(at));
    expect(ok.ok && ok.value.config.description).toBe('Updated');
    expect(ok.ok && ok.value.schedule?.closesAt).toEqual(t('25T00:00:00'));

    const locked = editList(list, { title: 'Renamed', scale: { min: 0, max: 5 } }, t(at));
    expect(!locked.ok && locked.error.details).toEqual(['title', 'scale']);
  });

  test('an active list may remove a nomination cap but may not add one back', () => {
    const unlimited = editList(published(), { maxNominationsPerMember: null }, t('12T00:00:00'));
    expect(unlimited.ok && unlimited.value.config.maxNominationsPerMember).toBeNull();

    const cappedAgain = unlimited.ok
      ? editList(unlimited.value, { maxNominationsPerMember: 5 }, t('12T00:00:00'))
      : unlimited;
    expect(!cappedAgain.ok && cappedAgain.error.details).toEqual(['maxNominationsPerMember']);
  });

  test('sending unchanged locked fields is not an edit', () => {
    const result = editList(published(), { ...config, description: 'x' }, t('12T00:00:00'));
    expect(result.ok).toBe(true);
  });

  test('closesAt can be extended but never shortened', () => {
    const result = editList(published(), { closesAt: t('19T00:00:00') }, t('12T00:00:00'));
    expect(!result.ok && result.error.code).toBe('lists.closes-at-not-extended');
  });

  test('the end date can be removed, making the list open-ended', () => {
    const result = editList(published(), { closesAt: null }, t('12T00:00:00'));
    expect(result.ok && result.value.schedule?.closesAt).toBeNull();
  });

  test('an open-ended list can be given a future end date, not a past one', () => {
    const list = published({ ...schedule, closesAt: null });
    const later = editList(list, { closesAt: t('25T00:00:00') }, t('12T00:00:00'));
    expect(later.ok && later.value.schedule?.closesAt).toEqual(t('25T00:00:00'));
    const past = editList(list, { closesAt: t('11T00:00:00') }, t('12T00:00:00'));
    expect(!past.ok && past.error.code).toBe('lists.closes-at-not-extended');
  });

  test('a closed or archived list cannot be edited', () => {
    const result = editList(published(), { description: 'Late' }, t('20T00:00:00'));
    expect(!result.ok && result.error.code).toBe('lists.locked');
  });
});

describe('nominations window', () => {
  test('is open while the list is open and before nominationsCloseAt', () => {
    const list = published();
    expect(nominationsOpen(list, t('09T00:00:00'))).toBe(false);
    expect(nominationsOpen(list, t('10T00:00:00'))).toBe(true);
    expect(nominationsOpen(list, t('14T23:59:59'))).toBe(true);
    expect(nominationsOpen(list, t('15T00:00:00'))).toBe(false);
  });

  test('without nominationsCloseAt, stays open until the list closes', () => {
    const list = published({ ...schedule, nominationsCloseAt: null });
    expect(nominationsOpen(list, t('19T23:59:59'))).toBe(true);
    expect(nominationsOpen(list, t('20T00:00:00'))).toBe(false);
  });

  test('never opens for a seeded list', () => {
    const seeded = newList('l2' as ListId, { ...config, entryMode: 'seeded' }, t('01T00:00:00'));
    const result = publish(seeded, schedule, t('01T00:00:00'));
    expect(result.ok && nominationsOpen(result.value, t('12T00:00:00'))).toBe(false);
  });
});

describe('participation', () => {
  test('is open to every member when no roles are required', () => {
    expect(mayParticipate(draft, [])).toBe(true);
  });

  test('otherwise needs any one of the required roles', () => {
    const gated = newList(
      'l3' as ListId,
      { ...config, requiredRoleIds: ['r1' as RoleId, 'r2' as RoleId] },
      t('01T00:00:00'),
    );
    expect(mayParticipate(gated, [])).toBe(false);
    expect(mayParticipate(gated, ['r9' as RoleId])).toBe(false);
    expect(mayParticipate(gated, ['r2' as RoleId])).toBe(true);
  });
});

describe('closing voting', () => {
  test('ends an open list now: scores become final', () => {
    const result = closeVoting(published({ ...schedule, closesAt: null }), t('12T00:00:00'));
    expect(result.ok && result.value.schedule?.closesAt).toEqual(t('12T00:00:00'));
    expect(result.ok && lifecycleOf(result.value, t('12T00:00:00'))).toBe('closed');
  });

  test('also ends a timed list early', () => {
    const result = closeVoting(published(), t('12T00:00:00'));
    expect(result.ok && lifecycleOf(result.value, t('12T00:00:00'))).toBe('closed');
  });

  test.each([
    ['before it opens', '05T00:00:00'],
    ['after it closed', '21T00:00:00'],
  ])('is only possible while open, not %s', (_, at) => {
    const result = closeVoting(published(), t(at));
    expect(!result.ok && result.error.code).toBe('lists.not-open');
  });
});

describe('visibility', () => {
  test('a new list is public', () => {
    expect(draft.visibility).toBe('public');
  });
});

describe('score visibility', () => {
  test('scores are private unless a list chooses otherwise', () => {
    expect(LIST_DEFAULTS.scoreVisibility).toBe('private');
  });

  test('a draft can make its scores public or private', () => {
    const made = changeScoreVisibility(draft, 'public', t('01T00:00:00'));
    expect(made.ok && made.value.config.scoreVisibility).toBe('public');
  });

  test.each([
    ['scheduled', '05T00:00:00'],
    ['open', '12T00:00:00'],
    ['closed', '21T00:00:00'],
  ])('a %s list can make public scores private, never private scores public', (_, at) => {
    const publicDraft = changeScoreVisibility(draft, 'public', t('01T00:00:00'));
    if (!publicDraft.ok) throw new Error('fixture');
    const live = publish(publicDraft.value, schedule, t('01T00:00:00'));
    if (!live.ok) throw new Error('fixture');
    const toPrivate = changeScoreVisibility(live.value, 'private', t(at));
    expect(toPrivate.ok && toPrivate.value.config.scoreVisibility).toBe('private');
    const backToPublic = toPrivate.ok
      ? changeScoreVisibility(toPrivate.value, 'public', t(at))
      : toPrivate;
    expect(!backToPublic.ok && backToPublic.error.code).toBe('lists.scores-private-only');
  });

  test('editing a published list cannot make its scores public', () => {
    const result = editList(published(), { scoreVisibility: 'public' }, t('12T00:00:00'));
    expect(!result.ok && result.error.details).toEqual(['scoreVisibility']);
  });
});
