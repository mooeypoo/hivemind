import type { DomainError, Result } from '../../../shared/kernel/index.ts';
import type { BackupListPart } from '../domain/backup-file.ts';

/** The list part of a backup, owned by the lists context. */
export type ListPart = BackupListPart['list'] & Record<string, unknown>;
export type ListBackupData = Omit<BackupListPart, 'preset' | 'ballots'>;

export interface RestoredListInfo {
  readonly listId: string;
  readonly title: string;
  readonly slug: string;
  readonly renamed: boolean;
  readonly hidden: boolean;
  readonly entries: number;
  readonly membersLeftOut: readonly string[];
}

/** Each upstream context exports and restores its own part; backup only orchestrates. */
export interface ListsBackup {
  exportLists(
    ref: string | null,
  ): Promise<
    Result<readonly { readonly listId: string; readonly backup: ListBackupData }[], DomainError>
  >;
  restore(
    backup: ListBackupData,
    options: {
      readonly itemSource?: { readonly kind: string; readonly presetId?: string };
      readonly keepMember: (memberId: string) => Promise<boolean>;
    },
  ): Promise<Result<RestoredListInfo, DomainError>>;
}

export interface PresetsBackup {
  exportPreset(presetId: string): Promise<NonNullable<BackupListPart['preset']> | null>;
  restorePreset(rows: NonNullable<BackupListPart['preset']>): Promise<Result<string, DomainError>>;
}

export interface BallotsBackup {
  exportBallots(listId: string): Promise<string | null>;
  restoreBallots(
    listId: string,
    sealed: string,
    keepMember: (memberId: string) => Promise<boolean>,
  ): Promise<{
    readonly restored: number;
    readonly membersLeftOut: readonly string[];
    readonly unreadable: boolean;
  }>;
}

export interface ErasureCheck {
  wasErased(memberId: string): Promise<boolean>;
}
