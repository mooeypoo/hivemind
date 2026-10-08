import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore, type Store } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';

export interface LocalBlobs {
  /** A named store on the local server, e.g. `identity`. */
  store(name: string): Store;
  close(): Promise<void>;
}

/** A real Netlify Blobs server on a random port, backed by a temp directory. */
export const startLocalBlobs = async (): Promise<LocalBlobs> => {
  const directory = await mkdtemp(join(tmpdir(), 'blobs-'));
  const server = new BlobsServer({ directory, token: 'test-token' });
  const { port } = await server.start();
  return {
    store: (name) =>
      getStore({
        name,
        siteID: 'test-site',
        token: 'test-token',
        edgeURL: `http://localhost:${String(port)}`,
      }),
    close: async () => {
      await server.stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
};
