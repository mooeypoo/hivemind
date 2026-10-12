import { getDeployStore, getStore, type Store } from '@netlify/blobs';
import type { DeployContext } from './deploy-context.ts';
import type { Clock, IdGenerator } from '../shared/kernel/index.ts';

/** What the running environment provides. Tests substitute their own. */
export interface Platform {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The Blobs store for one context; each context gets its own (AGENTS.md, Persistence). */
  readonly store: (name: 'identity' | 'catalog' | 'lists' | 'voting' | 'ranking') => Store;
  readonly fetch: typeof fetch;
}

/**
 * Production and local dev use site-wide stores (local dev's are a local sandbox).
 * Previews and branch deploys use deploy-scoped stores: each starts empty and can never
 * touch production's lists, votes or members.
 */
export const netlifyPlatform = (context: DeployContext): Platform => ({
  clock: { now: () => new Date() },
  ids: { next: () => crypto.randomUUID() },
  store: (name) =>
    freshPerCall(() =>
      context === 'production' || context === 'dev'
        ? getStore({ name, consistency: 'strong' })
        : getDeployStore({ name, consistency: 'strong' }),
    ),
  fetch: globalThis.fetch.bind(globalThis),
});

/**
 * A store keeps the Blobs token of the invocation that created it, and that token expires.
 * The app outlives invocations, so each operation opens the store with the current token.
 */
const freshPerCall = (open: () => Store): Store =>
  new Proxy({} as Store, {
    get: (_target, property): unknown => {
      const store = open();
      const value: unknown = Reflect.get(store, property);
      return typeof value === 'function' ? (value.bind(store) as unknown) : value;
    },
  });
