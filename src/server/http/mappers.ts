import type { EntryView, ListDetail, ListView, Schedule } from '../../contexts/lists/index.ts';
import type { EntryDto, ItemSourceDto, ListDetailDto, ListDto, ScheduleDto } from './contracts.ts';

const scheduleDto = (schedule: Schedule | null): ScheduleDto | null =>
  schedule === null
    ? null
    : {
        opensAt: schedule.opensAt.toISOString(),
        nominationsCloseAt: schedule.nominationsCloseAt?.toISOString() ?? null,
        closesAt: schedule.closesAt.toISOString(),
      };

export const listDto = (view: ListView): ListDto => ({
  id: view.id,
  title: view.title,
  slug: view.slug,
  description: view.description,
  itemSource: view.itemSource as ItemSourceDto,
  entryMode: view.entryMode,
  scale: view.scale,
  maxNominationsPerMember: view.maxNominationsPerMember,
  resultsVisibility: view.resultsVisibility,
  ranking: view.ranking,
  showNominators: view.showNominators,
  requiredRoleIds: view.requiredRoleIds,
  lifecycle: view.lifecycle,
  schedule: scheduleDto(view.schedule),
  viewer: view.viewer,
});

export const entryDto = (entry: EntryView): EntryDto => ({
  id: entry.id,
  item: entry.item,
  nominatedBy: entry.nominatedBy,
  isMine: entry.isMine,
  nominatedAt: entry.nominatedAt.toISOString(),
});

export const listDetailDto = (detail: ListDetail): ListDetailDto => ({
  ...listDto(detail),
  entries: detail.entries.map(entryDto),
  snapshotsExpireAt: detail.snapshotsExpireAt?.toISOString() ?? null,
});
