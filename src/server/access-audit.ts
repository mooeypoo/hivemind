import type { Audience, ListAccess } from '../contexts/lists/index.ts';
import type { App } from './composition.ts';

export interface AccessAuditRow {
  readonly slug: string;
  readonly title: string;
  readonly lifecycle: string;
  readonly view: string;
  readonly nominate: string;
  readonly rate: string;
  /** An older version of the site changed this list's access, so it is hidden until reviewed. */
  readonly needsReview: boolean;
  readonly previousView: string | null;
}

const describe = (audience: Audience, names: ReadonlyMap<string, string>): string =>
  audience.kind === 'everyone'
    ? 'everyone on the server'
    : audience.roleIds.length === 0
      ? 'only site admins'
      : audience.roleIds.map((id) => names.get(id) ?? `unnamed role ${id}`).join(', ');

/**
 * Who can view, nominate and rate each list, as an operator sees it. Read-only: lists whose stored
 * access was changed by an older version are already hidden from members on every read, so the
 * report only points Admins at them.
 */
export const auditAccess = async (app: App): Promise<readonly AccessAuditRow[]> => {
  const operator = app.identity.operatorActor('access-audit');
  const [lists, labels] = await Promise.all([
    app.lists.listLists(operator),
    app.identity.getRoleLabels(operator),
  ]);
  if (!lists.ok) throw new Error(`Could not read lists: ${lists.error.message}`);
  const names = new Map(
    labels.ok ? labels.value.labels.map((label) => [label.roleId, label.name]) : [],
  );
  const row = (access: ListAccess, action: keyof ListAccess) => describe(access[action], names);
  return lists.value.map((list) => ({
    slug: list.slug,
    title: list.title,
    lifecycle: list.lifecycle,
    view: row(list.access, 'view'),
    nominate: list.entryMode === 'seeded' ? 'not used' : row(list.access, 'nominate'),
    rate: row(list.access, 'rate'),
    needsReview: list.accessNeedsReview === true,
    previousView:
      list.previousView === null || list.previousView === undefined
        ? null
        : describe(list.previousView, names),
  }));
};
