import {
  err,
  ok,
  requireAdmin,
  withConflictRetry,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { entryIdFor, type Entry } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { publish, type List, type Schedule } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { Catalog, EntryRepository, ListRepository, SlugIndex } from './ports.ts';
import { toListView, type ListView } from './views.ts';

export interface ScheduleListDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly entries: EntryRepository;
  readonly catalog: Catalog;
  readonly clock: Clock;
}

const SEED_BATCH = 20;

/**
 * Publishes a draft with its schedule. A seeded list gets its entries now, before it is
 * published, so it is never visible without them. Seeding is idempotent.
 */
export const makeScheduleList =
  (deps: ScheduleListDeps) =>
  (actor: Actor, input: { readonly list: string; readonly schedule: Schedule }) =>
    withConflictRetry(async (): Promise<Result<ListView, DomainError>> => {
      const admin = requireAdmin(actor);
      if (!admin.ok) return admin;
      const found = await findList(deps, admin.value, input.list);
      if (!found.ok) return found;
      const now = deps.clock.now();
      const published = publish(found.value.value, input.schedule, now);
      if (!published.ok) return published;

      if (published.value.config.entryMode === 'seeded') {
        const seeded = await seed(deps, published.value, now);
        if (!seeded.ok) return seeded;
      }
      if (!(await deps.lists.save(published.value, found.value.version))) {
        return err(listsErrors.conflict);
      }
      return ok(toListView(published.value, admin.value, now, 0));
    });

const seed = async (
  deps: ScheduleListDeps,
  list: List,
  now: Date,
): Promise<Result<void, DomainError>> => {
  const items = await deps.catalog.seedItems(list.config.itemSource);
  if (!items.ok) return items;
  const entries: Entry[] = items.value.map((item) => ({
    id: entryIdFor(item),
    listId: list.id,
    item,
    nominatedBy: null,
    nominatedAt: now,
  }));
  for (let i = 0; i < entries.length; i += SEED_BATCH) {
    await Promise.all(entries.slice(i, i + SEED_BATCH).map((entry) => deps.entries.create(entry)));
  }
  return ok(undefined);
};
