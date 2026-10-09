import { domainError, type DomainError } from '../../../shared/kernel/index.ts';

export const listsErrors = {
  notFound: domainError('not-found', 'lists.not-found', 'That list does not exist.'),
  slugTaken: domainError('conflict', 'lists.slug-taken', 'Another list already uses that slug.'),
  notADraft: domainError('invalid', 'lists.not-a-draft', 'Only a draft list can be scheduled.'),
  locked: domainError('invalid', 'lists.locked', 'This list can no longer be edited.'),
  notScheduled: domainError(
    'invalid',
    'lists.not-scheduled',
    'Schedule the list before changing when it closes.',
  ),
  closesAtNotExtended: domainError(
    'invalid',
    'lists.closes-at-not-extended',
    'Once a list is scheduled, its closing time can only move later.',
  ),
  notPublished: domainError(
    'invalid',
    'lists.not-published',
    'Only a published list can be archived.',
  ),
  scoresPrivateOnly: domainError(
    'invalid',
    'lists.scores-private-only',
    'Scores can only be made public before the list is published.',
  ),
  notOpen: domainError(
    'invalid',
    'lists.not-open',
    'Voting can only be closed while the list is open.',
  ),
  nominationsClosed: domainError(
    'forbidden',
    'lists.nominations-closed',
    'This list is not taking nominations right now.',
  ),
  roleRequired: domainError(
    'forbidden',
    'lists.role-required',
    'This list is open only to members with a particular role.',
  ),
  alreadyNominated: domainError(
    'conflict',
    'lists.already-nominated',
    'That item is already in this list.',
  ),
  nominationCapReached: domainError(
    'forbidden',
    'lists.nomination-cap-reached',
    'You have used all your nominations for this list.',
  ),
  conflict: domainError(
    'conflict',
    'lists.conflict',
    'Someone else changed this at the same time. Please try again.',
  ),
} as const;

export const invalidConfig = (details: readonly string[]): DomainError =>
  domainError('invalid', 'lists.invalid-config', 'The list settings are not valid.', details);

export const invalidSchedule = (details: readonly string[]): DomainError =>
  domainError('invalid', 'lists.invalid-schedule', 'The schedule is not valid.', details);

export const lockedFields = (fields: readonly string[]): DomainError =>
  domainError(
    'invalid',
    'lists.locked-fields',
    'Once a list is published, only its description, a later closing time, and removing its nomination cap can change.',
    fields,
  );
