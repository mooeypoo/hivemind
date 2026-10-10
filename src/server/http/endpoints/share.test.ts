import { afterEach, expect, test, vi } from 'vitest';
import type { App } from '../../composition.ts';
import { sharePage } from './share.ts';
import { checkHeaders } from '../../../../scripts/security-headers.ts';
afterEach(() => vi.unstubAllGlobals());
const setup = (
  preview: {
    title: string;
    slug: string;
  } | null = null,
) => {
  const fetchTemplate = vi
    .fn()
    .mockResolvedValue(
      new Response(
        '<html><head><title>Our Site</title><!-- social-preview --></head><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>',
      ),
    );
  vi.stubGlobal('fetch', fetchTemplate);
  const getSharePreview = vi.fn().mockResolvedValue(preview);
  const app = {
    siteOrigin: () => 'https://site.example',
    lists: { getSharePreview },
    identity: {
      getCommunity: vi.fn().mockResolvedValue({ name: 'The Community <&>', iconUrl: null }),
    },
  } as unknown as App;
  return { app, fetchTemplate, getSharePreview };
};
test('serves site and community metadata in HTML without JavaScript', async () => {
  const { app, fetchTemplate, getSharePreview } = setup();
  const response = await sharePage(new Request('https://site.example/?login=anything'), app);
  const html = await response.text();
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(checkHeaders(response.headers)).toEqual([]);
  expect(html).toContain('property="og:title" content="Our Site"');
  expect(html).toContain('The Community &lt;&amp;&gt;');
  expect(html).toContain('property="og:url" content="https://site.example/"');
  expect(html).toContain('https://site.example/share.png');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  expect(html).toContain('<script type="module" src="/app.js"></script>');
  expect(html).not.toContain('login=');
  expect(getSharePreview).not.toHaveBeenCalled();
  expect(fetchTemplate).toHaveBeenCalledWith(new URL('https://site.example/index.html'));
});
test('list previews escape names and canonicalize id links to the slug', async () => {
  const { app, getSharePreview } = setup({ title: 'Best "<&> movies', slug: 'best-movies' });
  const response = await sharePage(new Request('https://site.example/lists/list-id?secret=x'), app);
  const html = await response.text();
  expect(getSharePreview).toHaveBeenCalledWith({ list: 'list-id' });
  expect(html).toContain('Best &quot;&lt;&amp;&gt; movies · Our Site');
  expect(html).toContain('property="og:url" content="https://site.example/lists/best-movies"');
  expect(html).not.toContain('secret=');
});
test('missing, draft and hidden lists get the generic site preview', async () => {
  const { app } = setup();
  const response = await sharePage(new Request('https://site.example/lists/hidden-list'), app);
  const html = await response.text();
  expect(html).toContain('property="og:title" content="Our Site"');
  expect(html).not.toContain('hidden-list');
});
test('handles communities without a configured public name', async () => {
  const { app } = setup();
  vi.spyOn(app.identity, 'getCommunity').mockResolvedValue(null);
  const response = await sharePage(new Request('https://site.example/'), app);
  expect(await response.text()).toContain('Community lists, nominations, and ratings.');
});
