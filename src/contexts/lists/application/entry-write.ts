import {
  err,
  ok,
  withConflictRetry,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { listsErrors } from '../domain/errors.ts';
import type { List } from '../domain/list.ts';
import type { ListRepository, Versioned } from './ports.ts';

/**
 * Register before touching the list's ETag. A source edit either sees the registration or
 * loses its compare-and-set; a writer that loses to an edit must resolve the new source again.
 */
export const withEntryWrite = async <T>(
  lists: ListRepository,
  expected: List,
  token: string,
  work: (current: Versioned<List>) => Promise<Result<T, DomainError>>,
): Promise<Result<T, DomainError>> => {
  let completed = false;
  try {
    await lists.beginEntryWrite(expected.id, token);
    const admitted = await withConflictRetry(async () => {
      const current = await lists.get(expected.id);
      if (current === null) return err(listsErrors.notFound);
      if (
        JSON.stringify(current.value.config.itemSource) !==
          JSON.stringify(expected.config.itemSource) ||
        current.value.config.entryMode !== expected.config.entryMode
      ) {
        return err(listsErrors.conflict);
      }
      if (!(await lists.save({ ...current.value, entryWriteToken: token }, current.version))) {
        return err(listsErrors.conflict);
      }
      const saved = await lists.get(expected.id);
      return saved === null ? err(listsErrors.notFound) : ok(saved);
    });
    const result = admitted.ok ? await work(admitted.value) : admitted;
    completed = true;
    return result;
  } finally {
    // A thrown adapter error can leave an uncertain write in flight. Keep its protection.
    if (completed) await lists.endEntryWrite(expected.id, token);
  }
};
