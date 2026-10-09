import type { App } from './composition.ts';

/**
 * The daily retention job (AGENTS.md: purge snapshots on archived lists per TMDB's terms).
 * Logs counts only.
 */
export const runRetention = async (app: App): Promise<string> => {
  const purged = await app.lists.purgeExpiredSnapshots();
  const stale = await app.ranking.dropStaleLeaderboards();
  const forgotten = await app.identity.forgetOldErasures();
  return `Retention: checked ${String(purged.listsChecked)} archived lists, removed details from ${String(purged.entriesPurged)} entries, cleared ${String(stale.dropped)} cached leaderboards, forgot ${String(forgotten)} erasures older than two years.`;
};
