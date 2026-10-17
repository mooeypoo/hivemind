import { expect, test } from 'vitest';
import { openTmdbList } from '../testing/fixtures.ts';
import { compareListSettings } from './list-settings.ts';

test('settings comparison covers every admin choice and date without technical version noise', () => {
  const saved = openTmdbList({ lifecycle: 'draft', schedule: null });
  expect(compareListSettings(saved, { ...saved, settingsVersion: 42 }, [])).toEqual([]);
  const yours = openTmdbList({
    lifecycle: 'draft',
    schedule: null,
    title: 'New title',
    slug: 'new-address',
    description: 'Changed description',
    itemSource: { kind: 'preset', presetId: 'collection-2' },
    entryMode: 'seeded',
    scale: { min: 0, max: 5 },
    maxNominationsPerMember: null,
    resultsVisibility: 'after-close',
    scoreVisibility: 'public',
    showNominators: false,
    ranking: { strategy: 'bayesian', minVotes: 10 },
    requiredRoleIds: ['123456'],
    visibility: 'hidden',
    draftSchedule: {
      opensAt: '2099-01-01T12:00:00Z',
      nominationsCloseAt: '2099-01-02T12:00:00Z',
      closesAt: '2099-01-03T12:00:00Z',
    },
  });
  const rows = compareListSettings(saved, yours, [{ roleId: '123456', name: 'Film Club' }]);
  expect(rows.map((row) => row.label)).toEqual([
    'Title',
    'Address',
    'Description',
    'Item type',
    'Collection',
    'Adding items',
    'Score scale',
    'Nomination limit',
    'Standings',
    'Individual scores',
    'Nominator names',
    'Votes before a confirmed rank',
    'Who can take part',
    'List visibility',
    'Opens',
    'Nominations close',
    'Voting closes',
  ]);
  expect(rows.find((row) => row.label === 'Who can take part')?.yours).toBe('Film Club (123456)');
});
