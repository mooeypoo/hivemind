import type { MemberActor, MemberId } from '../../../shared/kernel/index.ts';

export type ActivityAction =
  | 'created'
  | 'imported'
  | 'settings-edited'
  | 'published'
  | 'archived'
  | 'voting-closed'
  /** Recorded before per-action access; kept so older events still read. */
  | 'visibility-changed'
  | 'access-changed'
  | 'score-privacy-changed'
  | 'entry-set-aside'
  | 'entry-returned'
  | 'explanation-edited'
  | 'entry-deleted';

export interface ActivityChange {
  readonly field: string;
  /** Text edits keep the field name only, never old or new prose. */
  readonly before: string | null;
  readonly after: string | null;
}

export interface ActivityEvent {
  readonly id: string;
  readonly action: ActivityAction;
  readonly at: Date;
  readonly admin: { readonly memberId: MemberId; readonly displayName: string } | null;
  readonly changes: readonly ActivityChange[];
}

export const activityEvent = (
  id: string,
  action: ActivityAction,
  admin: MemberActor,
  at: Date,
  changes: readonly ActivityChange[] = [],
): ActivityEvent => ({
  id,
  action,
  at,
  admin: { memberId: admin.memberId, displayName: admin.displayName },
  changes,
});

/** One calendar year; a leap-day anniversary falls on February 28. */
export const attributionExpiresAt = (at: Date): Date => {
  const expiry = new Date(at);
  const month = expiry.getUTCMonth();
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  if (expiry.getUTCMonth() !== month) expiry.setUTCDate(0);
  return expiry;
};

export const retainActivityIdentity = (
  events: readonly ActivityEvent[],
  now: Date,
): readonly ActivityEvent[] =>
  events.map((event) =>
    event.admin !== null && attributionExpiresAt(event.at) <= now
      ? { ...event, admin: null }
      : event,
  );

export const anonymiseActivity = (
  events: readonly ActivityEvent[],
  memberId: MemberId,
): readonly ActivityEvent[] =>
  events.map((event) => (event.admin?.memberId === memberId ? { ...event, admin: null } : event));
