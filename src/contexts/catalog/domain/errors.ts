import { domainError } from '../../../shared/kernel/index.ts';

export const catalogErrors = {
  sourceUnavailable: domainError(
    'invalid',
    'catalog.source-unavailable',
    'This item source is not available on this site.',
  ),
  itemNotFound: domainError('not-found', 'catalog.item-not-found', 'That item could not be found.'),
  invalidTitle: domainError(
    'invalid',
    'catalog.invalid-title',
    'The title must be 1 to 200 characters.',
  ),
  cannotSeed: domainError(
    'invalid',
    'catalog.cannot-seed',
    'Only a preset can supply the entries of a list up front.',
  ),
  presetNotFound: domainError(
    'not-found',
    'catalog.preset-not-found',
    'That preset does not exist.',
  ),
  upstreamUnavailable: domainError(
    'unavailable',
    'catalog.upstream-unavailable',
    'The item search is not responding. Please try again.',
  ),
} as const;
