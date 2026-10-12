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
  average: score === null ? null : score + 0.5,
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
  [...row.element.children].map((cell) => squash(cell.textContent)).join(' | ');
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
  test('puts the top three on a podium, provisional ones in place, then the rest', async () => {
    const panel = await mountWith(
      board([
        row('a', 'Root', 1, 7.67, 2),
        row('b', 'Wingspan', 2, 6.89, 1, true, 1),
        row('d', 'Catan', 2, 6.89, 3),
        row('e', 'Carcassonne', 4, 5.1, 4),
        row('c', 'Azul', null, null, 0, true, 2),
      ]),
      { a: 9, e: 6 },
    );
    const podium = panel.findAll('.podium__place').map(placeText);
    expect(podium).toEqual([
      '1 Root 7.7 · 2 votes · avg 8.2 You: 9',
      '2 Wingspan 6.9 · 1 vote · avg 7.4 Provisional · needs 1 more vote',
      '2 Catan 6.9 · 3 votes · avg 7.4',
    ]);
    const rest = panel.findAll('[aria-label="The rest of the ranking"] li');
    expect(rest.map(cells)).toEqual(['4 | Carcassonne | 5.1 · 4 votes · avg 5.6 · you: 6']);
    expect(panel.findAll('.standings__unrated li').map(cells)).toEqual(['– | Azul | No votes yet']);
    expect(panel.text()).toContain('Updated just now');
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
});
