/**
 * Checks a deployed site's security headers and CSP-safety.
 *   npm run check:headers -- https://your-site.netlify.app
 * Exits non-zero, listing every problem, if anything is off. Run by CI after each deploy.
 */
import { checkHeaders } from './security-headers.ts';

export const checkSite = async (
  siteUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string[]> => {
  const origin = new URL(siteUrl).origin;
  const problems: string[] = [];

  const page = await fetchFn(`${origin}/`);
  problems.push(...checkHeaders(page.headers).map((p) => `/: ${p}`));
  const html = await page.text();
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('/: has an inline <script>');
  if (/\sstyle\s*=/i.test(html)) problems.push('/: has an inline style attribute');

  const api = await fetchFn(`${origin}/api/site`);
  problems.push(...checkHeaders(api.headers).map((p) => `/api/site: ${p}`));
  const me = await fetchFn(`${origin}/api/me`);
  if (me.headers.get('cache-control') !== 'no-store')
    problems.push('/api/me: must send Cache-Control: no-store');

  return problems;
};

const isMain = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMain) {
  const url = process.argv[2];
  if (url === undefined) {
    console.error('Usage: npm run check:headers -- <site url>');
    process.exit(2);
  }
  const problems = await checkSite(url);
  if (problems.length > 0) {
    console.error(`Security header problems on ${url}:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`Security headers OK on ${url}`);
}
