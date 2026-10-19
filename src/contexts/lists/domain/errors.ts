import { domainError, type DomainError } from '../../../shared/kernel/index.ts';

export const listsErrors = {
  settingsChanged: domainError(
    'conflict',
    'lists.settings-changed',
    'This list’s settings changed since you opened it. Your changes have not been applied. Compare the latest settings before saving or publishing again.',
  ),
  entryDeletionBusy: domainError(
    'conflict',
    'lists.entry-deletion-busy',
    'An entry is being permanently deleted. Nominations, scores and list changes are paused until an Admin finishes deletion.',
  ),
  entryConfirmationMismatch: domainError(
    'invalid',
    'lists.entry-confirmation-mismatch',
    'Type the entry title exactly to confirm permanent deletion.',
  ),
  immutableIdRequired: domainError(
    'invalid',
    'lists.immutable-id-required',
    'Permanent deletion requires the original list ID, not its reusable address.',
  ),
  deleting: domainError(
    'conflict',
    'lists.deleting',
    'This list is being permanently deleted. Only retrying deletion is allowed.',
  ),
  deletionBusy: domainError(
    'conflict',
    'lists.deletion-busy',
    'Deletion has started, but earlier writes must finish before cleanup. Retry deletion shortly. If this persists, an operator must check unfinished writes.',
  ),
  confirmationMismatch: domainError(
    'invalid',
    'lists.confirmation-mismatch',
    'Type the current list address exactly to confirm permanent deletion.',
  ),
  notFound: domainError('not-found', 'lists.not-found', 'That list does not exist.'),
  slugTaken: domainError('conflict', 'lists.slug-taken', 'Another list already uses that slug.'),
  notADraft: domainError('invalid', 'lists.not-a-draft', 'Only a draft list can be scheduled.'),
  locked: domainError('invalid', 'lists.locked', 'This list can no longer be edited.'),
  sourceHasEntries: domainError(
    'invalid',
    'lists.source-has-entries',
    'The item source cannot change because this list has entries, including withdrawn entries.',
  ),
  sourceWriteInProgress: domainError(
    'conflict',
    'lists.source-write-in-progress',
    "An unfinished entry write is protecting this list's item source. Try again after it finishes. If this persists, an operator must check the unfinished write.",
  ),
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
  publicScoresViewers: domainError(
    'invalid',
    'lists.public-scores-viewers',
    'Named scores on this list were given for its current viewers. Make scores private before letting more people view it.',
  ),
  scoresPrivateOnly: domainError(
    'invalid',
    'lists.scores-private-only',
    'Scores can only be made public before the list is published.',
  ),
  notMovieList: domainError(
    'invalid',
    'lists.not-movie-list',
    'Only lists using TMDB movies or TVDB shows can refresh item details.',
  ),
  movieDetailsNotPublished: domainError(
    'invalid',
    'lists.movie-details-not-published',
    'Item details can only be refreshed on a published, unarchived list.',
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
    'Once a list is published, only its description, a later closing time, removing its nomination cap, and the item source of an unused nomination list can change.',
    fields,
  );
