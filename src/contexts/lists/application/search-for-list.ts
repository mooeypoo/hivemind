import {
  err,
  requireMember,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { ItemSnapshot } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { mayNominate, nominationsOpen } from '../domain/list.ts';
import { findList } from './find-list.ts';
import type { Catalog, ListRepository, SlugIndex } from './ports.ts';

/** Search the list's own item source, while the caller could nominate the result. */
export const makeSearchForList =
  (deps: {
    readonly lists: ListRepository;
    readonly slugs: SlugIndex;
    readonly catalog: Catalog;
    readonly clock: Clock;
  }) =>
  async (
    actor: Actor,
    input: { readonly list: string; readonly query: string },
  ): Promise<Result<readonly ItemSnapshot[], DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const found = await findList(deps, member.value, input.list);
    if (!found.ok) return found;
    const list = found.value.value;
    if (!mayNominate(list, member.value)) return err(listsErrors.roleRequired);
    if (!nominationsOpen(list, deps.clock.now())) return err(listsErrors.nominationsClosed);
    return deps.catalog.search(list.config.itemSource, input.query);
  };

/** Resolve one selected item for the nomination review view, without creating an entry. */
export const makeResolveItemForList =
  (deps: {
    readonly lists: ListRepository;
    readonly slugs: SlugIndex;
    readonly catalog: Catalog;
    readonly clock: Clock;
  }) =>
  async (
    actor: Actor,
    input: { readonly list: string; readonly externalId: string },
  ): Promise<Result<ItemSnapshot, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const found = await findList(deps, member.value, input.list);
    if (!found.ok) return found;
    const list = found.value.value;
    if (!mayNominate(list, member.value)) return err(listsErrors.roleRequired);
    if (!nominationsOpen(list, deps.clock.now())) return err(listsErrors.nominationsClosed);
    return deps.catalog.resolve(list.config.itemSource, input.externalId);
  };
