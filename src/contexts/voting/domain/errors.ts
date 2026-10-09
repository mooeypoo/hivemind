import { domainError } from '../../../shared/kernel/index.ts';

export const votingErrors = {
  closed: domainError('forbidden', 'voting.closed', 'Voting is not open for this list right now.'),
  roleRequired: domainError(
    'forbidden',
    'voting.role-required',
    'This list is open only to members with a particular role.',
  ),
  unknownEntry: domainError('not-found', 'voting.unknown-entry', 'That entry is not in this list.'),
  conflict: domainError(
    'conflict',
    'voting.conflict',
    'Your scores changed in another tab at the same time. Please try again.',
  ),
} as const;
