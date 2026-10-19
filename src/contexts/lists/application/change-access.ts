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
import type { ListAccess } from '../domain/access.ts';
import { listsErrors } from '../domain/errors.ts';
import { appendListActivity, settingsChanges } from '../domain/list-activity.ts';
import { changeAccess } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { ListRepository, SlugIndex } from './ports.ts';
import { checkSettingsVersion, type SettingsExpectation } from './settings-version.ts';
import { toListView, type ListView } from './views.ts';

/**
 * Admins change who may view, nominate and rate, in any lifecycle. Entries, nominations and
 * scores stay as they are; members who lose access simply stop seeing or changing them.
 */
export const makeChangeAccess =
  (deps: { readonly lists: ListRepository; readonly slugs: SlugIndex; readonly clock: Clock }) =>
  (
    actor: Actor,
    input: { readonly list: string; readonly access: ListAccess } & SettingsExpectation,
  ) =>
    withConflictRetry(async (): Promise<Result<ListView, DomainError>> => {
      const admin = requireAdmin(actor);
      if (!admin.ok) return admin;
      const found = await findList(deps, admin.value, input.list);
      if (!found.ok) return found;
      const expected = checkSettingsVersion(found.value.value, input);
      if (!expected.ok) return expected;
      const now = deps.clock.now();
      const changed = changeAccess(found.value.value, input.access, now);
      if (!changed.ok) return changed;
      const changes = settingsChanges(found.value.value, changed.value);
      const recorded =
        changes.length === 0
          ? changed.value
          : appendListActivity(changed.value, 'access-changed', admin.value, now, changes);
      if (!(await deps.lists.save(recorded, found.value.version))) return err(listsErrors.conflict);
      return ok(toListView(recorded, admin.value, now, 0));
    });
