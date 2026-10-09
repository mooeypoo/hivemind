import {
  err,
  ok,
  type DomainError,
  type MemberActor,
  type Result,
} from '../../../shared/kernel/index.ts';
import { listsErrors } from '../domain/errors.ts';
import { visibleTo, type List, type ListId } from '../domain/list.ts';
import type { ListRepository, SlugIndex, Versioned } from './ports.ts';

export interface FindListDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
}

/**
 * Finds a list by id or slug, as the caller may see it: drafts and hidden lists exist only for
 * Admins. Everyone else gets not-found, so they do not leak.
 */
export const findList = async (
  deps: FindListDeps,
  actor: MemberActor,
  idOrSlug: string,
): Promise<Result<Versioned<List>, DomainError>> => {
  const byId = await deps.lists.get(idOrSlug as ListId);
  const found = byId ?? (await findBySlug(deps, idOrSlug));
  if (found === null) return err(listsErrors.notFound);
  if (!visibleTo(found.value, actor.isAdmin)) return err(listsErrors.notFound);
  return ok(found);
};

const findBySlug = async (deps: FindListDeps, slug: string): Promise<Versioned<List> | null> => {
  const id = await deps.slugs.lookup(slug);
  return id === null ? null : deps.lists.get(id);
};
