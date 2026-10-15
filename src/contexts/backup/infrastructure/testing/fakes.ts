import { domainError, err, ok } from '../../../../shared/kernel/index.ts';
import type {
  BallotsBackup,
  ErasureCheck,
  ListBackupData,
  ListsBackup,
  PresetsBackup,
  RestoredListInfo,
} from '../../application/ports.ts';

/** Upstream contexts as backup sees them, with just enough behaviour to test orchestration. */
export class FakeUpstream implements ListsBackup, PresetsBackup, BallotsBackup, ErasureCheck {
  readonly stored = new Map<string, ListBackupData>();
  readonly restored: {
    backup: ListBackupData;
    itemSource?: unknown;
    kept: string[];
    dropped: string[];
  }[] = [];
  readonly erased = new Set<string>();
  readonly ballotsByList = new Map<string, { memberId: string }[]>();
  restoredBallots: { listId: string; memberIds: string[] }[] = [];
  /** The ballots "seal": marks which key sealed them. */
  sealKey = 'key-a';
  openKey = 'key-a';
  failRestoreFor = new Set<string>();

  exportLists(ref: string | null) {
    const all = [...this.stored].map(([listId, backup]) => ({ listId, backup }));
    if (ref === null) return Promise.resolve(ok(all));
    const one = all.filter((x) => x.listId === ref);
    return Promise.resolve(
      one.length > 0 ? ok(one) : err(domainError('not-found', 'lists.not-found', 'Nope')),
    );
  }

  async restore(
    backup: ListBackupData,
    options: {
      readonly itemSource?: unknown;
      readonly keepMember: (id: string) => Promise<boolean>;
    },
  ) {
    const title = backup.list.config.title;
    if (this.failRestoreFor.has(title)) {
      return err(
        domainError('invalid', 'lists.invalid-backup', 'A list in the backup is not valid.'),
      );
    }
    const nominators = (backup.nominators as { memberId: string }[]).map((n) => n.memberId);
    const kept: string[] = [];
    const dropped: string[] = [];
    for (const id of nominators) ((await options.keepMember(id)) ? kept : dropped).push(id);
    this.restored.push({ backup, itemSource: options.itemSource, kept, dropped });
    const info: RestoredListInfo = {
      listId: `restored-${String(this.restored.length)}`,
      title,
      slug: backup.list.config.slug,
      renamed: false,
      hidden: false,
      entries: backup.entries.length,
      membersLeftOut: dropped,
    };
    return ok(info);
  }

  exportPreset(presetId: string) {
    return Promise.resolve(
      presetId === 'p1' ? { items: [{ title: 'Blue', subtitle: null }] } : null,
    );
  }

  restorePreset() {
    return Promise.resolve(ok('p-new'));
  }

  exportBallots(listId: string) {
    const ballots = this.ballotsByList.get(listId);
    return Promise.resolve(
      ballots === undefined ? null : `${this.sealKey}|${JSON.stringify(ballots)}`,
    );
  }

  async restoreBallots(
    listId: string,
    sealed: string,
    keepMember: (id: string) => Promise<boolean>,
  ) {
    const [key, json] = sealed.split('|');
    if (key !== this.openKey || json === undefined)
      return ok({ restored: 0, membersLeftOut: [], unreadable: true });
    const kept: string[] = [];
    const left: string[] = [];
    for (const { memberId } of JSON.parse(json) as { memberId: string }[]) {
      ((await keepMember(memberId)) ? kept : left).push(memberId);
    }
    this.restoredBallots.push({ listId, memberIds: kept });
    return ok({ restored: kept.length, membersLeftOut: left, unreadable: false });
  }

  wasErased(memberId: string) {
    return Promise.resolve(this.erased.has(memberId));
  }
}

export const listData = (
  title: string,
  slug: string,
  itemSource: { kind: string; presetId?: string } = { kind: 'freeform' },
): ListBackupData => ({
  list: { config: { title, slug, itemSource } },
  entries: [{ item: { title: 'Root' } }, { item: { title: 'Azul' } }],
  nominators: [{ memberId: 'ada' }, { memberId: 'bob' }],
});
