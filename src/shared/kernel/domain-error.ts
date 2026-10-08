/**
 * The category of a domain error. `server/http` maps each kind to one HTTP status,
 * so adding a new error never requires an HTTP change.
 */
export type DomainErrorKind =
  'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'invalid' | 'unavailable';

export interface DomainError {
  readonly kind: DomainErrorKind;
  /** Stable, specific identifier, namespaced by context, e.g. `identity.not-a-member`. */
  readonly code: string;
  readonly message: string;
  /** Itemised problems, e.g. one per invalid CSV row. */
  readonly details?: readonly string[];
}

export const domainError = (
  kind: DomainErrorKind,
  code: string,
  message: string,
  details?: readonly string[],
): DomainError =>
  details === undefined ? { kind, code, message } : { kind, code, message, details };
