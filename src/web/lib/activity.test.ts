import { expect, test } from 'vitest';
import { activityDay, activityValue } from './activity.ts';

test('day labels use local calendar days across month and year boundaries', () => {
  const now = new Date(2026, 0, 1, 0, 15);
  expect(activityDay(now.toISOString(), now)).toBe('Today');
  expect(activityDay(new Date(2025, 11, 31, 23, 59).toISOString(), now)).toBe('Yesterday');
  const older = new Date(2025, 11, 30, 12);
  expect(activityDay(older.toISOString(), now)).toBe(
    new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(older),
  );
});

test('structured activity settings are rendered in plain language', () => {
  expect(activityValue('showNominators', 'true')).toBe('Visible');
  expect(activityValue('scoreVisibility', '"private"')).toBe('Private scores');
  expect(activityValue('entryMode', '"seeded"')).toBe('Include the whole collection');
  expect(activityValue('maxNominationsPerMember', 'null')).toBe('Unlimited');
  expect(activityValue('scale', '{"min":1,"max":10}')).toBe('1 to 10');
  expect(activityValue('ranking', '{"strategy":"bayesian","minVotes":5}')).toBe('5');
  expect(activityValue('requiredRoleIds', '[]')).toBe('All members');
  expect(activityValue('visibility', 'hidden')).toBe('Admins only');
  expect(activityValue('itemSource', '{"kind":"freeform"}')).toBe('Free text');
});
