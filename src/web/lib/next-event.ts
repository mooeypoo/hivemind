import type { ListDto } from '../../server/http/contracts.ts';

export interface NextEvent {
  /** e.g. "Opens", "Nominations close", "Closes". */
  readonly label: string;
  readonly at: string;
}

/** The next moment that changes what members can do on this list, if any. */
export const nextEvent = (
  list: Pick<ListDto, 'lifecycle' | 'schedule' | 'entryMode'>,
  now: Date,
): NextEvent | null => {
  const schedule = list.schedule;
  if (schedule === null) return null;
  if (list.lifecycle === 'scheduled') return { label: 'Opens', at: schedule.opensAt };
  if (list.lifecycle !== 'open') return null;
  const nominationsClose = schedule.nominationsCloseAt;
  if (
    list.entryMode === 'nominations' &&
    nominationsClose !== null &&
    new Date(nominationsClose) > now &&
    nominationsClose !== schedule.closesAt
  ) {
    return { label: 'Nominations close', at: nominationsClose };
  }
  return { label: 'Closes', at: schedule.closesAt };
};
