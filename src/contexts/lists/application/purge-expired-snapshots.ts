import type { Clock } from '../../../shared/kernel/index.ts';
import { purgeSnapshot } from '../domain/entry.ts';
import { archivedSince } from '../domain/list.ts';
import type { Catalog, EntryRepository, ListRepository } from './ports.ts';

const DAY = 86_400_000;

export interface PurgeResult {
  readonly listsChecked: number;
  readonly entriesPurged: number;
}

/**
 * AGENTS.md: purge catalog snapshots on archived lists after their source's retention period
 * (TMDB: 6 months). A scheduled job: no Actor, never reachable from a request. Idempotent.
 */
export const makePurgeExpiredSnapshots =
  (deps: {
    readonly lists: ListRepository;
    readonly entries: EntryRepository;
    readonly catalog: Pick<Catalog, 'snapshotRetentionDays'>;
    readonly clock: Clock;
  }) =>
  async (): Promise<PurgeResult> => {
    const now = deps.clock.now();
    let listsChecked = 0;
    let entriesPurged = 0;
    for (const list of await deps.lists.all()) {
      const since = archivedSince(list);
      if (since === null) continue;
      listsChecked += 1;
      for (const entry of await deps.entries.forList(list.id)) {
        if (entry.snapshotPurgedAt !== null) continue;
        const days = deps.catalog.snapshotRetentionDays(entry.item.source);
        if (days === null || now.getTime() - since.getTime() < days * DAY) continue;
        const current = await deps.entries.get(list.id, entry.id);
        if (current === null) continue;
        // A lost race just means another run purged it; tomorrow's run would catch anything left.
        if (await deps.entries.save(purgeSnapshot(current.value, now), current.version))
          entriesPurged += 1;
      }
    }
    return { listsChecked, entriesPurged };
  };
