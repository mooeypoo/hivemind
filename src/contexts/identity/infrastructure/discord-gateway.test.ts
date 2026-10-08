import { describe, expect, test } from 'vitest';
import { err } from '../../../shared/kernel/index.ts';
import { identityErrors } from '../domain/errors.ts';
import { createDiscordGateway, DISCORD_SCOPES } from './discord-gateway.ts';

const config = {
  clientId: 'client',
  clientSecret: 'secret',
  guildId: '900',
  redirectUri: 'https://lists.example.org/api/auth/callback',
};

type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
const formOf = (init: RequestInit | undefined): URLSearchParams =>
  init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();

/** A fake `fetch` that answers by path and records every call. */
const fakeFetch = (routes: Record<string, Route>) => {
  const calls: { path: string; init: RequestInit | undefined }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(urlOf(input)).pathname.replace('/api/v10', '');
    calls.push({ path, init });
    const route = routes[path];
    if (route === undefined) throw new Error(`Unexpected request to ${path}`);
    return route(init);
  }) as typeof fetch;
  return { fetchFn, calls };
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const tokenOk = () => json({ access_token: 'access-token', token_type: 'Bearer' });
const revokeOk = () => new Response(null, { status: 200 });
const member = (overrides: Record<string, unknown> = {}, user: Record<string, unknown> = {}) =>
  json({
    nick: null,
    avatar: null,
    roles: ['r1', 'r2'],
    user: { id: '80351110224678912', username: 'ada', global_name: 'Ada', avatar: 'abc', ...user },
    ...overrides,
  });

const MEMBER_PATH = '/users/@me/guilds/900/member';

describe('authorize URL', () => {
  test('asks for exactly `identify guilds.members.read` and never `email`', () => {
    const url = new URL(createDiscordGateway(config).authorizeUrl('st'));
    expect(DISCORD_SCOPES).toBe('identify guilds.members.read');
    expect(url.searchParams.get('scope')).toBe('identify guilds.members.read');
    expect(url.toString()).not.toContain('email');
  });

  test('carries the state, client id and registered redirect URI', () => {
    const url = new URL(createDiscordGateway(config).authorizeUrl('st'));
    expect(url.origin).toBe('https://discord.com');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('client_id')).toBe('client');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('verify membership', () => {
  test('maps a guild member and revokes the token afterwards', async () => {
    const { fetchFn, calls } = fakeFetch({
      '/oauth2/token': tokenOk,
      [MEMBER_PATH]: () => member(),
      '/oauth2/token/revoke': revokeOk,
    });
    const result = await createDiscordGateway(config, fetchFn).verifyMembership('code');

    expect(result).toEqual({
      ok: true,
      value: {
        member: {
          id: '80351110224678912',
          displayName: 'Ada',
          avatarUrl: 'https://cdn.discordapp.com/avatars/80351110224678912/abc.png?size=128',
        },
        roleIds: ['r1', 'r2'],
      },
    });
    expect(calls.map((call) => call.path)).toEqual([
      '/oauth2/token',
      MEMBER_PATH,
      '/oauth2/token/revoke',
    ]);
    expect(formOf(calls[2]?.init).get('token')).toBe('access-token');
  });

  test('sends the code and the registered redirect URI to the token endpoint', async () => {
    const { fetchFn, calls } = fakeFetch({
      '/oauth2/token': tokenOk,
      [MEMBER_PATH]: () => member(),
      '/oauth2/token/revoke': revokeOk,
    });
    await createDiscordGateway(config, fetchFn).verifyMembership('the-code');
    const body = formOf(calls[0]?.init);
    expect(body.get('code')).toBe('the-code');
    expect(body.get('redirect_uri')).toBe(config.redirectUri);
  });

  test('a 404 from the member endpoint means not a member, and still revokes', async () => {
    const { fetchFn, calls } = fakeFetch({
      '/oauth2/token': tokenOk,
      [MEMBER_PATH]: () => json({ message: 'Unknown Guild', code: 10004 }, 404),
      '/oauth2/token/revoke': revokeOk,
    });
    const result = await createDiscordGateway(config, fetchFn).verifyMembership('code');
    expect(result).toEqual(err(identityErrors.notAMember));
    expect(calls.at(-1)?.path).toBe('/oauth2/token/revoke');
  });

  test('revokes the token even when the member lookup throws', async () => {
    const { fetchFn, calls } = fakeFetch({
      '/oauth2/token': tokenOk,
      [MEMBER_PATH]: () => {
        throw new Error('network down');
      },
      '/oauth2/token/revoke': revokeOk,
    });
    const result = await createDiscordGateway(config, fetchFn).verifyMembership('code');
    expect(result).toEqual(err(identityErrors.discordUnavailable));
    expect(calls.at(-1)?.path).toBe('/oauth2/token/revoke');
  });

  test('a rejected code is reported as a rejected login', async () => {
    const { fetchFn } = fakeFetch({ '/oauth2/token': () => json({ error: 'invalid_grant' }, 400) });
    const result = await createDiscordGateway(config, fetchFn).verifyMembership('bad');
    expect(result).toEqual(err(identityErrors.loginRejected));
  });

  test('Discord being down is reported as unavailable', async () => {
    const { fetchFn } = fakeFetch({ '/oauth2/token': () => new Response(null, { status: 502 }) });
    const result = await createDiscordGateway(config, fetchFn).verifyMembership('code');
    expect(result).toEqual(err(identityErrors.discordUnavailable));
  });

  test.each([
    ['server nickname first', { nick: 'Countess' }, {}, 'Countess'],
    ['then global name', {}, {}, 'Ada'],
    ['then username', {}, { global_name: null }, 'ada'],
  ])('display name: %s', async (_, overrides, user, expected) => {
    const { fetchFn } = fakeFetch({
      '/oauth2/token': tokenOk,
      [MEMBER_PATH]: () => member(overrides, user),
      '/oauth2/token/revoke': revokeOk,
    });
    const result = await createDiscordGateway(config, fetchFn).verifyMembership('code');
    expect(result.ok && result.value.member.displayName).toBe(expected);
  });

  test.each([
    [
      'server avatar first',
      { avatar: 'gav' },
      {},
      'https://cdn.discordapp.com/guilds/900/users/80351110224678912/avatars/gav.png?size=128',
    ],
    ['default avatar last', {}, { avatar: null }, 'https://cdn.discordapp.com/embed/avatars/5.png'],
  ])('avatar: %s', async (_, overrides, user, expected) => {
    const { fetchFn } = fakeFetch({
      '/oauth2/token': tokenOk,
      [MEMBER_PATH]: () => member(overrides, user),
      '/oauth2/token/revoke': revokeOk,
    });
    const result = await createDiscordGateway(config, fetchFn).verifyMembership('code');
    expect(result.ok && result.value.member.avatarUrl).toBe(expected);
  });
});
