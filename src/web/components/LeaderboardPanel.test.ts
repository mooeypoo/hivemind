// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
  LeaderboardDto,
  LeaderboardRowDto,
  PublicScoresDto,
} from '../../server/http/contracts.ts';
import { openTmdbList, stubApi } from '../testing/fixtures.ts';
import LeaderboardPanel from './LeaderboardPanel.vue';
import StandingsBoard from './StandingsBoard.vue';

const item = (title: string) => ({
  source: 'freeform',
  externalId: title,
  title,
  subtitle: null,
  imageUrl: null,
});
const entry = (id: string, title: string) => ({
  id,
  item: item(title),
  nominatedBy: null,
  isMine: false,
  nominatedAt: '2026-01-01T00:00:00.000Z',
});
const row = (
  entryId: string,
  title: string,
  rank: number | null,
  score: number | null,
  votes: number,
  provisional = false,
  votesNeeded = 0,
): LeaderboardRowDto => ({
  rank,
  entryId,
  item: item(title),
  score,
  votes,
  provisional,
  votesNeeded,
});
const list = openTmdbList({
  slug: 'games',
  entries: [
    entry('a', 'Root'),
    entry('b', 'Wingspan'),
    entry('c', 'Azul'),
    entry('d', 'Catan'),
    entry('e', 'Carcassonne'),
    entry('f', 'Cascadia'),
  ],
});
const board = (rows: LeaderboardRowDto[], minVotes = 2): LeaderboardDto => ({
  hidden: false,
  computedAt: new Date().toISOString(),
  minVotes,
  rows,
});

const mountWith = async (
  leaderboard: LeaderboardDto,
  myScores: Record<string, number> = {},
  publicScores?: PublicScoresDto,
) => {
  stubApi({ 'GET /api/lists/games/leaderboard': () => Response.json(leaderboard) });
  const panel = mount(LeaderboardPanel, {
    props: { list, myScores, ...(publicScores === undefined ? {} : { publicScores }) },
  });
  await flushPromises();
  return panel;
};
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const cells = (row: { element: Element }) =>
  [...row.element.children]
    .filter((cell) => !cell.classList.contains('ranking__art'))
    .map((cell) => squash(cell.textContent))
    .join(' | ');
/** A podium place as read: medal, then each line, skipping the decorative art. */
const placeText = (place: { element: Element }) =>
  [...place.element.children]
    .map((child) =>
      child.classList.contains('podium__art')
        ? (child.querySelector('.podium__medal')?.textContent ?? '')
        : child.textContent,
    )
    .map(squash)
    .join(' ');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LeaderboardPanel', () => {
  test.each(['ranked', 'provisional', 'unrated', 'podium'] as const)(
    '%s entries open read-only movie details from their title and art',
    async (state) => {
      const movie = {
        ...entry('movie', 'Blade Runner'),
        withdrawalToken: 'claim-movie',
        item: {
          source: 'tmdb-movie',
          externalId: '78',
          title: 'Blade Runner',
          subtitle: '1982',
          imageUrl: 'https://image.tmdb.org/t/p/w342/poster.jpg',
          director: 'Ridley Scott',
          overview: 'A blade runner must pursue replicants.',
          cast: ['Harrison Ford', 'Rutger Hauer'],
        },
      };
      const movieRow = {
        ...row('movie', movie.item.title, state === 'podium' ? 1 : 4, 8, 4),
        item: movie.item,
        ...(state === 'provisional' ? { rank: null, provisional: true, votesNeeded: 1 } : {}),
        ...(state === 'unrated' ? { rank: null, score: null, votes: 0 } : {}),
      };
      const panel = mount(StandingsBoard, {
        props: {
          board: board([
            ...(state === 'unrated' ? [row('a', 'Root', 1, 9, 4)] : []),
            ...(state === 'ranked'
              ? [
                  row('a', 'Root', 1, 9, 4),
                  row('b', 'Wingspan', 2, 9, 4),
                  row('c', 'Azul', 3, 9, 4),
                ]
              : []),
            movieRow,
          ]),
          entries: [movie],
          scale: { min: 1, max: 10 },
          myScores: { movie: 7 },
          publicScores: { visible: true, entries: { movie: [{ displayName: 'Ada', score: 9 }] } },
        },
        attachTo: document.body,
      });
      try {
        if (state !== 'podium') {
          expect(panel.get('.ranking__art img').attributes('src')).toBe(movie.item.imageUrl);
          expect(panel.get('.ranking__metadata').text()).toBe('1982 · Directed by Ridley Scott');
        }
        for (const selector of ['.standing__title-button', '.standing__art-button']) {
          const trigger = panel
            .findAll(selector)
            .find(
              (button) =>
                button.text() === movie.item.title ||
                button.attributes('aria-label')?.endsWith(movie.item.title),
            );
          expect(trigger).toBeDefined();
          await trigger?.trigger('click');
          const dialog = panel.get('dialog');
          expect(dialog.element.open).toBe(true);
          expect(dialog.text()).toContain(movie.item.overview);
          expect(dialog.text()).toContain(movie.item.director);
          expect(dialog.text()).toContain('Harrison Ford, Rutger Hauer');
          expect(dialog.text()).toContain('Ada: 9');
          expect(dialog.text()).toContain('Your score: 7');
          expect(dialog.text()).not.toContain('Withdraw nomination');
          expect(dialog.find('input').exists()).toBe(false);
          await dialog.get('button').trigger('click');
          expect(dialog.element.open).toBe(false);
        }
      } finally {
        panel.unmount();
      }
    },
  );

  test('ranks entries with enough votes; a high-scoring provisional one waits below', async () => {
    const panel = await mountWith(
      board([
        row('a', 'Root', 1, 7.67, 3),
        row('d', 'Catan', 2, 6.89, 3),
        row('e', 'Carcassonne', 2, 6.89, 4),
        row('c', 'Azul', 4, 5.1, 4),
        row('b', 'Wingspan', null, 9.2, 1, true, 1),
        row('f', 'Cascadia', null, null, 0, true, 2),
      ]),
      { a: 9, c: 6 },
    );
    const podium = panel.findAll('.podium__place').map(placeText);
    expect(podium).toEqual([
      '1 Root 7.7 · 3 votes You: 9',
      '2 Catan 6.9 · 3 votes',
      '2 Carcassonne 6.9 · 4 votes',
    ]);
    const rest = panel.findAll('[aria-label="The rest of the ranking"] li');
    expect(rest.map(cells)).toEqual(['4 | Azul | 5.1 · 4 votes · you: 6']);
    expect(panel.get('.standings__provisional h3').text()).toBe('Not enough votes yet');
    expect(panel.findAll('.standings__provisional li').map(cells)).toEqual([
      '– | Wingspan, Needs 1 more vote | 9.2 · 1 vote',
    ]);
    expect(panel.findAll('.standings__unrated li').map(cells)).toEqual([
      '– | Cascadia | No votes yet',
    ]);
    expect(panel.text()).toContain(
      'Each score blends an entry’s average rating with the average across all ratings.',
    );
    expect(panel.text()).not.toContain('avg ');
    expect(panel.text()).toContain('Updated just now');
  });

  test('before anything has enough votes, there is no podium, only the waiting entries', async () => {
    const panel = await mountWith(board([row('b', 'Wingspan', null, 9, 1, true, 1)]));
    expect(panel.find('.podium').exists()).toBe(false);
    expect(panel.text()).toContain('No entry has enough votes for a place yet.');
    expect(panel.findAll('.standings__provisional li')).toHaveLength(1);
  });

  test('explains when results are sealed until the list closes', async () => {
    const panel = await mountWith({ hidden: true, revealsAt: '2026-01-10T00:00:00.000Z' });
    expect(panel.text()).toContain('Sealed until voting closes');
    expect(panel.text()).toContain('Results are revealed when voting closes');
    expect(panel.find('.podium').exists()).toBe(false);
  });

  test('an open-ended list reveals results when an Admin closes voting', async () => {
    const panel = await mountWith({ hidden: true, revealsAt: null });
    expect(panel.text()).toContain('Results are revealed when an Admin closes voting.');
  });

  test('says when nobody has voted yet', async () => {
    const panel = await mountWith(board([row('c', 'Azul', null, null, 0, true, 2)]));
    expect(panel.text()).toContain('No votes yet.');
    expect(panel.find('.podium').exists()).toBe(false);
  });

  test('shows who voted under each ranked entry when scores are public', async () => {
    const panel = await mountWith(
      board([row('a', 'Root', 1, 9, 1)], 1),
      {},
      { visible: true, entries: { a: [{ displayName: 'Ada', score: 9 }] } },
    );
    expect(panel.get('.podium__place').text()).toContain('Who voted (1)');
    panel.find('.public-scores summary').element.dispatchEvent(new Event('click'));
    expect(panel.text()).toContain('Ada: 9');
  });

  test('allows rating an unrated entry directly from StandingsBoard', async () => {
    const panel = mount(StandingsBoard, {
      props: {
        board: board([row('a', 'Root', 1, 9, 2), row('b', 'Wingspan', 2, 8, 2)]),
        entries: [entry('a', 'Root'), entry('b', 'Wingspan')],
        scale: { min: 1, max: 10 },
        myScores: { a: 9 },
        canVote: true,
        scoreState: (id: string) => ({
          value: id === 'a' ? 9 : null,
          saving: false,
          error: null,
        }),
      },
      attachTo: document.body,
    });

    try {
      const rateButton = panel
        .findAll('.standing__rate-button')
        .find((btn) => btn.text() === '+ Rate');
      expect(rateButton).toBeDefined();
      await rateButton?.trigger('click');

      const dialog = panel.get('dialog');
      expect(dialog.element.open).toBe(true);
      expect(dialog.find('.score-input').exists()).toBe(true);

      const radio = dialog.get('.score-chip input[type=radio][value="8"]');
      await radio.setValue();
      expect(panel.emitted('rate')).toEqual([[{ entryId: 'b', score: 8 }]]);
    } finally {
      panel.unmount();
    }
  });
});
