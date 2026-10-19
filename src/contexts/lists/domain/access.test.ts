import { describe, expect, test } from 'vitest';
import type { RoleId } from '../../../shared/kernel/index.ts';
import {
  accessFromLegacy,
  accessProblems,
  allowedByRoles,
  EVERYONE,
  legacyFromAccess,
  sameAccess,
  SITE_ADMINS_ONLY,
  widens,
  type Audience,
  type ListAccess,
} from './access.ts';

const r = (...ids: string[]) => ids as RoleId[];
const roles = (...ids: string[]): Audience => ({ kind: 'roles', roleIds: r(...ids) });

const ROLE_SETS = [r(), r('a'), r('b'), r('a', 'b'), r('c')];
const AUDIENCES: Audience[] = [
  EVERYONE,
  SITE_ADMINS_ONLY,
  roles('a'),
  roles('b'),
  roles('a', 'b'),
  roles('c'),
];

describe('allowed by roles', () => {
  test('everyone includes members with no roles at all', () => {
    const open: ListAccess = { view: EVERYONE, nominate: EVERYONE, rate: EVERYONE };
    expect(allowedByRoles(open, r())).toEqual({ view: true, nominate: true, rate: true });
  });

  test('a member needs any one of the roles', () => {
    const access: ListAccess = { view: roles('a', 'b'), nominate: roles('b'), rate: EVERYONE };
    expect(allowedByRoles(access, r('a'))).toEqual({ view: true, nominate: false, rate: true });
    expect(allowedByRoles(access, r('b'))).toEqual({ view: true, nominate: true, rate: true });
  });

  test('nominating and rating need viewing', () => {
    const access: ListAccess = { view: roles('a'), nominate: EVERYONE, rate: roles('c') };
    expect(allowedByRoles(access, r('c'))).toEqual({ view: false, nominate: false, rate: false });
  });

  test('no roles means only site admins', () => {
    const access: ListAccess = { view: SITE_ADMINS_ONLY, nominate: EVERYONE, rate: EVERYONE };
    for (const set of ROLE_SETS) expect(allowedByRoles(access, set).view).toBe(false);
  });
});

describe('validation', () => {
  test('at most 25 distinct roles per action', () => {
    const many = Array.from({ length: 26 }, (_, i) => `r${String(i)}`);
    expect(
      accessProblems({ view: roles(...many.slice(0, 25)), nominate: EVERYONE, rate: EVERYONE }),
    ).toEqual([]);
    expect(
      accessProblems({ view: EVERYONE, nominate: roles(...many), rate: roles('a', 'a') }),
    ).toEqual([
      'access.nominate must list at most 25 distinct roles',
      'access.rate must list at most 25 distinct roles',
    ]);
  });
});

describe('widening', () => {
  test('gaining a role or everyone widens; losing never does', () => {
    expect(widens(roles('a'), EVERYONE)).toBe(true);
    expect(widens(roles('a'), roles('a', 'b'))).toBe(true);
    expect(widens(SITE_ADMINS_ONLY, roles('a'))).toBe(true);
    expect(widens(EVERYONE, roles('a'))).toBe(false);
    expect(widens(roles('a', 'b'), roles('b'))).toBe(false);
    expect(widens(EVERYONE, EVERYONE)).toBe(false);
  });

  test('role order does not make access different', () => {
    const a: ListAccess = { view: roles('a', 'b'), nominate: EVERYONE, rate: EVERYONE };
    const b: ListAccess = { view: roles('b', 'a'), nominate: EVERYONE, rate: EVERYONE };
    expect(sameAccess(a, b)).toBe(true);
  });
});

/** How lists behaved before per-action access, for members who are not Admins. */
const legacyAllows = (requiredRoleIds: readonly RoleId[], hidden: boolean, member: RoleId[]) => {
  const view = !hidden;
  const participate =
    requiredRoleIds.length === 0 || requiredRoleIds.some((role) => member.includes(role));
  return { view, nominate: view && participate, rate: view && participate };
};

describe('lists from before per-action access', () => {
  test('keep exactly the access members had', () => {
    for (const required of [r(), r('a'), r('a', 'b')]) {
      for (const hidden of [false, true]) {
        const access = accessFromLegacy(required, hidden);
        for (const member of ROLE_SETS) {
          expect(allowedByRoles(access, member), `${required.join()}|${String(hidden)}`).toEqual(
            legacyAllows(required, hidden, member),
          );
        }
      }
    }
  });

  test('an unrestricted visible list is open to everyone', () => {
    expect(accessFromLegacy([], false)).toEqual({
      view: EVERYONE,
      nominate: EVERYONE,
      rate: EVERYONE,
    });
  });
});

describe('fields for older versions of the app', () => {
  const allAccess = AUDIENCES.flatMap((view) =>
    AUDIENCES.flatMap((nominate) => AUDIENCES.map((rate) => ({ view, nominate, rate }))),
  );

  test('never allow more than the access they stand for', () => {
    for (const seeded of [false, true]) {
      for (const access of allAccess) {
        const legacy = legacyFromAccess(access, seeded);
        for (const member of ROLE_SETS) {
          const old = legacyAllows(legacy.requiredRoleIds, legacy.hidden, member);
          const now = allowedByRoles(access, member);
          const label = JSON.stringify({ access, seeded, member });
          if (old.view) expect(now.view, label).toBe(true);
          if (old.rate) expect(now.rate, label).toBe(true);
          if (old.nominate && !seeded) expect(now.nominate, label).toBe(true);
        }
      }
    }
  });

  test('round-trip unchanged for every list that existed before', () => {
    for (const required of [r(), r('a'), r('a', 'b')]) {
      for (const hidden of [false, true]) {
        const legacy = legacyFromAccess(accessFromLegacy(required, hidden), false);
        expect(legacy).toEqual({ requiredRoleIds: hidden ? [] : required, hidden });
      }
    }
  });

  test('anything they cannot express is hidden', () => {
    expect(
      legacyFromAccess({ view: roles('a'), nominate: EVERYONE, rate: EVERYONE }, false),
    ).toEqual({ requiredRoleIds: [], hidden: true });
    expect(
      legacyFromAccess({ view: EVERYONE, nominate: roles('a'), rate: roles('b') }, false),
    ).toEqual({ requiredRoleIds: [], hidden: true });
  });
});
