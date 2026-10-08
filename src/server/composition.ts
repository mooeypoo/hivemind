import { createIdentityModule, type IdentityModule } from '../contexts/identity/index.ts';
import { loadConfig, type AppConfig } from './config.ts';
import { netlifyPlatform, type Platform } from './platform.ts';

export interface App {
  readonly config: AppConfig;
  readonly identity: IdentityModule;
}

/** Connects the context modules in context-map order. No business logic lives here. */
export const createApp = (config: AppConfig, platform: Platform): App => {
  const identity = createIdentityModule({
    store: platform.store('identity'),
    clock: platform.clock,
    ids: platform.ids,
    fetch: platform.fetch,
    discord: {
      ...config.discord,
      redirectUri: `${config.siteUrl}/api/auth/callback`,
    },
    adminRoleId: config.adminRoleId,
    sessionSecret: config.sessionSecret,
    contributors: [],
  });

  return { config, identity };
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
