import { getStore, type Store } from '@netlify/blobs';
import type { Clock, IdGenerator } from '../shared/kernel/index.ts';

/** What the running environment provides. Tests substitute their own. */
export interface Platform {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The Blobs store for one context; each context gets its own (AGENTS.md, Persistence). */
  readonly store: (name: 'identity' | 'catalog' | 'lists' | 'voting' | 'ranking') => Store;
  readonly fetch: typeof fetch;
}

export const netlifyPlatform = (): Platform => ({
  clock: { now: () => new Date() },
  ids: { next: () => crypto.randomUUID() },
  store: (name) => getStore({ name, consistency: 'strong' }),
  fetch: globalThis.fetch.bind(globalThis),
});
