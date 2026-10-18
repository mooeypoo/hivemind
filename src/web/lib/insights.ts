export const coveragePercent = (rated: number, entries: number): number | null =>
  entries === 0 ? null : Math.round((rated / entries) * 100);

export const ratingsPerVoter = (ratings: number, voters: number): string =>
  voters === 0 ? '—' : (ratings / voters).toFixed(1);
