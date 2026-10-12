// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import { applySavedTheme, useTheme } from './theme.ts';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('useTheme', () => {
  test('follows the system until a member chooses', () => {
    applySavedTheme();
    expect(useTheme().choice.value).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  test('a choice applies at once and is restored on the next visit', () => {
    useTheme().set('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    delete document.documentElement.dataset.theme;
    applySavedTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  test('choosing System forgets the saved choice', () => {
    useTheme().set('light');
    useTheme().set('system');
    expect(localStorage.getItem('hivemind:theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
