import { describe, expect, test } from 'vitest';
import type { PresetId } from './catalog-item.ts';
import { readCsv } from './csv.ts';
import { MAX_PRESET_ITEMS, parsePreset } from './preset.ts';
import { cleanTitle, isValidTitle, titleKey } from './title.ts';

const id = 'p1' as PresetId;
const details = (csv: string) => {
  const result = parsePreset(id, csv);
  return result.ok ? [] : (result.error.details ?? []);
};

describe('titles', () => {
  test('are cleaned for display', () => {
    expect(cleanTitle('  The\tMatrix  \n')).toBe('The Matrix');
  });

  test('compare case- and spacing-insensitively, after Unicode normalisation', () => {
    expect(titleKey('The  Matrix')).toBe(titleKey('the matrix'));
    expect(titleKey('Ｔｈｅ Matrix')).toBe(titleKey('The Matrix'));
  });

  test('must be 1 to 200 characters once cleaned', () => {
    expect(isValidTitle('   ')).toBe(false);
    expect(isValidTitle('a'.repeat(200))).toBe(true);
    expect(isValidTitle('a'.repeat(201))).toBe(false);
  });
});

describe('readCsv', () => {
  test('handles quotes, escaped quotes, commas inside quotes and CRLF', () => {
    expect(readCsv('title,subtitle\r\n"Dune, Part One","He said ""hi"""\r\n')).toEqual([
      ['title', 'subtitle'],
      ['Dune, Part One', 'He said "hi"'],
    ]);
  });

  test('strips a UTF-8 BOM and keeps a last line without a newline', () => {
    expect(readCsv('﻿title\nAlien')).toEqual([['title'], ['Alien']]);
  });

  test('keeps newlines inside quoted fields', () => {
    expect(readCsv('title\n"Two\nLines"\n')).toEqual([['title'], ['Two\nLines']]);
  });
});

describe('parsePreset', () => {
  test('reads titles, with an optional subtitle column', () => {
    const result = parsePreset(id, 'Title,Subtitle\nAlien,1979\nHeat,\n');
    expect(result.ok && result.value.items).toEqual([
      { source: 'preset', externalId: 'alien', title: 'Alien', subtitle: '1979', imageUrl: null },
      { source: 'preset', externalId: 'heat', title: 'Heat', subtitle: null, imageUrl: null },
    ]);
  });

  test('accepts a title-only CSV and skips blank lines', () => {
    const result = parsePreset(id, 'title\n\nAlien\n,\n');
    expect(result.ok && result.value.items.map((item) => item.title)).toEqual(['Alien']);
  });

  test.each(['', 'name\nAlien', 'title,year\nAlien,1979', 'title,subtitle,extra\nAlien,a,b'])(
    'rejects a missing or wrong header: %j',
    (csv) => {
      expect(details(csv)).toEqual(['Row 1: the header must be "title" or "title,subtitle".']);
    },
  );

  test('reports every bad row by its spreadsheet row number', () => {
    expect(details(`title\nAlien\n  ALIEN \n${'x'.repeat(201)}\nHeat,extra`)).toEqual([
      'Row 3: duplicates row 2.',
      'Row 4: the title must be 1 to 200 characters.',
      'Row 5: has more columns than the header.',
    ]);
  });

  test(`allows at most ${String(MAX_PRESET_ITEMS)} items`, () => {
    const rows = (count: number) =>
      ['title', ...Array.from({ length: count }, (_, i) => `Item ${String(i)}`)].join('\n');
    expect(parsePreset(id, rows(MAX_PRESET_ITEMS)).ok).toBe(true);
    expect(details(rows(MAX_PRESET_ITEMS + 1))).toEqual([
      'The CSV has 201 items; the most allowed is 200.',
    ]);
  });

  test('rejects a CSV with a header but no items', () => {
    expect(details('title\n\n')).toEqual(['The CSV has no items.']);
  });
});
