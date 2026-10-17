import type { ListActivityDto } from '../../server/http/contracts.ts';
import { formatDateTime } from './datetime.ts';
import { sourceLabel } from './labels.ts';

type Event = ListActivityDto['events'][number];
export const activityLabel: Record<Event['action'], string> = {
  created: 'Created this list',
  imported: 'Imported this list from a backup',
  'settings-edited': 'Updated list settings',
  published: 'Published this list',
  archived: 'Archived this list',
  'voting-closed': 'Closed voting',
  'visibility-changed': 'Changed who can see this list',
  'score-privacy-changed': 'Changed individual score privacy',
  'entry-set-aside': 'Set an entry aside',
  'entry-returned': 'Returned an entry to the main ranking',
  'explanation-edited': 'Updated a set-aside explanation',
  'entry-deleted': 'Permanently deleted an entry',
};
export const activityField: Record<string, string> = {
  title: 'Title',
  slug: 'Address',
  description: 'Description',
  itemSource: 'Item type',
  entryMode: 'Adding items',
  scale: 'Score scale',
  maxNominationsPerMember: 'Nomination limit',
  resultsVisibility: 'When standings appear',
  ranking: 'Votes before a confirmed rank',
  showNominators: 'Nominator names',
  requiredRoleIds: 'Participation roles',
  scoreVisibility: 'Individual scores',
  visibility: 'List visibility',
  'schedule.opensAt': 'Participation opens',
  'schedule.nominationsCloseAt': 'Nominations close',
  'schedule.closesAt': 'Voting closes',
  'draftSchedule.opensAt': 'Planned opening',
  'draftSchedule.nominationsCloseAt': 'Planned nomination deadline',
  'draftSchedule.closesAt': 'Planned voting deadline',
};

export const activityValue = (field: string, value: string | null): string => {
  if (value === null || value === 'null')
    return field === 'maxNominationsPerMember' ? 'Unlimited' : 'Not set';
  if (field.startsWith('schedule.') || field.startsWith('draftSchedule.'))
    return formatDateTime(value);
  if (field === 'visibility') return value === 'hidden' ? 'Admins only' : 'Community members';
  // Settings values are structured JSON produced by the server, never arbitrary saved prose.
  const parsed: unknown = JSON.parse(value);
  if (field === 'showNominators') return parsed === true ? 'Visible' : 'Hidden';
  if (field === 'scoreVisibility') return parsed === 'public' ? 'Named scores' : 'Private scores';
  if (field === 'resultsVisibility')
    return parsed === 'live' ? 'While voting is open' : 'After voting closes';
  if (field === 'entryMode')
    return parsed === 'seeded' ? 'Include the whole collection' : 'Member nominations';
  if (field === 'requiredRoleIds' && Array.isArray(parsed))
    return parsed.length === 0 ? 'All members' : parsed.join(', ');
  if (typeof parsed === 'object' && parsed !== null) {
    if ('kind' in parsed && typeof parsed.kind === 'string' && parsed.kind in sourceLabel) {
      const label: unknown = Reflect.get(sourceLabel, parsed.kind);
      if (typeof label === 'string') return label;
    }
    if ('min' in parsed && 'max' in parsed) return `${String(parsed.min)} to ${String(parsed.max)}`;
    if ('minVotes' in parsed) return String(parsed.minVotes);
  }
  return typeof parsed === 'string' || typeof parsed === 'number' ? String(parsed) : value;
};
