import type { ListDto, RoleLabelDto } from '../../server/http/contracts.ts';
import { describeAudience } from './access.ts';
import { formatDateTime } from './datetime.ts';
import { sourceLabel } from './labels.ts';

/** Human-readable, complete settings comparison; never includes entries or scores. */
export const compareListSettings = (
  latest: ListDto,
  yours: ListDto,
  roles: readonly RoleLabelDto[],
) => {
  const describe = (list: ListDto) => {
    const dates =
      list.lifecycle === 'draft' ? (list.draftSchedule ?? list.schedule) : list.schedule;
    const date = (value: string | null | undefined, fallback: string) =>
      value == null ? fallback : formatDateTime(value);
    return {
      Status: list.lifecycle,
      Title: list.title,
      Address: list.slug,
      Description: list.description || 'No description',
      'Item type': sourceLabel[list.itemSource.kind],
      Collection: list.itemSource.kind === 'preset' ? list.itemSource.presetId : 'Not used',
      'Adding items': list.entryMode === 'seeded' ? 'Include the whole collection' : 'Nominations',
      'Score scale': `${String(list.scale.min)}–${String(list.scale.max)}`,
      'Nomination limit':
        list.maxNominationsPerMember === null ? 'Unlimited' : String(list.maxNominationsPerMember),
      Standings: list.resultsVisibility === 'live' ? 'Live' : 'Hidden until voting ends',
      'Individual scores': list.scoreVisibility === 'public' ? 'Named' : 'Private',
      'Nominator names': list.showNominators ? 'Visible' : 'Hidden',
      'Votes before a confirmed rank': String(list.ranking.minVotes),
      'Who can view': describeAudience(list.access.view, roles),
      'Who can nominate':
        list.entryMode === 'seeded' ? 'Not used' : describeAudience(list.access.nominate, roles),
      'Who can rate': describeAudience(list.access.rate, roles),
      Opens: date(dates?.opensAt, 'When published'),
      'Nominations close': date(dates?.nominationsCloseAt, 'No separate deadline'),
      'Voting closes': date(dates?.closesAt, 'No automatic end'),
    };
  };
  const saved = describe(latest);
  const proposed = describe(yours);
  return (Object.keys(saved) as (keyof typeof saved)[])
    .filter((label) => saved[label] !== proposed[label])
    .map((label) => ({ label, latest: saved[label], yours: proposed[label] }));
};
