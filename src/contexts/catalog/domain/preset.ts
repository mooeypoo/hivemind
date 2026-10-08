import {
  domainError,
  err,
  ok,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { CatalogItem, PresetId } from './catalog-item.ts';
import { readCsv } from './csv.ts';
import { cleanTitle, isValidTitle, MAX_TITLE_LENGTH, titleKey } from './title.ts';

export const MAX_PRESET_ITEMS = 200;

/** A fixed set of items an Admin imported from CSV. Immutable once created. */
export interface Preset {
  readonly id: PresetId;
  readonly items: readonly CatalogItem[];
}

const presetItem = (title: string, subtitle: string | null): CatalogItem => ({
  source: 'preset',
  externalId: titleKey(title),
  title: cleanTitle(title),
  subtitle,
  imageUrl: null,
});

const invalid = (details: readonly string[]): DomainError =>
  domainError('invalid', 'catalog.invalid-csv', 'The CSV could not be imported.', details);

/**
 * Parses CSV with a header row of `title` or `title,subtitle`. Every problem is reported,
 * by row number as a spreadsheet would show it (the header is row 1).
 */
export const parsePreset = (id: PresetId, csv: string): Result<Preset, DomainError> => {
  const rows = readCsv(csv);
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase());
  const hasSubtitle = header?.length === 2 && header[1] === 'subtitle';
  if (header?.[0] !== 'title' || (header.length !== 1 && !hasSubtitle)) {
    return err(invalid(['Row 1: the header must be "title" or "title,subtitle".']));
  }

  const problems: string[] = [];
  const items: CatalogItem[] = [];
  const firstRowByKey = new Map<string, number>();

  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.every((cell) => cell.trim() === '')) return;
    if (cells.length > header.length) {
      problems.push(`Row ${String(rowNumber)}: has more columns than the header.`);
      return;
    }
    const title = cells[0] ?? '';
    const subtitle = hasSubtitle ? cleanTitle(cells[1] ?? '') : '';
    if (!isValidTitle(title)) {
      problems.push(
        `Row ${String(rowNumber)}: the title must be 1 to ${String(MAX_TITLE_LENGTH)} characters.`,
      );
      return;
    }
    if (subtitle.length > MAX_TITLE_LENGTH) {
      problems.push(
        `Row ${String(rowNumber)}: the subtitle must be at most ${String(MAX_TITLE_LENGTH)} characters.`,
      );
      return;
    }
    const key = titleKey(title);
    const first = firstRowByKey.get(key);
    if (first !== undefined) {
      problems.push(`Row ${String(rowNumber)}: duplicates row ${String(first)}.`);
      return;
    }
    firstRowByKey.set(key, rowNumber);
    items.push(presetItem(title, subtitle === '' ? null : subtitle));
  });

  if (items.length > MAX_PRESET_ITEMS) {
    problems.push(
      `The CSV has ${String(items.length)} items; the most allowed is ${String(MAX_PRESET_ITEMS)}.`,
    );
  }
  if (problems.length === 0 && items.length === 0) problems.push('The CSV has no items.');
  return problems.length > 0 ? err(invalid(problems)) : ok({ id, items });
};
