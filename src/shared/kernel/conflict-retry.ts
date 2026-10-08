import type { DomainError } from './domain-error.ts';
import type { Result } from './result.ts';

/**
 * AGENTS.md: on an optimistic-concurrency conflict, retry the use case once, then give up.
 * `run` must be the whole use case, so the retry re-reads fresh state.
 */
export const withConflictRetry = async <T>(
  run: () => Promise<Result<T, DomainError>>,
): Promise<Result<T, DomainError>> => {
  const first = await run();
  if (first.ok || first.error.kind !== 'conflict') return first;
  return run();
};
