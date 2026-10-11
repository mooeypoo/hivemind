import { afterEach, describe, expect, test, vi } from 'vitest';
import { useToast } from './toast.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('useToast', () => {
  test('shows a toast, then dismisses it on its own', () => {
    vi.useFakeTimers();
    const { toasts, show } = useToast();
    show('Link copied', 'success');
    expect(toasts.value.at(-1)).toMatchObject({ message: 'Link copied', tone: 'success' });
    vi.advanceTimersByTime(5000);
    expect(toasts.value.some((toast) => toast.message === 'Link copied')).toBe(false);
  });

  test('can be dismissed early', () => {
    const { toasts, show, dismiss } = useToast();
    show('Saved');
    const id = toasts.value.at(-1)?.id ?? 0;
    dismiss(id);
    expect(toasts.value.some((toast) => toast.id === id)).toBe(false);
  });
});
