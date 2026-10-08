import { domainError } from '../../../shared/kernel/index.ts';

export const identityErrors = {
  invalidLoginState: domainError(
    'invalid',
    'identity.invalid-login-state',
    'The sign-in attempt expired or did not start here. Please try again.',
  ),
  notAMember: domainError(
    'forbidden',
    'identity.not-a-member',
    'Only members of this community can sign in.',
  ),
  discordUnavailable: domainError(
    'unavailable',
    'identity.discord-unavailable',
    'Discord could not be reached. Please try again.',
  ),
  loginRejected: domainError(
    'invalid',
    'identity.login-rejected',
    'Discord did not accept this sign-in. Please try again.',
  ),
  memberConflict: domainError(
    'conflict',
    'identity.member-conflict',
    'Your profile was updated at the same time elsewhere. Please try again.',
  ),
} as const;
