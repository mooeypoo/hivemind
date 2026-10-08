/**
 * The API's wire types. The web app imports only types from this file.
 * Keep these plain data: no classes, no functions, no imports from contexts.
 */

export interface ErrorDto {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

/** `GET /api/me` */
export interface MeDto {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly isAdmin: boolean;
}

/** `GET /api/me/export`: every context's data about the caller, keyed by context. */
export interface MyDataExportDto {
  readonly exportedAt: string;
  readonly identity: {
    readonly id: string;
    readonly displayName: string;
    readonly avatarUrl: string;
  };
  readonly [context: string]: unknown;
}

/** Sign-in failures are reported to the web app as `/?login=<code>`. */
export type LoginOutcomeCode =
  | 'cancelled'
  | 'identity.invalid-login-state'
  | 'identity.not-a-member'
  | 'identity.login-rejected'
  | 'identity.discord-unavailable'
  | 'identity.member-conflict';
