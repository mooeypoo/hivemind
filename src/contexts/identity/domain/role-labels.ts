import {
  domainError,
  err,
  ok,
  type DomainError,
  type Result,
  type RoleId,
} from '../../../shared/kernel/index.ts';

/** A human name for a Discord role, so Admins pick roles by name instead of by ID. */
export interface RoleLabel {
  readonly roleId: RoleId;
  readonly name: string;
}

export const MAX_ROLE_LABELS = 50;
const ROLE_ID = /^\d{5,25}$/;

/** Every problem at once, one per line, numbered as the Admin sees the rows. */
export const validateRoleLabels = (
  labels: readonly { readonly roleId: string; readonly name: string }[],
): Result<RoleLabel[], DomainError> => {
  const problems: string[] = [];
  if (labels.length > MAX_ROLE_LABELS) problems.push(`At most ${String(MAX_ROLE_LABELS)} roles.`);
  const ids = new Set<string>();
  const names = new Set<string>();
  const cleaned = labels.map((label, index) => {
    const row = `Row ${String(index + 1)}`;
    const name = label.name.trim().replace(/\s+/g, ' ');
    const roleId = label.roleId.trim();
    if (name.length < 1 || name.length > 60)
      problems.push(`${row}: the name must be 1 to 60 characters.`);
    if (!ROLE_ID.test(roleId)) problems.push(`${row}: “${roleId}” is not a Discord role ID.`);
    if (ids.has(roleId)) problems.push(`${row}: this role ID is already listed.`);
    if (names.has(name.toLowerCase())) problems.push(`${row}: this name is already used.`);
    ids.add(roleId);
    names.add(name.toLowerCase());
    return { roleId: roleId as RoleId, name };
  });
  return problems.length > 0
    ? err(
        domainError(
          'invalid',
          'identity.invalid-role-labels',
          'The roles could not be saved.',
          problems,
        ),
      )
    : ok(cleaned.sort((a, b) => a.name.localeCompare(b.name)));
};
