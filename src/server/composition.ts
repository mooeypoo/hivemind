import { createBackupModule, type BackupModule } from '../contexts/backup/index.ts';
import { createCatalogModule, type CatalogModule } from '../contexts/catalog/index.ts';
import { createIdentityModule, type IdentityModule } from '../contexts/identity/index.ts';
import { createListsModule, type ListsModule } from '../contexts/lists/index.ts';
import { createRankingModule, type RankingModule } from '../contexts/ranking/index.ts';
import { createVotingModule, type VotingModule } from '../contexts/voting/index.ts';
import { createBackupCrypto } from '../shared/infrastructure/backup-crypto.ts';
import { loadConfig, type AppConfig } from './config.ts';
import { deployContextFrom, isProduction, type DeployContext } from './deploy-context.ts';
import { netlifyPlatform, type Platform } from './platform.ts';
import { makeDeleteList } from './delete-list.ts';
import { makeDeleteEntry } from './delete-entry.ts';

export interface App {
  readonly config: AppConfig;
  readonly identity: IdentityModule;
  readonly catalog: CatalogModule;
  readonly lists: ListsModule;
  readonly voting: VotingModule;
  readonly ranking: RankingModule;
  readonly backup: BackupModule;
  readonly deleteList: ReturnType<typeof makeDeleteList>;
  readonly deleteEntry: ReturnType<typeof makeDeleteEntry>;
  /** Whether backups are configured (`BACKUP_KEY`). */
  readonly backupsEnabled: boolean;
  readonly deployContext: DeployContext;
  /** Demo mode is on only with `DEMO_MODE=true` and outside production: two locks. */
  readonly demo: boolean;
  /**
   * The origin mutations must come from. Production: exactly `SITE_URL`. Elsewhere each deploy
   * has its own address, so the request's own origin: still a same-origin check.
   */
  siteOrigin(request: Request): string;
}

/**
 * Connects the context modules in context-map order: catalog → lists → voting → ranking, then identity,
 * then backup (downstream of all),
 * which receives every context's personal-data contributor. No business logic lives here.
 */
export const createApp = (
  config: AppConfig,
  platform: Platform,
  deployContext: DeployContext = 'production',
): App => {
  const demo = config.demoRequested && !isProduction(deployContext);
  const backupCrypto = config.backupKey === null ? null : createBackupCrypto(config.backupKey);
  const { clock, ids, fetch } = platform;

  const catalog = createCatalogModule({
    store: platform.store('catalog'),
    ids,
    fetch,
    tmdbReadToken: config.tmdbReadToken,
    tvdbReadToken: config.tvdbReadToken,
    igdb: config.igdb,
  });

  const lists = createListsModule({ store: platform.store('lists'), clock, ids, catalog });

  const voting = createVotingModule({
    store: platform.store('voting'),
    lists,
    sealer: backupCrypto,
  });

  const ranking = createRankingModule({ store: platform.store('ranking'), clock, lists, voting });

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
    inviteCode: config.community.inviteCode,
    communityName: config.community.name,
    demo,
    backupCrypto,
    contributors: [lists.personalData, voting.personalData],
  });

  const backup = createBackupModule({
    lists,
    catalog,
    voting,
    identity,
    keyId: backupCrypto?.keyId ?? null,
    clock,
  });

  return {
    config,
    identity,
    catalog,
    lists,
    voting,
    ranking,
    backup,
    deleteList: makeDeleteList({ lists, voting, ranking }),
    deleteEntry: makeDeleteEntry({ lists, voting, ranking }),
    backupsEnabled: backupCrypto !== null,
    deployContext,
    demo,
    siteOrigin: (request) =>
      isProduction(deployContext) ? config.siteUrl : new URL(request.url).origin,
  };
};

const apps = new Map<DeployContext, App>();
let warnedDemoInProduction = false;

/**
 * The app for this function instance and deploy context, built on first use.
 * The only reader of `process.env`.
 */
export const getApp = (context?: string): App => {
  const deployContext = deployContextFrom(context);
  let app = apps.get(deployContext);
  if (app === undefined) {
    const config = loadConfig(process.env);
    if (!config.ok) {
      throw new Error(`Invalid configuration:\n- ${config.error.join('\n- ')}`);
    }
    if (config.value.demoRequested && isProduction(deployContext) && !warnedDemoInProduction) {
      warnedDemoInProduction = true;
      console.warn('DEMO_MODE is set, but demo mode never runs in production; ignoring it.');
    }
    app = createApp(config.value, netlifyPlatform(deployContext), deployContext);
    apps.set(deployContext, app);
  }
  return app;
};
