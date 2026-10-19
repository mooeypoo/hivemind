import type { RoleId } from '../../../shared/kernel/index.ts';

/**
 * Who an action is open to. `everyone`: every member of the server who signs in, with or without
 * roles. `roles`: members holding any one of them; none means only site admins.
 */
export type Audience =
  { readonly kind: 'everyone' } | { readonly kind: 'roles'; readonly roleIds: readonly RoleId[] };

/**
 * Who may view a list, nominate into it, and rate its entries. Nominating and rating also need
 * viewing. Site admins may always do all three, whatever the roles say.
 */
export interface ListAccess {
  readonly view: Audience;
  readonly nominate: Audience;
  readonly rate: Audience;
}

export type AccessAction = keyof ListAccess;

export const EVERYONE: Audience = { kind: 'everyone' };
export const SITE_ADMINS_ONLY: Audience = { kind: 'roles', roleIds: [] };
export const OPEN_ACCESS: ListAccess = { view: EVERYONE, nominate: EVERYONE, rate: EVERYONE };

export const MAX_ACCESS_ROLES = 25;

export const inAudience = (audience: Audience, roleIds: readonly RoleId[]): boolean =>
  audience.kind === 'everyone' || audience.roleIds.some((role) => roleIds.includes(role));

export const onlySiteAdmins = (audience: Audience): boolean =>
  audience.kind === 'roles' && audience.roleIds.length === 0;

/** What a member's roles allow on their own, before any site-admin access. */
export const allowedByRoles = (
  access: ListAccess,
  roleIds: readonly RoleId[],
): Record<AccessAction, boolean> => {
  const view = inAudience(access.view, roleIds);
  return {
    view,
    nominate: view && inAudience(access.nominate, roleIds),
    rate: view && inAudience(access.rate, roleIds),
  };
};

export const accessProblems = (access: ListAccess): string[] =>
  (['view', 'nominate', 'rate'] as const).flatMap((action) => {
    const audience = access[action];
    if (audience.kind === 'everyone') return [];
    const ids = audience.roleIds;
    return ids.length > MAX_ACCESS_ROLES || new Set(ids).size !== ids.length
      ? [`access.${action} must list at most ${String(MAX_ACCESS_ROLES)} distinct roles`]
      : [];
  });

/**
 * Whether `next` lets someone do `action` who could not under `previous`. Site admins are
 * unaffected either way, so only role audiences count.
 */
export const widens = (previous: Audience, next: Audience): boolean => {
  if (next.kind === 'everyone') return previous.kind !== 'everyone';
  if (previous.kind === 'everyone') return false;
  return next.roleIds.some((role) => !previous.roleIds.includes(role));
};

export const sameAudience = (a: Audience, b: Audience): boolean =>
  a.kind === 'everyone'
    ? b.kind === 'everyone'
    : b.kind === 'roles' &&
      a.roleIds.length === b.roleIds.length &&
      a.roleIds.every((role) => b.roleIds.includes(role));

export const sameAccess = (a: ListAccess, b: ListAccess): boolean =>
  sameAudience(a.view, b.view) &&
  sameAudience(a.nominate, b.nominate) &&
  sameAudience(a.rate, b.rate);

/**
 * Before per-action access, a list had one set of participation roles (none: every member) and
 * could be hidden from everyone but Admins. This reads such a list exactly as it behaved.
 */
export const accessFromLegacy = (
  requiredRoleIds: readonly RoleId[],
  hidden: boolean,
): ListAccess => {
  const participation: Audience =
    requiredRoleIds.length === 0 ? EVERYONE : { kind: 'roles', roleIds: [...requiredRoleIds] };
  return {
    view: hidden ? SITE_ADMINS_ONLY : EVERYONE,
    nominate: participation,
    rate: participation,
  };
};

const intersect = (a: Audience, b: Audience): Audience => {
  if (a.kind === 'everyone') return b;
  if (b.kind === 'everyone') return a;
  return { kind: 'roles', roleIds: a.roleIds.filter((role) => b.roleIds.includes(role)) };
};

/**
 * The closest the old fields can come to `access` without ever allowing more, so code from
 * before per-action access, if it is deployed again, fails closed: anything it can't express
 * becomes hidden. Seeded lists have no nominations, so only rating counts there.
 */
export const legacyFromAccess = (
  access: ListAccess,
  seeded: boolean,
): { readonly requiredRoleIds: readonly RoleId[]; readonly hidden: boolean } => {
  const participation = seeded ? access.rate : intersect(access.nominate, access.rate);
  if (access.view.kind !== 'everyone' || onlySiteAdmins(participation)) {
    return { requiredRoleIds: [], hidden: true };
  }
  return {
    requiredRoleIds: participation.kind === 'everyone' ? [] : participation.roleIds,
    hidden: false,
  };
};
