import type { MemberActor } from '../../../shared/kernel/index.ts';
import {
  activityEvent,
  retainActivityIdentity,
  type ActivityAction,
  type ActivityChange,
} from './activity.ts';
import type { List } from './list.ts';

export const appendListActivity = (
  list: List,
  action: ActivityAction,
  admin: MemberActor,
  now: Date,
  changes: readonly ActivityChange[] = [],
): List => ({
  ...list,
  activity: [
    ...retainActivityIdentity(list.activity ?? [], now),
    activityEvent(
      `settings-${String(list.settingsVersion ?? 0)}-${action}`,
      action,
      admin,
      now,
      changes,
    ),
  ],
});

export const settingsChanges = (before: List, after: List): readonly ActivityChange[] => {
  const changes: ActivityChange[] = [];
  for (const field of Object.keys(after.config) as (keyof List['config'])[]) {
    if (JSON.stringify(before.config[field]) === JSON.stringify(after.config[field])) continue;
    const prose = field === 'title' || field === 'slug' || field === 'description';
    changes.push({
      field,
      before: prose ? null : JSON.stringify(before.config[field]),
      after: prose ? null : JSON.stringify(after.config[field]),
    });
  }
  for (const field of ['schedule', 'draftSchedule', 'visibility'] as const) {
    if (JSON.stringify(before[field] ?? null) === JSON.stringify(after[field] ?? null)) continue;
    if (field === 'visibility')
      changes.push({ field, before: before.visibility, after: after.visibility });
    else {
      for (const date of ['opensAt', 'nominationsCloseAt', 'closesAt'] as const) {
        const old = before[field]?.[date]?.toISOString() ?? null;
        const next = after[field]?.[date]?.toISOString() ?? null;
        if (old !== next) changes.push({ field: `${field}.${date}`, before: old, after: next });
      }
    }
  }
  return changes;
};
