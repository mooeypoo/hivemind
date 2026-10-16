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
  test('separate is the default, with independent ranks and explanations; combined is reversible', async () => {
    const aside = { ...entry('b', 'Wingspan'), setAsideReason: 'Outside this list’s criteria' };
    const main = row('a', 'Root', 1, 6, 3);
    const marked = row('b', 'Wingspan', 1, 10, 3);
    const panel = mount(StandingsBoard, {
      props: {
        board: {
          hidden: false,
          computedAt: new Date().toISOString(),
          minVotes: 2,
          rows: [marked, { ...main, rank: 2, score: 7 }],
          groups: { main: [main], setAside: [marked] },
        },
        entries: [entry('a', 'Root'), aside],
        scale: { min: 1, max: 10 },
      },
    });
    expect(panel.get<HTMLDetailsElement>('.ranking-options').element.open).toBe(false);
    expect(panel.get('.ranking-options > summary').text()).toBe('Ranking view: Separate rankings');
    panel.get<HTMLDetailsElement>('.ranking-options').element.open = true;
    await panel.get('.ranking-options').trigger('toggle');
    expect(panel.get<HTMLInputElement>('input[value=separate]').element.checked).toBe(true);
    expect(panel.get('fieldset').text()).toContain('Separate rankings');
    expect(panel.get('fieldset').text()).toContain('Combine ranking');
    expect(panel.text()).toContain(
      'Set-aside entries are ranked in their own group below the main list.',
    );
    expect(panel.findAll('.podium__place')).toHaveLength(1);
    expect(panel.get('.set-aside-ranking').text()).toContain(aside.setAsideReason);
    expect(panel.get('[aria-label="Set-aside rank 1"]').text()).toBe('1');
    await panel.get('input[value=combined]').setValue(true);
    expect(panel.get('.ranking-options > summary').text()).toBe('Ranking view: Combine ranking');
    panel.get<HTMLDetailsElement>('.ranking-options').element.open = false;
    await panel.get('.ranking-options').trigger('toggle');
    expect(panel.text()).toContain('Set-aside entries are included in the main list’s ranking.');
    expect(panel.find('.set-aside-ranking').exists()).toBe(false);
    expect(panel.findAll('.podium__place')).toHaveLength(2);
    expect(panel.text()).toContain(aside.setAsideReason);
    panel.get<HTMLDetailsElement>('.ranking-options').element.open = true;
    await panel.get('.ranking-options').trigger('toggle');
    await panel.get('input[value=separate]').setValue(true);
    expect(panel.findAll('.podium__place')).toHaveLength(1);
    panel.unmount();
  });

  test.each(['provisional', 'unrated'] as const)(
    'set-aside %s entries stay visible with their reason',
    async (state) => {
      const marked = row(
        'b',
        'Wingspan',
        null,
        state === 'unrated' ? null : 8,
        state === 'unrated' ? 0 : 1,
        true,
        state === 'unrated' ? 2 : 1,
      );
      const panel = mount(StandingsBoard, {
        props: {
          board: {
            hidden: false,
            computedAt: new Date().toISOString(),
            minVotes: 2,
            rows: [marked],
            groups: { main: [], setAside: [marked] },
          },
          entries: [{ ...entry('b', 'Wingspan'), setAsideReason: '<b>Not in scope</b>' }],
          scale: { min: 1, max: 10 },
        },
      });
      expect(panel.text()).toContain('All entries have been set aside');
      expect(panel.get('.set-aside-ranking').text()).toContain('Wingspan');
      expect(panel.get('.set-aside-ranking').text()).toContain('<b>Not in scope</b>');
      expect(panel.find('.set-aside-notice b').exists()).toBe(false);
      expect(panel.find('.podium').exists()).toBe(false);
      await panel.get('input[value=combined]').setValue(true);
      expect(panel.text()).toContain('Wingspan');
      expect(panel.get('.set-aside-notice').text()).toContain('<b>Not in scope</b>');
      panel.unmount();
    },
  );

  test('no ranking-view control appears without marked entries or for sealed results', () => {
    for (const value of [board([]), { hidden: true as const, revealsAt: null }]) {
      const panel = mount(StandingsBoard, {
        props: { board: value, entries: [], scale: { min: 1, max: 10 } },
      });
      expect(panel.find('fieldset').exists()).toBe(false);
      panel.unmount();
    }
  });

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

  test('allows changing a previously rated entry directly from StandingsBoard', async () => {
    const panel = mount(StandingsBoard, {
      props: {
        board: board([row('a', 'Root', 1, 9, 2)]),
        entries: [entry('a', 'Root')],
        scale: { min: 1, max: 10 },
        myScores: { a: 9 },
        canVote: true,
        scoreState: () => ({
          value: 9,
          saving: false,
          error: null,
        }),
      },
      attachTo: document.body,
    });

    try {
      const mineButton = panel
        .findAll('.standing__mine-button')
        .find((btn) => btn.text().includes('You: 9') || btn.text().includes('you: 9'));
      expect(mineButton).toBeDefined();
      await mineButton?.trigger('click');

      const dialog = panel.get('dialog');
      expect(dialog.element.open).toBe(true);
      expect(dialog.find('.score-input').exists()).toBe(true);

      const radio = dialog.get('.score-chip input[type=radio][value="7"]');
      await radio.setValue();
      expect(panel.emitted('rate')).toEqual([[{ entryId: 'a', score: 7 }]]);
    } finally {
      panel.unmount();
    }
  });
});
