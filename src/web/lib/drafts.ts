/**
 * Unsaved form input, kept for this tab only, so an expired session or a reload
 * doesn't lose it. Storage can be unavailable (private mode, blocked site data): then
 * drafts are simply not kept.
 */
const PREFIX = 'draft:';

export const saveDraft = (key: string, value: unknown): void => {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not available: nothing to keep.
  }
};

export const loadDraft = (key: string): unknown => {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

export const clearDraft = (key: string): void => {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // Not available: nothing to clear.
  }
};
