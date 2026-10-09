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
import { closeVoting, setVisibility, type Visibility } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { ListRepository, SlugIndex } from './ports.ts';
import { toListView, type ListView } from './views.ts';

interface Deps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly clock: Clock;
}

/** Admins end voting now on an open list (timed or open-ended): scores are final, results shown. */
export const makeCloseVoting = (deps: Deps) => (actor: Actor, input: { readonly list: string }) =>
  withConflictRetry(async (): Promise<Result<ListView, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const found = await findList(deps, admin.value, input.list);
    if (!found.ok) return found;
    const now = deps.clock.now();
    const closed = closeVoting(found.value.value, now);
    if (!closed.ok) return closed;
    if (!(await deps.lists.save(closed.value, found.value.version)))
      return err(listsErrors.conflict);
    return ok(toListView(closed.value, admin.value, now, 0));
  });

/** Admins show or hide a list, at any time. Hidden lists exist only for Admins; nothing is lost. */
export const makeSetVisibility =
  (deps: Deps) =>
  (actor: Actor, input: { readonly list: string; readonly visibility: Visibility }) =>
    withConflictRetry(async (): Promise<Result<ListView, DomainError>> => {
      const admin = requireAdmin(actor);
      if (!admin.ok) return admin;
      const found = await findList(deps, admin.value, input.list);
      if (!found.ok) return found;
      const changed = setVisibility(found.value.value, input.visibility);
      if (!(await deps.lists.save(changed, found.value.version))) return err(listsErrors.conflict);
      return ok(toListView(changed, admin.value, deps.clock.now(), 0));
    });
