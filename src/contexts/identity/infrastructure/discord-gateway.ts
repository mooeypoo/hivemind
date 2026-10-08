import {
  err,
  ok,
  type DomainError,
  type MemberId,
  type Result,
  type RoleId,
} from '../../../shared/kernel/index.ts';
import type { DiscordGateway } from '../application/ports.ts';
import { identityErrors } from '../domain/errors.ts';
import type { Membership } from '../domain/membership.ts';

export interface DiscordConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly guildId: string;
  /** Must exactly match a redirect registered on the Discord application. */
  readonly redirectUri: string;
}

/** AGENTS.md: these scopes and no others. Never `email`. */
export const DISCORD_SCOPES = 'identify guilds.members.read';

const API = 'https://discord.com/api/v10';
const CDN = 'https://cdn.discordapp.com';

export const createDiscordGateway = (
  config: DiscordConfig,
  fetchFn: typeof fetch = fetch,
): DiscordGateway => {
  const basicAuth = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;

  const post = (path: string, form: Record<string, string>) =>
    fetchFn(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: basicAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });

  const exchangeCode = async (code: string): Promise<Result<string, DomainError>> => {
    const response = await post('/oauth2/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    });
    if (response.status >= 400 && response.status < 500) return err(identityErrors.loginRejected);
    if (!response.ok) return err(identityErrors.discordUnavailable);
    const body: unknown = await response.json();
    const token = isRecord(body) ? body.access_token : undefined;
    return typeof token === 'string' ? ok(token) : err(identityErrors.discordUnavailable);
  };

  const fetchMembership = async (token: string): Promise<Result<Membership, DomainError>> => {
    const response = await fetchFn(`${API}/users/@me/guilds/${config.guildId}/member`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return err(identityErrors.notAMember);
    if (response.status === 401 || response.status === 403)
      return err(identityErrors.loginRejected);
    if (!response.ok) return err(identityErrors.discordUnavailable);
    const membership = toMembership(await response.json(), config.guildId);
    return membership === null ? err(identityErrors.discordUnavailable) : ok(membership);
  };

  /** Best effort: the token is never stored, and revoking it closes the window entirely. */
  const revoke = async (token: string): Promise<void> => {
    try {
      await post('/oauth2/token/revoke', { token, token_type_hint: 'access_token' });
    } catch {
      // Nothing to do: the token expires on its own and is not kept anywhere.
    }
  };

  return {
    authorizeUrl(state) {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: DISCORD_SCOPES,
        state,
        prompt: 'none',
      });
      return `https://discord.com/oauth2/authorize?${params.toString()}`;
    },

    async verifyMembership(code) {
      try {
        const token = await exchangeCode(code);
        if (!token.ok) return token;
        try {
          return await fetchMembership(token.value);
        } finally {
          await revoke(token.value);
        }
      } catch {
        return err(identityErrors.discordUnavailable);
      }
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** Maps Discord's guild member object; returns null if it is not the expected shape. */
const toMembership = (body: unknown, guildId: string): Membership | null => {
  if (!isRecord(body) || !isRecord(body.user) || !Array.isArray(body.roles)) return null;
  const user = body.user;
  const id = optionalString(user.id);
  const username = optionalString(user.username);
  if (id === null || username === null) return null;
  const roles = body.roles.filter((role): role is string => typeof role === 'string');

  const displayName = optionalString(body.nick) ?? optionalString(user.global_name) ?? username;
  const guildAvatar = optionalString(body.avatar);
  const userAvatar = optionalString(user.avatar);
  const avatarUrl =
    guildAvatar !== null
      ? `${CDN}/guilds/${guildId}/users/${id}/avatars/${guildAvatar}.png?size=128`
      : userAvatar !== null
        ? `${CDN}/avatars/${id}/${userAvatar}.png?size=128`
        : `${CDN}/embed/avatars/${String((BigInt(id) >> 22n) % 6n)}.png`;

  return {
    member: { id: id as MemberId, displayName, avatarUrl },
    roleIds: roles as RoleId[],
  };
};
