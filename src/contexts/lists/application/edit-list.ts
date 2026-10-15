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
import { listsErrors } from '../domain/errors.ts';
import { editList, type ListEdit } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { Catalog, EntryRepository, ListRepository, SlugIndex } from './ports.ts';
import { toListView, type ListView } from './views.ts';

export interface EditListDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly catalog: Catalog;
  readonly clock: Clock;
  readonly entries: EntryRepository;
}

export const makeEditList =
  (deps: EditListDeps) =>
  (actor: Actor, input: { readonly list: string; readonly edit: ListEdit }) =>
    withConflictRetry(async (): Promise<Result<ListView, DomainError>> => {
      const admin = requireAdmin(actor);
      if (!admin.ok) return admin;
      const found = await findList(deps, admin.value, input.list);
      if (!found.ok) return found;
      const before = found.value.value;
      const now = deps.clock.now();

      const changesSource =
        input.edit.itemSource !== undefined &&
        JSON.stringify(input.edit.itemSource) !== JSON.stringify(before.config.itemSource);
      const changesEntryMode =
        input.edit.entryMode !== undefined && input.edit.entryMode !== before.config.entryMode;
      if (changesSource || changesEntryMode) {
        if (await deps.lists.hasEntryWrites(before.id)) {
          return err(listsErrors.sourceWriteInProgress);
        }
        if ((await deps.entries.forList(before.id)).length > 0) {
          return err(listsErrors.sourceHasEntries);
        }
      }
      const edited = editList(before, input.edit, now, { itemSourceEditable: changesSource });
      if (!edited.ok) return edited;
      const after = edited.value;

      const sourceChanged =
        JSON.stringify(after.config.itemSource) !== JSON.stringify(before.config.itemSource) ||
        after.config.entryMode !== before.config.entryMode;
      if (sourceChanged) {
        const source = await deps.catalog.checkSource(after.config.itemSource, {
          seeded: after.config.entryMode === 'seeded',
        });
        if (!source.ok) return source;
      }

      const slugChanged = after.config.slug !== before.config.slug;
      if (slugChanged && !(await deps.slugs.claim(after.config.slug, after.id))) {
        return err(listsErrors.slugTaken);
      }
      if (!(await deps.lists.save(after, found.value.version))) {
        if (slugChanged) await deps.slugs.release(after.config.slug);
        return err(listsErrors.conflict);
      }
      if (slugChanged) await deps.slugs.release(before.config.slug);
      return ok(toListView(after, admin.value, now, 0));
    });
