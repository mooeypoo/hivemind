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
import { closeVoting } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { ListRepository, SlugIndex } from './ports.ts';
import { toListView, type ListView } from './views.ts';
import { checkSettingsVersion, type SettingsExpectation } from './settings-version.ts';
import { appendListActivity, settingsChanges } from '../domain/list-activity.ts';

interface Deps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly clock: Clock;
}

/** Admins end voting now on an open list (timed or open-ended): scores are final, results shown. */
export const makeCloseVoting =
  (deps: Deps) => (actor: Actor, input: { readonly list: string } & SettingsExpectation) =>
    withConflictRetry(async (): Promise<Result<ListView, DomainError>> => {
      const admin = requireAdmin(actor);
      if (!admin.ok) return admin;
      const found = await findList(deps, admin.value, input.list);
      if (!found.ok) return found;
      const expected = checkSettingsVersion(found.value.value, input);
      if (!expected.ok) return expected;
      const now = deps.clock.now();
      const closed = closeVoting(found.value.value, now);
      if (!closed.ok) return closed;
      if (
        !(await deps.lists.save(
          appendListActivity(
            closed.value,
            'voting-closed',
            admin.value,
            now,
            settingsChanges(found.value.value, closed.value),
          ),
          found.value.version,
        ))
      )
        return err(listsErrors.conflict);
      return ok(toListView(closed.value, admin.value, now, 0));
    });
