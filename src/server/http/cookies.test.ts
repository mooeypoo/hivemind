import { describe, expect, test } from 'vitest';
import { clearCookie, readCookie, setCookie } from './cookies.ts';

describe('cookies', () => {
  test('are HttpOnly, Secure, SameSite=Lax and site-wide', () => {
    expect(setCookie('__Host-session', 'abc', 43_200)).toBe(
      '__Host-session=abc; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });

  test('are cleared with the same attributes and no lifetime', () => {
    expect(clearCookie('__Host-session')).toBe(
      '__Host-session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });

  test('are read by exact name', () => {
    const request = new Request('https://x.test', {
      headers: { cookie: 'other=1; __Host-session=tok.sig; __Host-session-extra=2' },
    });
    expect(readCookie(request, '__Host-session')).toBe('tok.sig');
    expect(readCookie(request, 'missing')).toBeNull();
  });
});
