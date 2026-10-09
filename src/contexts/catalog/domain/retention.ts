/**
 * How long a list may keep an item's details after the list is archived, per source.
 * TMDB's terms limit caching of its data, so movie details go after about 6 months.
 * Free text and presets are the community's own content: no limit.
 */
const RETENTION_DAYS: Readonly<Record<string, number>> = {
  'tmdb-movie': 183,
};

export const snapshotRetentionDays = (source: string): number | null =>
  RETENTION_DAYS[source] ?? null;
