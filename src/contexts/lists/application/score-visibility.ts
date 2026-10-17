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
import { changeScoreVisibility, type ScoreVisibility } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { ListRepository, SlugIndex } from './ports.ts';
import { toListView, type ListView } from './views.ts';
import { checkSettingsVersion, type SettingsExpectation } from './settings-version.ts';
import { appendListActivity, settingsChanges } from '../domain/list-activity.ts';

/** Admins choose public or private scores: either way in a draft, only to private after. */
export const makeSetScoreVisibility =
  (deps: { readonly lists: ListRepository; readonly slugs: SlugIndex; readonly clock: Clock }) =>
  (
    actor: Actor,
    input: {
      readonly list: string;
      readonly scoreVisibility: ScoreVisibility;
    } & SettingsExpectation,
  ) =>
    withConflictRetry(async (): Promise<Result<ListView, DomainError>> => {
      const admin = requireAdmin(actor);
      if (!admin.ok) return admin;
      const found = await findList(deps, admin.value, input.list);
      if (!found.ok) return found;
      const expected = checkSettingsVersion(found.value.value, input);
      if (!expected.ok) return expected;
      const now = deps.clock.now();
      const changed = changeScoreVisibility(found.value.value, input.scoreVisibility, now);
      if (!changed.ok) return changed;
      const changes = settingsChanges(found.value.value, changed.value);
      const recorded =
        changes.length === 0
          ? changed.value
          : appendListActivity(changed.value, 'score-privacy-changed', admin.value, now, changes);
      if (!(await deps.lists.save(recorded, found.value.version))) return err(listsErrors.conflict);
      return ok(toListView(changed.value, admin.value, now, 0));
    });
