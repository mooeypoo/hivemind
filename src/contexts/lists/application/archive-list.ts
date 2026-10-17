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
import { archive } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { ListRepository, SlugIndex } from './ports.ts';
import { toListView, type ListView } from './views.ts';
import { checkSettingsVersion, type SettingsExpectation } from './settings-version.ts';

export const makeArchiveList =
  (deps: { readonly lists: ListRepository; readonly slugs: SlugIndex; readonly clock: Clock }) =>
  (actor: Actor, input: { readonly list: string } & SettingsExpectation) =>
    withConflictRetry(async (): Promise<Result<ListView, DomainError>> => {
      const admin = requireAdmin(actor);
      if (!admin.ok) return admin;
      const found = await findList(deps, admin.value, input.list);
      if (!found.ok) return found;
      const expected = checkSettingsVersion(found.value.value, input);
      if (!expected.ok) return expected;
      const now = deps.clock.now();
      const archived = archive(found.value.value, now);
      if (!archived.ok) return archived;
      if (!(await deps.lists.save(archived.value, found.value.version))) {
        return err(listsErrors.conflict);
      }
      return ok(toListView(archived.value, admin.value, now, 0));
    });
