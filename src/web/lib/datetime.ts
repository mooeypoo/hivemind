const pad = (value: number): string => String(value).padStart(2, '0');

/** An ISO timestamp as the value of an `<input type="datetime-local">`, in the viewer's time zone. */
export const toLocalInput = (iso: string): string => {
  const date = new Date(iso);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** A `datetime-local` value, read in the viewer's time zone, as an ISO timestamp. Null if empty or invalid. */
export const fromLocalInput = (value: string): string | null => {
  if (value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const unit = (count: number, name: string): string =>
  `${String(count)} ${name}${count === 1 ? '' : 's'}`;

/** "3 days 4 hours", "5 hours 2 minutes", "12 minutes", "less than a minute". */
export const durationText = (ms: number): string => {
  if (ms < MINUTE) return 'less than a minute';
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0)
    return hours > 0 ? `${unit(days, 'day')} ${unit(hours, 'hour')}` : unit(days, 'day');
  if (hours > 0)
    return minutes > 0 ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')}` : unit(hours, 'hour');
  return unit(minutes, 'minute');
};
