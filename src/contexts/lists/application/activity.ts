import {
  err,
  ok,
  requireAdmin,
  withConflictRetry,
  type Actor,
  type Clock,
  type DomainError,
  type MemberId,
  type Result,
} from '../../../shared/kernel/index.ts';
import {
  anonymiseActivity,
  retainActivityIdentity,
  type ActivityEvent,
} from '../domain/activity.ts';
import { listsErrors } from '../domain/errors.ts';
import type { EntryRepository, ListRepository, SlugIndex } from './ports.ts';
import { findList } from './find-list.ts';

interface Deps {
  readonly lists: ListRepository;
  readonly entries: EntryRepository;
  readonly clock: Clock;
}

export interface ActivityView {
  readonly id: string;
  readonly action: ActivityEvent['action'];
  readonly at: string;
  readonly adminName: string | null;
  readonly entryTitle: string | null;
  readonly changes: ActivityEvent['changes'];
}
export interface ActivityCursor {
  readonly at: string;
  readonly id: string;
}
export interface ActivityList {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
}
export interface AdminActivityView {
  readonly events: readonly (ActivityView & { readonly list: ActivityList })[];
  readonly lists: readonly ActivityList[];
  readonly nextCursor: ActivityCursor | null;
}

const compareActivity = (a: ActivityCursor, b: ActivityCursor): number =>
  b.at.localeCompare(a.at) ||
  b.id.localeCompare(a.id, 'en', { numeric: true }) ||
  b.id.localeCompare(a.id, 'en');

const view = (event: ActivityEvent, entryTitle: string | null): ActivityView => ({
  id: event.id,
  action: event.action,
  at: event.at.toISOString(),
  adminName: event.admin?.displayName ?? null,
  entryTitle,
  changes: event.changes,
});

export const makeGetListActivity =
  (deps: Deps & { readonly slugs: SlugIndex }) =>
  async (
    actor: Actor,
    input: { readonly list: string },
  ): Promise<Result<readonly ActivityView[], DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const found = await findList(deps, admin.value, input.list);
    if (!found.ok) return found;
    const now = deps.clock.now();
    const events = retainActivityIdentity(found.value.value.activity ?? [], now).map((event) =>
      view(event, null),
    );
    for (const entry of await deps.entries.forList(found.value.value.id)) {
      events.push(
        ...retainActivityIdentity(entry.activity ?? [], now).map((event) =>
          view({ ...event, id: `entry:${entry.id}:${event.id}` }, entry.item.title),
        ),
      );
    }
    return ok(events.sort(compareActivity));
  };

/** Query the existing records, never a second store of retained identities. */
export const makeGetAdminActivity =
  (deps: Deps & { readonly slugs: SlugIndex }) =>
  async (
    actor: Actor,
    input: { readonly list?: string; readonly cursor?: ActivityCursor },
  ): Promise<Result<AdminActivityView, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const lists = (await deps.lists.all())
      .map((list) => ({ id: list.id, title: list.config.title, slug: list.config.slug }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    const match =
      lists.find((list) => list.id === input.list) ??
      lists.find((list) => list.slug === input.list);
    const selected = input.list === undefined ? lists : match === undefined ? [] : [match];
    if (input.list !== undefined && selected.length === 0) return err(listsErrors.notFound);
    const events: (ActivityView & { readonly list: ActivityList })[] = [];
    const getActivity = makeGetListActivity(deps);
    // Bound cross-list fan-out; a filtered query never reads other lists' entries.
    for (let offset = 0; offset < selected.length; offset += 4) {
      const batch = await Promise.all(
        selected.slice(offset, offset + 4).map(async (list) => ({
          list,
          result: await getActivity(admin.value, { list: list.id }),
        })),
      );
      for (const { list, result } of batch) {
        if (!result.ok) return result;
        events.push(
          ...result.value.map((event) => ({
            ...event,
            id: JSON.stringify([list.id, event.id]),
            list,
          })),
        );
      }
    }
    events.sort(compareActivity);
    const cursor = input.cursor;
    const matching =
      cursor === undefined ? events : events.filter((event) => compareActivity(event, cursor) > 0);
    const page = matching.slice(0, 20);
    const last = page.at(-1);
    return ok({
      events: page,
      lists,
      nextCursor:
        matching.length > page.length && last !== undefined ? { at: last.at, id: last.id } : null,
    });
  };

/** CAS keeps retention and erasure from overwriting concurrent settings or moderation. */
export const makeAnonymiseActivity =
  (deps: Deps) =>
  async (memberId?: MemberId): Promise<Result<number, DomainError>> => {
    const now = deps.clock.now();
    const scrub = (events: readonly ActivityEvent[]) =>
      memberId === undefined
        ? retainActivityIdentity(events, now)
        : anonymiseActivity(events, memberId);
    let removed = 0;
    for (const list of await deps.lists.all()) {
      const result = await withConflictRetry(async () => {
        const current = await deps.lists.get(list.id);
        if (current === null) return ok(0);
        const before = current.value.activity ?? [];
        const activity = scrub(before);
        const count = before.filter(
          (event, i) => event.admin !== null && activity[i]?.admin === null,
        ).length;
        if (count === 0) return ok(0);
        return (await deps.lists.save({ ...current.value, activity }, current.version))
          ? ok(count)
          : err(listsErrors.conflict);
      });
      if (!result.ok) return result;
      removed += result.value;
      for (const entry of await deps.entries.forList(list.id)) {
        const result = await withConflictRetry(async () => {
          const current = await deps.entries.get(list.id, entry.id);
          if (current === null) return ok(0);
          const before = current.value.activity ?? [];
          const activity = scrub(before);
          const count = before.filter(
            (event, i) => event.admin !== null && activity[i]?.admin === null,
          ).length;
          if (count === 0) return ok(0);
          return (await deps.entries.save({ ...current.value, activity }, current.version))
            ? ok(count)
            : err(listsErrors.conflict);
        });
        if (!result.ok) return result;
        removed += result.value;
      }
    }
    return ok(removed);
  };

export const exportAdminActivity = async (deps: Deps, memberId: MemberId) => {
  const result: {
    readonly listId: string;
    readonly entryId: string | null;
    readonly event: ActivityEvent;
  }[] = [];
  const now = deps.clock.now();
  for (const list of await deps.lists.all()) {
    for (const event of retainActivityIdentity(list.activity ?? [], now)) {
      if (event.admin?.memberId === memberId)
        result.push({ listId: list.id, entryId: null, event });
    }
    for (const entry of await deps.entries.forList(list.id)) {
      for (const event of retainActivityIdentity(entry.activity ?? [], now)) {
        if (event.admin?.memberId === memberId)
          result.push({ listId: list.id, entryId: entry.id, event });
      }
    }
  }
  return result;
};
