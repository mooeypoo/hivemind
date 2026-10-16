import {
  ok,
  requireAdmin,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { LeaderboardCache } from './ports.ts';

export const makeDeleteListData =
  (deps: { readonly cache: LeaderboardCache }) =>
  async (actor: Actor, input: { readonly listId: string }): Promise<Result<void, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    await deps.cache.delete(input.listId);
    return ok(undefined);
  };
