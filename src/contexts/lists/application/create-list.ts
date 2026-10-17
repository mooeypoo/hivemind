import {
  err,
  ok,
  requireAdmin,
  type Actor,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Result,
} from '../../../shared/kernel/index.ts';
import { listsErrors } from '../domain/errors.ts';
import { newList, validateConfig, type ListConfig, type ListId } from '../domain/list.ts';
import type { Catalog, ListRepository, SlugIndex } from './ports.ts';
import { toListView, type ListView } from './views.ts';
import { appendListActivity } from '../domain/list-activity.ts';

export interface CreateListDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly catalog: Catalog;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** Admins create lists as drafts. The item source is checked with the catalog. */
export const makeCreateList =
  (deps: CreateListDeps) =>
  async (actor: Actor, input: ListConfig): Promise<Result<ListView, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const config = validateConfig(input);
    if (!config.ok) return config;
    const source = await deps.catalog.checkSource(config.value.itemSource, {
      seeded: config.value.entryMode === 'seeded',
    });
    if (!source.ok) return source;

    const now = deps.clock.now();
    const list = appendListActivity(
      newList(deps.ids.next() as ListId, config.value, now),
      'created',
      admin.value,
      now,
    );
    if (!(await deps.slugs.claim(list.config.slug, list.id))) return err(listsErrors.slugTaken);
    if (!(await deps.lists.save(list, null))) {
      await deps.slugs.release(list.config.slug, list.id);
      return err(listsErrors.conflict);
    }
    return ok(toListView(list, admin.value, now, 0));
  };
