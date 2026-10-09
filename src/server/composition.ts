import { createCatalogModule, type CatalogModule } from '../contexts/catalog/index.ts';
import { createIdentityModule, type IdentityModule } from '../contexts/identity/index.ts';
import { createListsModule, type ListsModule } from '../contexts/lists/index.ts';
import { createVotingModule, type VotingModule } from '../contexts/voting/index.ts';
import { loadConfig, type AppConfig } from './config.ts';
import { netlifyPlatform, type Platform } from './platform.ts';

export interface App {
  readonly config: AppConfig;
  readonly identity: IdentityModule;
  readonly catalog: CatalogModule;
  readonly lists: ListsModule;
  readonly voting: VotingModule;
}

/**
 * Connects the context modules in context-map order: catalog → lists → voting, then identity,
 * which receives every context's personal-data contributor. No business logic lives here.
 */
export const createApp = (config: AppConfig, platform: Platform): App => {
  const { clock, ids, fetch } = platform;

  const catalog = createCatalogModule({
    store: platform.store('catalog'),
    ids,
    fetch,
    tmdbReadToken: config.tmdbReadToken,
  });

  const lists = createListsModule({ store: platform.store('lists'), clock, ids, catalog });

  const voting = createVotingModule({ store: platform.store('voting'), lists });

  const identity = createIdentityModule({
    store: platform.store('identity'),
    clock,
    ids,
    fetch,
    discord: {
      ...config.discord,
      redirectUri: `${config.siteUrl}/api/auth/callback`,
    },
    admins: config.admins,
    sessionSecret: config.sessionSecret,
    contributors: [lists.personalData, voting.personalData],
  });

  return { config, identity, catalog, lists, voting };
};

let app: App | undefined;

/** The app for this function instance, built on first use. The only reader of `process.env`. */
export const getApp = (): App => {
  if (app === undefined) {
    const config = loadConfig(process.env);
    if (!config.ok) {
      throw new Error(`Invalid configuration:\n- ${config.error.join('\n- ')}`);
    }
    app = createApp(config.value, netlifyPlatform());
  }
  return app;
};
