import { expect, test } from 'vitest';
import { activityValue } from './activity.ts';

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
