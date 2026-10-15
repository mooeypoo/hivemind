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
import type { List } from '../domain/list.ts';
import type { Catalog, EntryRepository, ListRepository, SlugIndex } from './ports.ts';

export interface RefreshMovieDetailsResult {
  readonly eligible: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly remaining: number;
  /** TVDB only: pass back as `after` to continue with the next batch; null when done. */
  readonly next: string | null;
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
  ...(hasText(current.creator) || !hasText(fresh.creator) ? {} : { creator: fresh.creator }),
  ...(current.cast !== undefined && current.cast.length > 0
    ? {}
    : fresh.cast === undefined || fresh.cast.length === 0
      ? {}
      : { cast: fresh.cast }),
});

/**
 * TVDB entries always have a synopsis and a poster, but the poster may be older than the one
 * search now shows, so every active entry is looked up once, in id order, 20 per run.
 */
const refreshTvdb = async (
  deps: { readonly entries: EntryRepository; readonly catalog: Pick<Catalog, 'resolve'> },
  list: List,
  after: string | undefined,
): Promise<Result<RefreshMovieDetailsResult, DomainError>> => {
  const entries = (await deps.entries.forList(list.id))
    .filter(
      (entry) =>
        entry.item.source === 'tvdb-series' &&
        isActiveEntry(entry) &&
        entry.snapshotPurgedAt === null,
    )
    .sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
  const pending = after === undefined ? entries : entries.filter((entry) => entry.id > after);
  const batch = pending.slice(0, MAX_REFRESHES_PER_RUN);
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of batch) {
    const resolved = await deps.catalog.resolve(list.config.itemSource, entry.item.externalId);
    if (!resolved.ok) {
      failed += 1;
      continue;
    }
    const fresh = resolved.value;
    const saved = await withConflictRetry(async () => {
      const current = await deps.entries.get(list.id, entry.id);
      if (
        current === null ||
        !isActiveEntry(current.value) ||
        current.value.snapshotPurgedAt !== null
      ) {
        return ok<'updated' | 'skipped'>('skipped');
      }
      const item: ItemSnapshot = {
        ...fillMissing(current.value.item, fresh),
        imageUrl: fresh.imageUrl ?? current.value.item.imageUrl,
      };
      if (JSON.stringify(item) === JSON.stringify(current.value.item)) {
        return ok<'updated' | 'skipped'>('skipped');
      }
      return (await deps.entries.save({ ...current.value, item }, current.version))
        ? ok<'updated' | 'skipped'>('updated')
        : err(listsErrors.conflict);
    });
    if (!saved.ok) failed += 1;
    else if (saved.value === 'updated') updated += 1;
    else skipped += 1;
  }

  const remaining = pending.length - batch.length;
  const last = batch.at(-1);
  return ok({
    eligible: entries.length,
    updated,
    skipped,
    failed,
    remaining,
    next: remaining > 0 && last !== undefined ? last.id : null,
  });
};

export const makeRefreshMovieDetails =
  (deps: {
    readonly lists: ListRepository;
    readonly slugs: SlugIndex;
    readonly entries: EntryRepository;
    readonly catalog: Pick<Catalog, 'resolve'>;
  }) =>
  async (
    actor: Actor,
    input: { readonly list: string; readonly after?: string },
  ): Promise<Result<RefreshMovieDetailsResult, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const found = await findList(deps, admin.value, input.list);
    if (!found.ok) return found;
    const list = found.value.value;
    const source = list.config.itemSource.kind;
    if (source !== 'tmdb-movie' && source !== 'tvdb-series') return err(listsErrors.notMovieList);
    if (list.phase !== 'published') return err(listsErrors.movieDetailsNotPublished);
    if (source === 'tvdb-series') return refreshTvdb(deps, list, input.after);

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
      next: null,
    });
  };
