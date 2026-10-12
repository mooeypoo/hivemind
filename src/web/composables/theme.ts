import { readonly, ref } from 'vue';

export type ThemeChoice = 'system' | 'light' | 'dark';

/** Kept only in this browser, never sent to the server (see the privacy page). */
const STORAGE_KEY = 'hivemind:theme';
const choice = ref<ThemeChoice>('system');

const stored = (): ThemeChoice => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
};

const apply = (value: ThemeChoice) => {
  const root = document.documentElement;
  if (value === 'system') delete root.dataset.theme;
  else root.dataset.theme = value;
};

const set = (value: ThemeChoice) => {
  choice.value = value;
  apply(value);
  try {
    if (value === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage can be blocked; the choice still applies until the page is reloaded.
  }
};

/** Applies the saved choice; call before mounting so the first render uses it. */
export const applySavedTheme = () => {
  choice.value = stored();
  apply(choice.value);
};

export const useTheme = () => ({ choice: readonly(choice), set });
