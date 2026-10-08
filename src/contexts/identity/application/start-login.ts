import type { IdGenerator } from '../../../shared/kernel/index.ts';
import type { DiscordGateway } from './ports.ts';

export interface StartLoginDeps {
  readonly discord: DiscordGateway;
  readonly ids: IdGenerator;
}

export interface LoginStart {
  /** CSRF state: stored in a cookie by the HTTP layer and checked on the callback. */
  readonly state: string;
  readonly redirectTo: string;
}

/** Sign-in runs before there is an Actor, so the login use cases take none. */
export const makeStartLogin = (deps: StartLoginDeps) => (): LoginStart => {
  const state = deps.ids.next();
  return { state, redirectTo: deps.discord.authorizeUrl(state) };
};
