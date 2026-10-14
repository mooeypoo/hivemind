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
  /** Admins are holders of `roleId` plus the listed Discord user IDs. At least one is set. */
  readonly admins: { readonly roleId: string | null; readonly memberIds: readonly string[] };
  readonly sessionSecret: string;
  /** Null when no list uses the `tmdb-movie` source. */
  readonly tmdbReadToken: string | null;
  readonly tvdbReadToken: string | null;
  /** How the site shows which Discord community it belongs to. Both optional. */
  readonly community: { readonly inviteCode: string | null; readonly name: string | null };
  /** `DEMO_MODE=true`. Demo mode also requires a non-production deploy; see composition. */
  readonly demoRequested: boolean;
  /** `BACKUP_KEY`: enables backups (sealed votes, erasure fingerprints). Null: backups off. */
  readonly backupKey: string | null;
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
  const adminRoleId = env.ADMIN_ROLE_ID?.trim() ?? '';
  const adminMemberIds = (env.ADMIN_MEMBER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
  const sessionSecret = required('SESSION_SECRET');
  const tmdbReadToken = env.TMDB_READ_TOKEN?.trim() ?? '';
  const tvdbReadToken = env.TVDB_READ_TOKEN?.trim() ?? '';
  const inviteRaw = env.DISCORD_INVITE_CODE?.trim() ?? '';
  const inviteCode = inviteRaw === '' ? null : inviteCodeFrom(inviteRaw);
  const communityName = env.COMMUNITY_NAME?.trim() ?? '';
  const backupKey = env.BACKUP_KEY?.trim() ?? '';

  if (siteUrl !== '' && !isOrigin(siteUrl)) {
    problems.push(
      'SITE_URL must be an origin like https://lists.example.org (no path or trailing slash)',
    );
  } else if (siteUrl !== '' && !isSecureOrLocal(siteUrl)) {
    problems.push('SITE_URL must use https:// (http:// is only allowed for localhost)');
  }
  if (guildId !== '' && !SNOWFLAKE.test(guildId))
    problems.push('DISCORD_GUILD_ID must be a Discord ID');
  if (adminRoleId === '' && adminMemberIds.length === 0) {
    problems.push('Set ADMIN_ROLE_ID, ADMIN_MEMBER_IDS, or both, so someone can manage lists');
  }
  if (adminRoleId !== '' && !SNOWFLAKE.test(adminRoleId)) {
    problems.push('ADMIN_ROLE_ID must be a Discord ID');
  }
  if (adminMemberIds.some((id) => !SNOWFLAKE.test(id))) {
    problems.push('ADMIN_MEMBER_IDS must be Discord user IDs, separated by commas');
  }
  if (sessionSecret !== '' && sessionSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${String(MIN_SECRET_LENGTH)} characters`);
  }

  if (inviteRaw !== '' && inviteCode === null) {
    problems.push(
      'DISCORD_INVITE_CODE must be an invite code or link, like https://discord.gg/abc123',
    );
  }
  if (communityName.length > 100) problems.push('COMMUNITY_NAME must be at most 100 characters');
  if (backupKey !== '' && backupKey.length < MIN_SECRET_LENGTH) {
    problems.push(`BACKUP_KEY must be at least ${String(MIN_SECRET_LENGTH)} characters`);
  }

  if (problems.length > 0) return err(problems);
  return ok({
    siteUrl,
    discord: { clientId, clientSecret, guildId },
    admins: { roleId: adminRoleId === '' ? null : adminRoleId, memberIds: adminMemberIds },
    sessionSecret,
    tmdbReadToken: tmdbReadToken === '' ? null : tmdbReadToken,
    tvdbReadToken: tvdbReadToken === '' ? null : tvdbReadToken,
    community: { inviteCode, name: communityName === '' ? null : communityName },
    demoRequested: env.DEMO_MODE?.trim().toLowerCase() === 'true',
    backupKey: backupKey === '' ? null : backupKey,
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

const INVITE_CODE = /^[A-Za-z0-9-]{2,64}$/;

/** Accepts `abc123`, `discord.gg/abc123` or `https://discord.com/invite/abc123`. */
const inviteCodeFrom = (raw: string): string | null => {
  const match =
    /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)?([^/?#\s]+)\/?$/.exec(
      raw,
    );
  const code = match?.[1] ?? '';
  return INVITE_CODE.test(code) ? code : null;
};
