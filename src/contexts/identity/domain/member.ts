import type { MemberId } from '../../../shared/kernel/index.ts';

/**
 * Everything the app stores about a person (AGENTS.md, data minimization):
 * their Discord ID, display name and avatar URL. Nothing else.
 */
export interface Member {
  readonly id: MemberId;
  readonly displayName: string;
  readonly avatarUrl: string;
}
