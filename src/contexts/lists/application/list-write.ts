import {
  err,
  type DomainError,
  type IdGenerator,
  type Result,
} from '../../../shared/kernel/index.ts';
import { listsErrors } from '../domain/errors.ts';
import type { ListId } from '../domain/list.ts';
import { withEntryWrite } from './entry-write.ts';
import type { ListRepository } from './ports.ts';

/** Downstream writers participate in the same admission fence as nominations and publication. */
export const makeWithListWrite =
  (deps: { readonly lists: ListRepository; readonly ids: IdGenerator }) =>
  async <T>(
    listId: string,
    work: () => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>> => {
    const current = await deps.lists.get(listId as ListId);
    if (current === null) return err(listsErrors.notFound);
    return withEntryWrite(deps.lists, current.value, deps.ids.next(), work);
  };
