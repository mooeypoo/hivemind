/** Title cards stand in for posters on items without images. */
export const TITLE_CARD_VARIANTS = 6;

/** A stable variant (1–6) per title, so the same item always gets the same card. */
export const titleCardVariant = (title: string): number => {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % TITLE_CARD_VARIANTS) + 1;
};

/** Up to two initials, for the smallest tiles. */
export const initials = (title: string): string =>
  title
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

/** Chips for small scales (up to 11 values, e.g. 0–10); a slider beyond that. */
export const usesScoreChips = (scale: { readonly min: number; readonly max: number }): boolean =>
  scale.max - scale.min + 1 <= 11;

export const scaleValues = (scale: { readonly min: number; readonly max: number }): number[] =>
  Array.from({ length: scale.max - scale.min + 1 }, (_, index) => scale.min + index);
