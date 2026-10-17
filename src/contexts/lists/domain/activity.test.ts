import { expect, test } from 'vitest';
import type { MemberActor, MemberId } from '../../../shared/kernel/index.ts';
import { activityEvent, anonymiseActivity, retainActivityIdentity } from './activity.ts';

const admin: MemberActor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Alex',
  isAdmin: true,
  roleIds: [],
};

test('attribution expires at the exact one-year anniversary, including leap days', () => {
  const event = activityEvent('create', 'created', admin, new Date('2024-02-29T12:00:00Z'));
  expect(
    retainActivityIdentity([event], new Date('2025-02-28T11:59:59.999Z'))[0]?.admin?.displayName,
  ).toBe('Alex');
  expect(retainActivityIdentity([event], new Date('2025-02-28T12:00:00Z'))[0]?.admin).toBeNull();
  expect(retainActivityIdentity([event], new Date('2025-02-28T12:00:00Z'))[0]?.action).toBe(
    'created',
  );
});

test('erasure removes both identity fields without deleting the event, and is idempotent', () => {
  const event = activityEvent('create', 'created', admin, new Date('2026-01-01T00:00:00Z'));
  const erased = anonymiseActivity([event], admin.memberId);
  expect(erased[0]).toEqual({ ...event, admin: null });
  expect(anonymiseActivity(erased, admin.memberId)).toEqual(erased);
});
