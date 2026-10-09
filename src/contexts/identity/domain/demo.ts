import type { MemberActor, MemberId } from '../../../shared/kernel/index.ts';
import type { Member } from './member.ts';

/**
 * Pretend accounts for demo mode (previews and local development, never production).
 * Their ids start with `demo-`, which no Discord id can, so they never collide with real members.
 */
export const DEMO_PERSONAS = {
  admin: { id: 'demo-admin', displayName: 'Demo Admin', isAdmin: true, avatar: 0 },
  'member-a': { id: 'demo-member-a', displayName: 'Demo Member A', isAdmin: false, avatar: 1 },
  'member-b': { id: 'demo-member-b', displayName: 'Demo Member B', isAdmin: false, avatar: 2 },
} as const;

export type DemoPersona = keyof typeof DEMO_PERSONAS;

export const isDemoPersona = (value: string): value is DemoPersona => value in DEMO_PERSONAS;

export const demoMember = (persona: DemoPersona): Member => {
  const { id, displayName, avatar } = DEMO_PERSONAS[persona];
  return {
    id: id as MemberId,
    displayName,
    avatarUrl: `https://cdn.discordapp.com/embed/avatars/${String(avatar)}.png`,
  };
};

/** Extra pretend voters, so demo leaderboards have more than a couple of scores. */
export const demoVoter = (n: number): MemberActor => ({
  kind: 'member',
  memberId: `demo-voter-${String(n)}` as MemberId,
  displayName: `Demo Voter ${String(n)}`,
  roleIds: [],
  isAdmin: false,
});

export const demoActor = (persona: DemoPersona): MemberActor => {
  const { id, displayName, isAdmin } = DEMO_PERSONAS[persona];
  return { kind: 'member', memberId: id as MemberId, displayName, roleIds: [], isAdmin };
};

/**
 * The Actor for trusted server-side jobs (the seed script, scheduled tasks). It is never
 * created from a request: no route leads here.
 */
export const operatorActor = (job: string): MemberActor => ({
  kind: 'member',
  memberId: `operator-${job}` as MemberId,
  displayName: 'Site operator',
  roleIds: [],
  isAdmin: true,
});
