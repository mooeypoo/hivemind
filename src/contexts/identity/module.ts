import type { Store } from '@netlify/blobs';
import type { Clock, IdGenerator, RoleId } from '../../shared/kernel/index.ts';
import { makeCompleteLogin } from './application/complete-login.ts';
import { makeDeleteMyData } from './application/delete-my-data.ts';
import { makeExportMyData } from './application/export-my-data.ts';
import { makeGetMe } from './application/get-me.ts';
import type { PersonalDataContributor } from './application/ports.ts';
import { makeResolveActor } from './application/resolve-actor.ts';
import { makeStartLogin } from './application/start-login.ts';
import { createBlobsMemberRepository } from './infrastructure/blobs-member-repository.ts';
import { createDiscordGateway, type DiscordConfig } from './infrastructure/discord-gateway.ts';
import { createHmacSessionSigner } from './infrastructure/hmac-session-signer.ts';

export interface IdentityModuleDeps {
  /** The `identity` Blobs store. */
  readonly store: Store;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly discord: DiscordConfig;
  readonly adminRoleId: string;
  readonly sessionSecret: string;
  /** Every other context that stores member data, for export and erasure. */
  readonly contributors: readonly PersonalDataContributor[];
  readonly fetch?: typeof fetch;
}

export const createIdentityModule = (deps: IdentityModuleDeps) => {
  const discord = createDiscordGateway(deps.discord, deps.fetch);
  const members = createBlobsMemberRepository(deps.store);
  const signer = createHmacSessionSigner(deps.sessionSecret);
  const { clock, ids, contributors } = deps;

  return {
    startLogin: makeStartLogin({ discord, ids }),
    completeLogin: makeCompleteLogin({ discord, members, signer, clock }),
    resolveActor: makeResolveActor({
      signer,
      members,
      clock,
      adminRoleId: deps.adminRoleId as RoleId,
    }),
    getMe: makeGetMe({ members }),
    exportMyData: makeExportMyData({ members, contributors, clock }),
    deleteMyData: makeDeleteMyData({ members, contributors }),
  };
};

export type IdentityModule = ReturnType<typeof createIdentityModule>;
