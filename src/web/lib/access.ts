import type {
  AccessActionDto,
  AudienceDto,
  ListAccessDto,
  RoleLabelDto,
} from '../../server/http/contracts.ts';

export const EVERYONE: AudienceDto = { kind: 'everyone' };
export const ONLY_SITE_ADMINS: AudienceDto = { kind: 'roles', roleIds: [] };
export const OPEN_ACCESS: ListAccessDto = { view: EVERYONE, nominate: EVERYONE, rate: EVERYONE };

export const accessActions: readonly AccessActionDto[] = ['view', 'nominate', 'rate'];
export const actionLabel: Record<AccessActionDto, string> = {
  view: 'View',
  nominate: 'Nominate',
  rate: 'Rate',
};

/** The actions that apply to a list: seeded lists take no nominations. */
export const actionsFor = (seeded: boolean): readonly AccessActionDto[] =>
  seeded ? ['view', 'rate'] : accessActions;

export const roleIdsOf = (audience: AudienceDto): readonly string[] =>
  audience.kind === 'roles' ? audience.roleIds : [];

export const onlySiteAdmins = (audience: AudienceDto): boolean =>
  audience.kind === 'roles' && audience.roleIds.length === 0;

const nameOf = (roleId: string, roles: readonly RoleLabelDto[]): string | undefined =>
  roles.find((role) => role.roleId === roleId)?.name;

const joinOr = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} or ${String(names.at(-1))}`;

/** "Everyone on the server", "Only site admins", or the roles by name ("Unnamed role (id)"). */
export const describeAudience = (audience: AudienceDto, roles: readonly RoleLabelDto[]): string => {
  if (audience.kind === 'everyone') return 'Everyone on the server';
  if (audience.roleIds.length === 0) return 'Only site admins';
  return [...audience.roleIds]
    .map((id) => nameOf(id, roles) ?? `Unnamed role (${id})`)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
};

/** For members: "the Film Club or Moderators role", or "a particular role" when unnamed. */
export const rolesPhrase = (audience: AudienceDto, roles: readonly RoleLabelDto[]): string => {
  const ids = roleIdsOf(audience);
  const names = ids.map((id) => nameOf(id, roles)).filter((name) => name !== undefined);
  if (names.length === 0 || names.length !== ids.length) return 'a particular role';
  return `the ${joinOr(names)} role`;
};

export const sameAudience = (a: AudienceDto, b: AudienceDto): boolean =>
  a.kind === b.kind &&
  roleIdsOf(a).length === roleIdsOf(b).length &&
  roleIdsOf(a).every((id) => roleIdsOf(b).includes(id));

export const sameAccess = (a: ListAccessDto, b: ListAccessDto, seeded: boolean): boolean =>
  actionsFor(seeded).every((action) => sameAudience(a[action], b[action]));

/** One line per action, e.g. "View: Everyone on the server". */
export const accessSummary = (
  access: ListAccessDto,
  roles: readonly RoleLabelDto[],
  seeded: boolean,
): readonly string[] =>
  actionsFor(seeded).map(
    (action) => `${actionLabel[action]}: ${describeAudience(access[action], roles)}`,
  );

/**
 * Roles allowed to nominate or rate but not to view. Members can't take part in a list they
 * can't see, so the Admin is warned.
 */
export const unseenParticipants = (access: ListAccessDto, seeded: boolean): readonly string[] => {
  if (access.view.kind === 'everyone') return [];
  const viewers = access.view.roleIds;
  const participants = new Set(
    actionsFor(seeded)
      .filter((action) => action !== 'view')
      .flatMap((action) => roleIdsOf(access[action])),
  );
  return [...participants].filter((id) => !viewers.includes(id));
};

/** True when anyone outside a site admin could do this action before and might not now. */
const narrowed = (before: AudienceDto, after: AudienceDto): boolean => {
  if (after.kind === 'everyone') return false;
  if (before.kind === 'everyone') return true;
  return before.roleIds.some((id) => !after.roleIds.includes(id));
};

const widened = (before: AudienceDto, after: AudienceDto): boolean => narrowed(after, before);

export interface AccessChange {
  readonly action: AccessActionDto;
  readonly kind: 'gains' | 'loses';
  readonly text: string;
}

/**
 * What a change of access means for members, worded for a confirmation. Each action can both
 * gain and lose people, for example when one role replaces another.
 */
export const accessChanges = (
  before: ListAccessDto,
  after: ListAccessDto,
  roles: readonly RoleLabelDto[],
  seeded: boolean,
): readonly AccessChange[] => {
  const changes: AccessChange[] = [];
  for (const action of actionsFor(seeded)) {
    const from = describeAudience(before[action], roles);
    const to = describeAudience(after[action], roles);
    if (widened(before[action], after[action])) {
      changes.push({
        action,
        kind: 'gains',
        text:
          action === 'view'
            ? `More people will see this list, its entries and its standings: ${from} → ${to}.`
            : `More people will be able to ${action}: ${from} → ${to}.`,
      });
    }
    if (narrowed(before[action], after[action])) {
      changes.push({
        action,
        kind: 'loses',
        text:
          action === 'view'
            ? `Some people will no longer see this list: ${from} → ${to}. Their nominations and scores stay in it.`
            : `Some people will no longer be able to ${action}: ${from} → ${to}. What they already ${
                action === 'rate' ? 'rated keeps counting' : 'nominated stays'
              }.`,
      });
    }
  }
  return changes;
};
