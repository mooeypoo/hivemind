import { anonymous, type Actor, type Clock } from '../../../shared/kernel/index.ts';
import { actorFor, type AdminPolicy } from '../domain/actor.ts';
import { isExpired } from '../domain/session.ts';
import type { MemberRepository, SessionSigner } from './ports.ts';

export interface ResolveActorDeps {
  readonly signer: SessionSigner;
  readonly members: MemberRepository;
  readonly clock: Clock;
  readonly admins: AdminPolicy;
}

/**
 * Turns a session token into an Actor. Anything wrong with the token means anonymous.
 * The member is looked up so that erasing your data also ends every session.
 */
export const makeResolveActor =
  (deps: ResolveActorDeps) =>
  async (token: string | null): Promise<Actor> => {
    if (token === null) return anonymous;
    const session = deps.signer.verify(token);
    if (session === null || isExpired(session, deps.clock.now())) return anonymous;
    const member = await deps.members.get(session.memberId);
    if (member === null) return anonymous;
    return actorFor(session, deps.admins);
  };
