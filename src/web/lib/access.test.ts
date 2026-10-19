import { expect, test } from 'vitest';
import type { AudienceDto, ListAccessDto } from '../../server/http/contracts.ts';
import {
  OPEN_ACCESS,
  accessChanges,
  accessSummary,
  describeAudience,
  rolesPhrase,
  sameAccess,
  unseenParticipants,
} from './access.ts';

const roles = (...roleIds: string[]): AudienceDto => ({ kind: 'roles', roleIds });
const names = [
  { roleId: '1', name: 'Film Club' },
  { roleId: '2', name: 'Moderators' },
];

test('audiences read as plain language, with unnamed roles kept visible', () => {
  expect(describeAudience({ kind: 'everyone' }, names)).toBe('Everyone on the server');
  expect(describeAudience(roles(), names)).toBe('Only site admins');
  expect(describeAudience(roles('2', '1', '9'), names)).toBe(
    'Film Club, Moderators, Unnamed role (9)',
  );
});

test('members are told which role they need, without exposing role IDs', () => {
  expect(rolesPhrase(roles('1'), names)).toBe('the Film Club role');
  expect(rolesPhrase(roles('1', '2'), names)).toBe('the Film Club or Moderators role');
  expect(rolesPhrase(roles('1', '9'), names)).toBe('a particular role');
});

test('summaries have a line per action and leave out nominating on seeded lists', () => {
  const access: ListAccessDto = { view: roles('1', '2'), nominate: roles(), rate: roles('1') };
  expect(accessSummary(access, names, false)).toEqual([
    'View: Film Club, Moderators',
    'Nominate: Only site admins',
    'Rate: Film Club',
  ]);
  expect(accessSummary(access, names, true)).toEqual([
    'View: Film Club, Moderators',
    'Rate: Film Club',
  ]);
});

test('roles that may take part but not view are flagged', () => {
  expect(unseenParticipants(OPEN_ACCESS, false)).toEqual([]);
  expect(
    unseenParticipants({ view: roles('1'), nominate: roles('2'), rate: roles('1') }, false),
  ).toEqual(['2']);
  expect(
    unseenParticipants({ view: roles('1'), nominate: roles('2'), rate: roles('1') }, true),
  ).toEqual([]);
});

test('role order does not make access different', () => {
  const a: ListAccessDto = { ...OPEN_ACCESS, rate: roles('1', '2') };
  expect(sameAccess(a, { ...OPEN_ACCESS, rate: roles('2', '1') }, false)).toBe(true);
  expect(sameAccess(a, OPEN_ACCESS, false)).toBe(false);
  expect(sameAccess({ ...OPEN_ACCESS, nominate: roles() }, OPEN_ACCESS, true)).toBe(true);
});

test('changes say who gains and who loses access, per action', () => {
  expect(accessChanges(OPEN_ACCESS, OPEN_ACCESS, names, false)).toEqual([]);
  const hidden = accessChanges(OPEN_ACCESS, { ...OPEN_ACCESS, view: roles() }, names, false);
  expect(hidden).toEqual([expect.objectContaining({ action: 'view', kind: 'loses' })]);
  expect(hidden[0]?.text).toContain('Everyone on the server → Only site admins');

  const opened = accessChanges({ ...OPEN_ACCESS, view: roles('1') }, OPEN_ACCESS, names, false);
  expect(opened).toEqual([expect.objectContaining({ action: 'view', kind: 'gains' })]);

  const swapped = accessChanges(
    { ...OPEN_ACCESS, rate: roles('1') },
    { ...OPEN_ACCESS, rate: roles('2') },
    names,
    false,
  );
  expect(swapped.map((change) => change.kind)).toEqual(['gains', 'loses']);
  expect(accessChanges(OPEN_ACCESS, { ...OPEN_ACCESS, nominate: roles() }, names, true)).toEqual(
    [],
  );
});
