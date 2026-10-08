import type { MemberId } from '../../../shared/kernel/index.ts';

export interface MeView {
  readonly id: MemberId;
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly isAdmin: boolean;
}

export interface MyDataExport {
  readonly exportedAt: string;
  readonly identity: {
    readonly id: MemberId;
    readonly displayName: string;
    readonly avatarUrl: string;
  };
  readonly [context: string]: unknown;
}

export interface SessionGrant {
  /** Signed session token for the session cookie. */
  readonly token: string;
  readonly maxAgeSeconds: number;
}
