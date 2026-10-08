import { err, ok, type Result } from '../shared/kernel/index.ts';

/** Everything that varies per deployment (AGENTS.md, Environment). */
export interface AppConfig {
  /** Public origin, e.g. `https://lists.example.org`. */
  readonly siteUrl: string;
  readonly discord: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly guildId: string;
  };
  readonly adminRoleId: string;
  readonly sessionSecret: string;
  /** Null when no list uses the `tmdb-movie` source. */
  readonly tmdbReadToken: string | null;
}

type Env = Readonly<Record<string, string | undefined>>;

const SNOWFLAKE = /^\d{5,25}$/;
const MIN_SECRET_LENGTH = 32;

/** Validates the environment, reporting every problem at once so a misconfigured deploy is fixed in one go. */
export const loadConfig = (env: Env): Result<AppConfig, string[]> => {
  const problems: string[] = [];
  const required = (name: string): string => {
    const value = env[name]?.trim() ?? '';
    if (value === '') problems.push(`${name} is not set`);
    return value;
  };

  const siteUrl = required('SITE_URL');
  const clientId = required('DISCORD_CLIENT_ID');
  const clientSecret = required('DISCORD_CLIENT_SECRET');
  const guildId = required('DISCORD_GUILD_ID');
  const adminRoleId = required('ADMIN_ROLE_ID');
  const sessionSecret = required('SESSION_SECRET');
  const tmdbReadToken = env.TMDB_READ_TOKEN?.trim() ?? '';

  if (siteUrl !== '' && !isOrigin(siteUrl)) {
    problems.push(
      'SITE_URL must be an origin like https://lists.example.org (no path or trailing slash)',
    );
  } else if (siteUrl !== '' && !isSecureOrLocal(siteUrl)) {
    problems.push('SITE_URL must use https:// (http:// is only allowed for localhost)');
  }
  if (guildId !== '' && !SNOWFLAKE.test(guildId))
    problems.push('DISCORD_GUILD_ID must be a Discord ID');
  if (adminRoleId !== '' && !SNOWFLAKE.test(adminRoleId))
    problems.push('ADMIN_ROLE_ID must be a Discord ID');
  if (sessionSecret !== '' && sessionSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${String(MIN_SECRET_LENGTH)} characters`);
  }

  if (problems.length > 0) return err(problems);
  return ok({
    siteUrl,
    discord: { clientId, clientSecret, guildId },
    adminRoleId,
    sessionSecret,
    tmdbReadToken: tmdbReadToken === '' ? null : tmdbReadToken,
  });
};

const isOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
  } catch {
    return false;
  }
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Browsers send `Origin: https://...` for a deployed site, so an http:// SITE_URL would refuse every mutation. */
const isSecureOrLocal = (origin: string): boolean => {
  const url = new URL(origin);
  return url.protocol === 'https:' || LOCAL_HOSTS.has(url.hostname);
};
