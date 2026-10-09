import {
  domainError,
  err,
  ok,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';

export const BACKUP_FORMAT = 'votable-lists-backup';
export const MAX_LISTS = 200;
export const MAX_ENTRIES_PER_LIST = 2000;

/**
 * One list in a backup. The list part belongs to the lists context and is passed through
 * as-is; backup only reads what it needs to orchestrate.
 */
export interface BackupListPart {
  readonly list: {
    readonly config: {
      readonly title: string;
      readonly slug: string;
      readonly itemSource: { readonly kind: string; readonly presetId?: string };
    };
  };
  readonly entries: readonly unknown[];
  readonly nominators: readonly unknown[];
  /** The preset's rows, for lists whose items come from a CSV preset. */
  readonly preset: {
    readonly items: readonly { readonly title: string; readonly subtitle: string | null }[];
  } | null;
  /** The list's ballots, sealed with the site's backup key; null if nobody voted. */
  readonly ballots: string | null;
}

/**
 * A backup file. `keyId` identifies the key the ballots were sealed with (not the key):
 * with a different key, no personal data is restored.
 */
export interface BackupFile {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: 1;
  readonly exportedAt: string;
  readonly keyId: string;
  readonly lists: readonly BackupListPart[];
}

/** The format and limits; each list's contents are checked again by the context that owns it. */
export const checkBackupFile = (file: BackupFile): Result<BackupFile, DomainError> => {
  const problems: string[] = [];
  if (file.lists.length === 0) problems.push('The backup has no lists.');
  if (file.lists.length > MAX_LISTS)
    problems.push(`A backup can hold at most ${String(MAX_LISTS)} lists.`);
  file.lists.forEach((part, index) => {
    if (part.entries.length > MAX_ENTRIES_PER_LIST) {
      problems.push(
        `List ${String(index + 1)} (“${part.list.config.title}”) has more than ${String(MAX_ENTRIES_PER_LIST)} entries.`,
      );
    }
    if (part.list.config.itemSource.kind === 'preset' && part.preset === null) {
      problems.push(
        `List ${String(index + 1)} (“${part.list.config.title}”) is missing its preset items.`,
      );
    }
  });
  return problems.length > 0
    ? err(
        domainError(
          'invalid',
          'backup.invalid-file',
          'This backup file can’t be imported.',
          problems,
        ),
      )
    : ok(file);
};
