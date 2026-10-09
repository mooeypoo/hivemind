import {
  domainError,
  err,
  ok,
  requireAdmin,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import {
  BACKUP_FORMAT,
  checkBackupFile,
  type BackupFile,
  type BackupListPart,
} from '../domain/backup-file.ts';
import type { BallotsBackup, ErasureCheck, ListsBackup, PresetsBackup } from './ports.ts';

export interface BackupDeps {
  readonly lists: ListsBackup;
  readonly presets: PresetsBackup;
  readonly ballots: BallotsBackup;
  readonly erasures: ErasureCheck;
  /** Identifies `BACKUP_KEY`; null when backups aren't configured. */
  readonly keyId: string | null;
  readonly clock: Clock;
}

const notConfigured = domainError(
  'invalid',
  'backup.not-configured',
  'Backups aren’t set up on this site: it needs a BACKUP_KEY.',
);

/** Admins download one list (`list`) or all of them (`list: null`). Ballots stay sealed. */
export const makeExportLists =
  (deps: BackupDeps) =>
  async (
    actor: Actor,
    input: { readonly list: string | null },
  ): Promise<Result<BackupFile, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    if (deps.keyId === null) return err(notConfigured);
    const exported = await deps.lists.exportLists(input.list);
    if (!exported.ok) return exported;
    const lists: BackupListPart[] = [];
    for (const { listId, backup } of exported.value) {
      const source = backup.list.config.itemSource;
      lists.push({
        ...backup,
        preset:
          source.kind === 'preset' && source.presetId !== undefined
            ? await deps.presets.exportPreset(source.presetId)
            : null,
        ballots: await deps.ballots.exportBallots(listId),
      });
    }
    return ok({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: deps.clock.now().toISOString(),
      keyId: deps.keyId,
      lists,
    });
  };

export type ImportedList =
  | {
      readonly ok: true;
      readonly title: string;
      readonly slug: string;
      readonly renamed: boolean;
      readonly hidden: boolean;
      readonly entries: number;
      readonly votesRestored: number;
      readonly membersLeftOut: number;
    }
  | { readonly ok: false; readonly title: string; readonly problem: string };

export interface ImportSummary {
  /** False: the file was made with a different backup key, so no personal data was restored. */
  readonly keyMatched: boolean;
  readonly lists: readonly ImportedList[];
}

/**
 * Admins restore lists from a backup, always as new lists: nothing is overwritten.
 * Personal data (nominator names, nomination records, votes) comes back only when the file
 * was made with this site's key, and never for members who erased their data.
 */
export const makeImportLists =
  (deps: BackupDeps) =>
  async (actor: Actor, file: BackupFile): Promise<Result<ImportSummary, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    if (deps.keyId === null) return err(notConfigured);
    const checked = checkBackupFile(file);
    if (!checked.ok) return checked;

    const keyMatched = file.keyId === deps.keyId;
    const keepMember = async (memberId: string) =>
      keyMatched && !(await deps.erasures.wasErased(memberId));

    const results: ImportedList[] = [];
    for (const part of file.lists) {
      const title = part.list.config.title;
      let itemSource: { kind: string; presetId?: string } | undefined;
      if (part.preset !== null) {
        const preset = await deps.presets.restorePreset(part.preset);
        if (!preset.ok) {
          results.push({ ok: false, title, problem: preset.error.message });
          continue;
        }
        itemSource = { kind: 'preset', presetId: preset.value };
      }
      const sealed = part.ballots;
      const listData = { list: part.list, entries: part.entries, nominators: part.nominators };
      const restored = await deps.lists.restore(listData, {
        keepMember,
        ...(itemSource === undefined ? {} : { itemSource }),
      });
      if (!restored.ok) {
        results.push({
          ok: false,
          title,
          problem: [restored.error.message, ...(restored.error.details ?? [])].join(' '),
        });
        continue;
      }
      const votes =
        keyMatched && sealed !== null
          ? await deps.ballots.restoreBallots(restored.value.listId, sealed, keepMember)
          : { restored: 0, membersLeftOut: [], unreadable: false };
      const leftOut = new Set([...restored.value.membersLeftOut, ...votes.membersLeftOut]);
      results.push({
        ok: true,
        title: restored.value.title,
        slug: restored.value.slug,
        renamed: restored.value.renamed,
        hidden: restored.value.hidden,
        entries: restored.value.entries,
        votesRestored: votes.restored,
        membersLeftOut: leftOut.size,
      });
    }
    return ok({ keyMatched, lists: results });
  };
