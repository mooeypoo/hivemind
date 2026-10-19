import {
  err,
  ok,
  type DomainError,
  type MemberActor,
  type Result,
} from '../../../shared/kernel/index.ts';
import { listsErrors } from '../domain/errors.ts';
import { mayView, type List, type ListId } from '../domain/list.ts';
import type { ListRepository, SlugIndex, Versioned } from './ports.ts';

export interface FindListDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
}

/**
 * Finds a list by id or slug, as the caller may see it: drafts, and lists whose viewers don't
 * include the caller, exist only for site admins. Everyone else gets not-found, so they do not leak.
 */
export const findList = async (
  deps: FindListDeps,
  actor: MemberActor,
  idOrSlug: string,
  options: { readonly allowDeleting?: boolean; readonly allowEntryDeletion?: boolean } = {},
): Promise<Result<Versioned<List>, DomainError>> => {
  const byId = await deps.lists.get(idOrSlug as ListId);
  const found = byId ?? (await findBySlug(deps, idOrSlug));
  if (found === null) return err(listsErrors.notFound);
  if (!mayView(found.value, actor)) return err(listsErrors.notFound);
  if (found.value.deletionRequested === true && options.allowDeleting !== true) {
    return err(listsErrors.deleting);
  }
  if (found.value.entryDeletion != null && options.allowEntryDeletion !== true) {
    return err(listsErrors.entryDeletionBusy);
  }
  return ok(found);
};

const findBySlug = async (deps: FindListDeps, slug: string): Promise<Versioned<List> | null> => {
  const id = await deps.slugs.lookup(slug);
  return id === null ? null : deps.lists.get(id);
};
