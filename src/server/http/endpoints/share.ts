import type { App } from '../../composition.ts';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });

export const sharePage = async (request: Request, app: App): Promise<Response> => {
  const origin = app.siteOrigin(request);
  const template = await fetch(new URL('/index.html', origin));
  if (!template.ok) return new Response('Site unavailable', { status: 503 });
  const html = await template.text();
  const siteName = (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'hivemind')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const path = new URL(request.url).pathname;
  const match = /^\/lists\/([^/]+)\/?$/.exec(path);
  const list =
    match?.[1] === undefined
      ? null
      : await app.lists.getSharePreview({ list: decodeURIComponent(match[1]) });
  const community = await app.identity.getCommunity();
  const title = list === null ? siteName : `${escapeHtml(list.title)} · ${siteName}`;
  const description = escapeHtml(
    community === null
      ? list === null
        ? 'Community lists, nominations, and ratings.'
        : `${list.title}: a community list. Sign in to take part.`
      : list === null
        ? `Lists, nominations, and ratings from ${community.name}.`
        : `${list.title}: a list from ${community.name}. Sign in to take part.`,
  );
  const url = escapeHtml(
    new URL(list === null ? '/' : `/lists/${encodeURIComponent(list.slug)}`, origin).href,
  );
  const image = escapeHtml(new URL('/share.png', origin).href);
  const metadata = [
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${siteName}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="Community rankings" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    '<meta name="twitter:image:alt" content="Community rankings" />',
  ].join('\n    ');
  return new Response(
    html
      .replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
      .replace('<!-- social-preview -->', () => metadata),
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://image.tmdb.org https://artworks.thetvdb.com https://cdn.discordapp.com data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'Permissions-Policy':
          'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  );
};
