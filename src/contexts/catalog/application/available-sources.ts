import {
  ok,
  requireAdmin,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { ItemSourceKind } from '../domain/catalog-item.ts';
import type { ItemSources } from './ports.ts';

const ORDER: readonly ItemSourceKind[] = [
  'tmdb-movie',
  'tvdb-series',
  'igdb-game',
  'freeform',
  'preset',
];

/** Which sources an Admin can choose for a new list on this deployment. */
export const makeAvailableSources =
  (deps: { readonly sources: ItemSources }) =>
  (actor: Actor): Result<readonly ItemSourceKind[], DomainError> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    return ok(ORDER.filter((kind) => deps.sources[kind] !== undefined));
  };
