/**
 * Builds the app for operator scripts, over the same data the site uses:
 * local `netlify dev` data (.netlify/blobs-serve), or the deployed site's production data when
 * NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN are set. Reads the same environment as the site.
 */
import { readFileSync } from 'node:fs';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { createApp, type App } from '../src/server/composition.ts';
import { loadConfig } from '../src/server/config.ts';

export const withOperatorApp = async <T>(
  run: (app: App, where: string) => Promise<T>,
): Promise<T> => {
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
      const state = JSON.parse(readFileSync('.netlify/state.json', 'utf8')) as {
        siteId?: string;
      };
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
    return await run(app, remote ? 'the deployed site' : 'local development data');
  } finally {
    await server?.stop();
  }
};
