/**
 * Creates the first list, "Best Sci-Fi Movies", as a draft. Safe to run more than once.
 *
 *   npm run seed                 local `netlify dev` data (.netlify/blobs-serve)
 *   NETLIFY_SITE_ID=… NETLIFY_AUTH_TOKEN=… npm run seed
 *                                the deployed site's production data
 *
 * Reads the same environment as the site (.env locally). Needs TMDB_READ_TOKEN.
 */
import { readFileSync } from 'node:fs';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { createApp } from '../src/server/composition.ts';
import { loadConfig } from '../src/server/config.ts';
import { seedFirstList } from '../src/server/seed.ts';

const config = loadConfig(process.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n- ${config.error.join('\n- ')}`);
  process.exit(1);
}

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
const remote = siteID !== undefined && siteID !== '' && token !== undefined && token !== '';

let server: BlobsServer | null = null;
let edgeURL: string | undefined;
let localSiteID = 'unlinked';
if (!remote) {
  // `netlify dev` keeps local data here, under the linked site's id (or "unlinked").
  try {
    const state = JSON.parse(readFileSync('.netlify/state.json', 'utf8')) as { siteId?: string };
    localSiteID = state.siteId ?? 'unlinked';
  } catch {
    // Not linked: keep "unlinked".
  }
  server = new BlobsServer({ directory: '.netlify/blobs-serve' });
  edgeURL = `http://localhost:${String((await server.start()).port)}`;
}

const app = createApp(
  config.value,
  {
    clock: { now: () => new Date() },
    ids: { next: () => crypto.randomUUID() },
    store: (name) =>
      remote
        ? getStore({ name, siteID, token })
        : getStore({
            name,
            siteID: localSiteID,
            token: 'local',
            ...(edgeURL === undefined ? {} : { edgeURL }),
          }),
    fetch: globalThis.fetch.bind(globalThis),
  },
  'production',
);

try {
  const outcome = await seedFirstList(app);
  const where = remote ? 'the deployed site' : 'local development data';
  console.log(
    outcome === 'created'
      ? `Created the draft “Best Sci-Fi Movies” in ${where}. Open /admin/lists/best-sci-fi-movies to schedule it.`
      : `“Best Sci-Fi Movies” already exists in ${where}; nothing to do.`,
  );
} finally {
  await server?.stop();
}
