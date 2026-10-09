import {
  domainError,
  err,
  ok,
  requireAdmin,
  requireMember,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { validateRoleLabels, type RoleLabel } from '../domain/role-labels.ts';
import type { RoleLabelRepository } from './ports.ts';

export interface RoleLabelsView {
  readonly labels: readonly RoleLabel[];
  /** Pass back when saving, so a concurrent change is noticed instead of overwritten. */
  readonly version: string | null;
}

const changedElsewhere = domainError(
  'conflict',
  'identity.role-labels-changed',
  'Someone else changed the roles meanwhile. Reload to see their changes, then try again.',
);

/** Members read role names (to see who may take part in a list). */
export const makeGetRoleLabels =
  (deps: { readonly roleLabels: RoleLabelRepository }) =>
  async (actor: Actor): Promise<Result<RoleLabelsView, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const found = await deps.roleLabels.get();
    return ok({ labels: found?.labels ?? [], version: found?.version ?? null });
  };

/** Admins replace the whole table. A save based on an outdated version is refused, not merged. */
export const makeSaveRoleLabels =
  (deps: { readonly roleLabels: RoleLabelRepository }) =>
  async (
    actor: Actor,
    input: {
      readonly labels: readonly { readonly roleId: string; readonly name: string }[];
      readonly version: string | null;
    },
  ): Promise<Result<RoleLabelsView, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const labels = validateRoleLabels(input.labels);
    if (!labels.ok) return labels;
    if (!(await deps.roleLabels.save(labels.value, input.version))) return err(changedElsewhere);
    const saved = await deps.roleLabels.get();
    return ok({ labels: labels.value, version: saved?.version ?? null });
  };
