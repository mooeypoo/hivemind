import {
  err,
  ok,
  requireAdmin,
  withConflictRetry,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { isActiveEntry, type Entry, type ItemSnapshot } from '../domain/entry.ts';
import { listsErrors } from '../domain/errors.ts';
import { findList } from './find-list.ts';
import type { Catalog, EntryRepository, ListRepository, SlugIndex } from './ports.ts';

export interface RefreshMovieDetailsResult {
  readonly eligible: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly remaining: number;
}

const MAX_REFRESHES_PER_RUN = 20;

const hasOverview = (item: ItemSnapshot): boolean =>
  typeof item.overview === 'string' && item.overview.trim() !== '';

const hasText = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '';

const fillMissing = (current: ItemSnapshot, fresh: ItemSnapshot): ItemSnapshot => ({
  ...current,
  ...(hasText(current.overview) || !hasText(fresh.overview) ? {} : { overview: fresh.overview }),
  ...(hasText(current.director) || !hasText(fresh.director) ? {} : { director: fresh.director }),
  ...(current.cast !== undefined && current.cast.length > 0
    ? {}
    : fresh.cast === undefined || fresh.cast.length === 0
      ? {}
      : { cast: fresh.cast }),
});

export const makeRefreshMovieDetails =
  (deps: {
    readonly lists: ListRepository;
    readonly slugs: SlugIndex;
    readonly entries: EntryRepository;
    readonly catalog: Pick<Catalog, 'resolve'>;
  }) =>
  async (
    actor: Actor,
    input: { readonly list: string },
  ): Promise<Result<RefreshMovieDetailsResult, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const found = await findList(deps, admin.value, input.list);
    if (!found.ok) return found;
    const list = found.value.value;
    if (list.config.itemSource.kind !== 'tmdb-movie') return err(listsErrors.notMovieList);
    if (list.phase !== 'published') return err(listsErrors.movieDetailsNotPublished);

    const entries = (await deps.entries.forList(list.id)).filter(
      (entry) =>
        entry.item.source === 'tmdb-movie' &&
        isActiveEntry(entry) &&
        entry.snapshotPurgedAt === null,
    );
    let updated = 0;
    let failed = 0;
    const missing = entries.filter((entry) => !hasOverview(entry.item));
    const batch = missing.slice(0, MAX_REFRESHES_PER_RUN);
    let skipped = entries.length - missing.length;

    for (const entry of batch) {
      const resolved = await deps.catalog.resolve(list.config.itemSource, entry.item.externalId);
      if (!resolved.ok || !hasText(resolved.value.overview)) {
        failed += 1;
        continue;
      }

      const saved = await withConflictRetry(async () => {
        const current = await deps.entries.get(list.id, entry.id);
        if (
          current === null ||
          !isActiveEntry(current.value) ||
          current.value.snapshotPurgedAt !== null ||
          hasOverview(current.value.item)
        ) {
          return ok<'updated' | 'skipped'>('skipped');
        }
        const refreshed: Entry = {
          ...current.value,
          item: fillMissing(current.value.item, resolved.value),
        };
        return (await deps.entries.save(refreshed, current.version))
          ? ok<'updated' | 'skipped'>('updated')
          : err(listsErrors.conflict);
      });

      if (!saved.ok) failed += 1;
      else if (saved.value === 'updated') updated += 1;
      else skipped += 1;
    }

    return ok({
      eligible: entries.length,
      updated,
      skipped,
      failed,
      remaining: missing.length - batch.length + failed,
    });
  };
