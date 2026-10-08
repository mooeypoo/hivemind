export const MAX_TITLE_LENGTH = 200;

/** The title as shown: Unicode-normalised, trimmed, inner whitespace collapsed. */
export const cleanTitle = (title: string): string =>
  title.normalize('NFKC').trim().replace(/\s+/g, ' ');

/** The comparison key for duplicates: `cleanTitle`, case-folded. */
export const titleKey = (title: string): string => cleanTitle(title).toLowerCase();

export const isValidTitle = (title: string): boolean => {
  const cleaned = cleanTitle(title);
  return cleaned.length > 0 && cleaned.length <= MAX_TITLE_LENGTH;
};
