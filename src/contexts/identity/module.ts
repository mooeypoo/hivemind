import type { Store } from '@netlify/blobs';
import type { Clock, IdGenerator, MemberId, RoleId } from '../../shared/kernel/index.ts';
import { makeCompleteLogin } from './application/complete-login.ts';
import { makeDeleteMyData } from './application/delete-my-data.ts';
import { makeExportMyData } from './application/export-my-data.ts';
import { makeGetMe } from './application/get-me.ts';
import type { PersonalDataContributor } from './application/ports.ts';
import { makeResolveActor } from './application/resolve-actor.ts';
import { makeStartLogin } from './application/start-login.ts';
import { makeGetCommunity } from './application/get-community.ts';
import { makeGetRoleLabels, makeSaveRoleLabels } from './application/role-labels.ts';
import {
  createBlobsCommunityCache,
  createBlobsRoleLabelRepository,
} from './infrastructure/blobs-community.ts';
import { createDiscordInviteLookup } from './infrastructure/discord-invite-lookup.ts';
import { createBlobsMemberRepository } from './infrastructure/blobs-member-repository.ts';
import { createDiscordGateway, type DiscordConfig } from './infrastructure/discord-gateway.ts';
import { createHmacSessionSigner } from './infrastructure/hmac-session-signer.ts';

export interface IdentityModuleDeps {
  /** The `identity` Blobs store. */
  readonly store: Store;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly discord: DiscordConfig;
  /** Admins: holders of `roleId`, plus the listed Discord user IDs. Either may be empty. */
  readonly admins: { readonly roleId: string | null; readonly memberIds: readonly string[] };
  readonly sessionSecret: string;
  /** Every other context that stores member data, for export and erasure. */
  readonly contributors: readonly PersonalDataContributor[];
  readonly fetch?: typeof fetch;
  /** Optional public invite, for the community's name and icon. */
  readonly inviteCode: string | null;
  /** Optional name to show when there is no invite or Discord can't be reached. */
  readonly communityName: string | null;
}

export const createIdentityModule = (deps: IdentityModuleDeps) => {
  const discord = createDiscordGateway(deps.discord, deps.fetch);
  const members = createBlobsMemberRepository(deps.store);
  const signer = createHmacSessionSigner(deps.sessionSecret);
  const roleLabels = createBlobsRoleLabelRepository(deps.store);
  const { clock, ids, contributors } = deps;

  return {
    startLogin: makeStartLogin({ discord, ids }),
    completeLogin: makeCompleteLogin({ discord, members, signer, clock }),
    resolveActor: makeResolveActor({
      signer,
      members,
      clock,
      admins: {
        roleId: deps.admins.roleId as RoleId | null,
        memberIds: deps.admins.memberIds as readonly MemberId[],
      },
    }),
    getMe: makeGetMe({ members }),
    exportMyData: makeExportMyData({ members, contributors, clock }),
    deleteMyData: makeDeleteMyData({ members, contributors }),
    getCommunity: makeGetCommunity({
      lookup:
        deps.inviteCode === null
          ? null
          : createDiscordInviteLookup(
              { inviteCode: deps.inviteCode, guildId: deps.discord.guildId },
              deps.fetch,
            ),
      cache: createBlobsCommunityCache(deps.store),
      clock,
      fallbackName: deps.communityName,
    }),
    getRoleLabels: makeGetRoleLabels({ roleLabels }),
    saveRoleLabels: makeSaveRoleLabels({ roleLabels }),
  };
};

export type IdentityModule = ReturnType<typeof createIdentityModule>;
