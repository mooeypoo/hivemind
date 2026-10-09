import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { checkSite } from '../../scripts/check-headers.ts';
import { checkCsp, checkHeaders } from '../../scripts/security-headers.ts';

const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
const configured = new Headers(
  [...toml.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"\s*$/gm)]
    .filter(([, name]) => name?.includes('-') === true)
    .map(([, name, value]) => [name ?? '', value ?? '']),
);

describe('netlify.toml security headers', () => {
  test('are all present and strict', () => {
    expect(checkHeaders(configured)).toEqual([]);
  });

  test('the CSP check catches a weakened policy', () => {
    expect(checkCsp("default-src 'self'; script-src 'self' 'unsafe-inline'")).toMatch(
      /unsafe-inline/,
    );
    expect(
      checkCsp(
        (configured.get('content-security-policy') ?? '').replace(
          " 'none'; base-uri",
          ' *; base-uri',
        ),
      ),
    ).toMatch(/frame-ancestors|object-src/);
  });
});

describe('deployed-site check', () => {
  const site =
    (pageHeaders: Headers, html: string, apiCache = 'no-store'): typeof fetch =>
    (input) => {
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path === '/') return Promise.resolve(new Response(html, { headers: pageHeaders }));
      const headers = new Headers(pageHeaders);
      headers.set('cache-control', apiCache);
      return Promise.resolve(new Response('{}', { headers }));
    };

  test('passes a correctly configured site', async () => {
    const html = '<!doctype html><script type="module" src="/assets/index.js"></script>';
    expect(await checkSite('https://lists.example.org', site(configured, html))).toEqual([]);
  });

  test('reports missing headers, inline scripts and inline styles', async () => {
    const problems = await checkSite(
      'https://lists.example.org',
      site(new Headers(), '<script>alert(1)</script><div style="x"></div>', 'public'),
    );
    expect(problems).toContain('/: content-security-policy is missing');
    expect(problems).toContain('/: has an inline <script>');
    expect(problems).toContain('/: has an inline style attribute');
    expect(problems).toContain('/api/me: must send Cache-Control: no-store');
  });
});
