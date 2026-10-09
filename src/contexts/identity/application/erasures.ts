import type { Clock, MemberId } from '../../../shared/kernel/index.ts';
import type { ErasureRegistry } from './ports.ts';

/** How long an erasure is remembered: backups older than this are not to be restored. */
export const ERASURE_MEMORY_DAYS = 2 * 365;

/** Whether a member erased their data. A service for the backup context. */
export const makeWasErased =
  (deps: { readonly erasures: ErasureRegistry | null }) =>
  async (memberId: string): Promise<boolean> =>
    deps.erasures === null ? false : deps.erasures.wasErased(memberId as MemberId);

/** Scheduled job: forget erasures older than the retention period. */
export const makeForgetOldErasures =
  (deps: { readonly erasures: ErasureRegistry | null; readonly clock: Clock }) =>
  async (): Promise<number> =>
    deps.erasures === null
      ? 0
      : deps.erasures.forgetBefore(
          new Date(deps.clock.now().getTime() - ERASURE_MEMORY_DAYS * 86_400_000),
        );
