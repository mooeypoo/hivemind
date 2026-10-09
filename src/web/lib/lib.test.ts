// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { durationText, fromLocalInput, toLocalInput } from './datetime.ts';
import { clearDraft, loadDraft, saveDraft } from './drafts.ts';
import { isLoginOutcome, loginMessage } from './labels.ts';
import { nextEvent } from './next-event.ts';
import { slugify } from './slugify.ts';

describe('datetime', () => {
  test('a local input value round-trips through ISO', () => {
    expect(toLocalInput(fromLocalInput('2026-03-29T01:30') ?? '')).toBe('2026-03-29T01:30');
    expect(toLocalInput(fromLocalInput('2026-10-25T12:00') ?? '')).toBe('2026-10-25T12:00');
  });

  test('an empty or invalid input is null', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('not a date')).toBeNull();
  });

  test.each([
    [30_000, 'less than a minute'],
    [60_000, '1 minute'],
    [12 * 60_000, '12 minutes'],
    [5 * 3_600_000 + 2 * 60_000, '5 hours 2 minutes'],
    [3_600_000, '1 hour'],
    [3 * 86_400_000 + 4 * 3_600_000, '3 days 4 hours'],
    [86_400_000, '1 day'],
  ])('%i ms reads as "%s"', (ms, text) => {
    expect(durationText(ms)).toBe(text);
  });
});

describe('nextEvent', () => {
  const schedule = {
    opensAt: '2026-03-10T00:00:00.000Z',
    nominationsCloseAt: '2026-03-15T00:00:00.000Z',
    closesAt: '2026-03-20T00:00:00.000Z',
  };
  const now = new Date('2026-03-12T00:00:00Z');

  test('before opening: when it opens', () => {
    expect(nextEvent({ lifecycle: 'scheduled', schedule, entryMode: 'nominations' }, now)).toEqual({
      label: 'Opens',
      at: schedule.opensAt,
    });
  });

  test('while nominating: when nominations close, then when the list closes', () => {
    const open = { lifecycle: 'open', schedule, entryMode: 'nominations' } as const;
    expect(nextEvent(open, now)?.label).toBe('Nominations close');
    expect(nextEvent(open, new Date('2026-03-16T00:00:00Z'))?.label).toBe('Voting closes');
  });

  test('an open-ended list has nothing to count down to once nominations are done', () => {
    const openEnded = { ...schedule, nominationsCloseAt: null, closesAt: null };
    expect(
      nextEvent({ lifecycle: 'open', schedule: openEnded, entryMode: 'nominations' }, now),
    ).toBeNull();
  });

  test('a seeded list goes straight to its close; a closed list has no next event', () => {
    expect(nextEvent({ lifecycle: 'open', schedule, entryMode: 'seeded' }, now)?.label).toBe(
      'Voting closes',
    );
    expect(nextEvent({ lifecycle: 'closed', schedule, entryMode: 'nominations' }, now)).toBeNull();
  });
});

describe('slugify', () => {
  test.each([
    ['Best Sci-Fi Movies', 'best-sci-fi-movies'],
    ['  Árvores & Flores!! 2026 ', 'arvores-flores-2026'],
    ['---', ''],
  ])('%j → %j', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  test('stays within 60 characters without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('login messages', () => {
  test('cover every outcome the server sends', () => {
    expect(isLoginOutcome('identity.not-a-member')).toBe(true);
    expect(isLoginOutcome('something-else')).toBe(false);
    expect(Object.keys(loginMessage)).toHaveLength(6);
  });
});

describe('drafts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('are kept per key until cleared', () => {
    saveDraft('editor', { title: 'Half done' });
    expect(loadDraft('editor')).toEqual({ title: 'Half done' });
    clearDraft('editor');
    expect(loadDraft('editor')).toBeNull();
  });

  test('quietly do nothing when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => {
      saveDraft('x', 1);
    }).not.toThrow();
  });
});
