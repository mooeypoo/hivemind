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
import { makeForgetOldErasures, makeWasErased } from './application/erasures.ts';
import { createBlobsErasureRegistry, type Fingerprinter } from './infrastructure/blobs-erasures.ts';
import { makeStartDemoSession } from './application/start-demo-session.ts';
import { DEMO_PERSONAS, demoActor, demoVoter, operatorActor } from './domain/demo.ts';
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
  /** Demo mode: `DEMO_MODE=true` outside production. Enables pretend sign-in. */
  readonly demo: boolean;
  /** From `BACKUP_KEY`; null when backups aren't configured. */
  readonly backupCrypto: Fingerprinter | null;
}

export const createIdentityModule = (deps: IdentityModuleDeps) => {
  const discord = createDiscordGateway(deps.discord, deps.fetch);
  const members = createBlobsMemberRepository(deps.store);
  const signer = createHmacSessionSigner(deps.sessionSecret);
  const roleLabels = createBlobsRoleLabelRepository(deps.store);
  const erasures =
    deps.backupCrypto === null ? null : createBlobsErasureRegistry(deps.store, deps.backupCrypto);
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
        // In demo mode the Demo Admin persona is an Admin too.
        memberIds: [
          ...(deps.admins.memberIds as readonly MemberId[]),
          ...(deps.demo ? [DEMO_PERSONAS.admin.id as MemberId] : []),
        ],
      },
    }),
    getMe: makeGetMe({ members }),
    exportMyData: makeExportMyData({ members, contributors, clock }),
    deleteMyData: makeDeleteMyData({ members, contributors, erasures, clock }),
    /** For the backup context: did this member erase their data? */
    wasErased: makeWasErased({ erasures }),
    /** Scheduled job; never from a request. */
    forgetOldErasures: makeForgetOldErasures({ erasures, clock }),
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
    startDemoSession: makeStartDemoSession({ enabled: deps.demo, members, signer, clock }),
    /** Actors for demo sample data. Null outside demo mode. */
    demoActors: deps.demo
      ? {
          admin: demoActor('admin'),
          memberA: demoActor('member-a'),
          memberB: demoActor('member-b'),
          voters: [1, 2, 3, 4].map(demoVoter),
        }
      : null,
    /** For trusted server-side jobs only (scripts, schedules); never from a request. */
    operatorActor,
    saveRoleLabels: makeSaveRoleLabels({ roleLabels }),
  };
};

export type IdentityModule = ReturnType<typeof createIdentityModule>;
