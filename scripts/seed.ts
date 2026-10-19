/**
 * Creates the first list, "Best Sci-Fi Movies", as a draft. Safe to run more than once.
 *
 *   npm run seed                 local `netlify dev` data (.netlify/blobs-serve)
 *   NETLIFY_SITE_ID=… NETLIFY_AUTH_TOKEN=… npm run seed
 *                                the deployed site's production data
 *
 * Reads the same environment as the site (.env locally). Needs TMDB_READ_TOKEN.
 */
import { seedFirstList } from '../src/server/seed.ts';
import { withOperatorApp } from './operator-app.ts';

await withOperatorApp(async (app, where) => {
  const outcome = await seedFirstList(app);
  console.log(
    outcome === 'created'
      ? `Created the draft “Best Sci-Fi Movies” in ${where}. Open /admin/lists/best-sci-fi-movies to schedule it.`
      : `“Best Sci-Fi Movies” already exists in ${where}; nothing to do.`,
  );
});
