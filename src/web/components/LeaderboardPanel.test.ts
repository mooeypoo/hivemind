// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LeaderboardDto, PublicScoresDto } from '../../server/http/contracts.ts';
import { stubApi } from '../testing/fixtures.ts';
import LeaderboardPanel from './LeaderboardPanel.vue';

const item = (title: string) => ({
  source: 'freeform',
  externalId: title,
  title,
  subtitle: null,
  imageUrl: null,
});

const mountWith = async (
  board: LeaderboardDto,
  myScores: Record<string, number> = {},
  publicScores?: PublicScoresDto,
) => {
  stubApi({ 'GET /api/lists/games/leaderboard': () => Response.json(board) });
  const panel = mount(LeaderboardPanel, {
    props: { list: 'games', myScores, ...(publicScores === undefined ? {} : { publicScores }) },
  });
  await flushPromises();
  return panel;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LeaderboardPanel', () => {
  test('lists ranks, scores, votes, provisional tags and my own score', async () => {
    const panel = await mountWith(
      {
        hidden: false,
        computedAt: new Date().toISOString(),
        minVotes: 2,
        rows: [
          {
            rank: 1,
            entryId: 'a',
            item: item('Root'),
            score: 7.67,
            average: 8,
            votes: 2,
            provisional: false,
            votesNeeded: 0,
          },
          {
            rank: 2,
            entryId: 'b',
            item: item('Wingspan'),
            score: 6.89,
            average: 6,
            votes: 1,
            provisional: true,
            votesNeeded: 1,
          },
          {
            rank: null,
            entryId: 'c',
            item: item('Azul'),
            score: null,
            average: null,
            votes: 0,
            provisional: true,
            votesNeeded: 2,
          },
        ],
      },
      { a: 9 },
    );
    const cell = (row: number, part: string) =>
      panel
        .findAll('.ranking__row')
        [row]?.find(`.ranking__${part}`)
        .text()
        .replace(/\s+/g, ' ')
        .trim();
    expect([cell(0, 'rank'), cell(0, 'title'), cell(0, 'numbers')]).toEqual([
      '1',
      'Root',
      '7.7 · 2 votes · you: 9',
    ]);
    expect(cell(1, 'title')).toBe('Wingspan Provisional · needs 1 more vote');
    expect([cell(2, 'rank'), cell(2, 'numbers')]).toEqual(['–', 'No votes yet']);
    expect(panel.text()).toContain('Updated just now');
  });

  test('explains when results are hidden until the list closes', async () => {
    const panel = await mountWith({ hidden: true, revealsAt: '2026-01-10T00:00:00.000Z' });
    expect(panel.text()).toContain('Results are revealed when voting closes');
    expect(panel.find('.ranking').exists()).toBe(false);
  });

  test('an open-ended list reveals results when an Admin closes voting', async () => {
    const panel = await mountWith({ hidden: true, revealsAt: null });
    expect(panel.text()).toContain('Results are revealed when an Admin closes voting.');
  });

  test('says when nobody has voted yet', async () => {
    const panel = await mountWith({
      hidden: false,
      computedAt: new Date().toISOString(),
      minVotes: 2,
      rows: [
        {
          rank: null,
          entryId: 'c',
          item: item('Azul'),
          score: null,
          average: null,
          votes: 0,
          provisional: true,
          votesNeeded: 2,
        },
      ],
    });
    expect(panel.text()).toContain('No votes yet.');
  });

  test('shows a voter disclosure under each ranked entry when scores are public', async () => {
    const panel = await mountWith(
      {
        hidden: false,
        computedAt: new Date().toISOString(),
        minVotes: 1,
        rows: [
          {
            rank: 1,
            entryId: 'a',
            item: item('Root'),
            score: 9,
            average: 9,
            votes: 1,
            provisional: false,
            votesNeeded: 0,
          },
        ],
      },
      {},
      { visible: true, entries: { a: [{ displayName: 'Ada', score: 9 }] } },
    );
    expect(panel.find('.ranking__title').text()).toContain('Who voted (1)');
    panel.find('.public-scores summary').element.dispatchEvent(new Event('click'));
    expect(panel.text()).toContain('Ada: 9');
  });
});
