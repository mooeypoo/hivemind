/**
 * The security headers every response must carry (AGENTS.md, Security & privacy), shared by
 * the netlify.toml test and the deployed-site check.
 */

/** Image hosts adapters use. A new adapter that serves images adds its host here and in netlify.toml. */
export const IMAGE_HOSTS = ['https://image.tmdb.org', 'https://cdn.discordapp.com'] as const;

export const REQUIRED_HEADERS: Readonly<Record<string, (value: string) => string | null>> = {
  'content-security-policy': (value) => checkCsp(value),
  'strict-transport-security': (value) =>
    /max-age=(\d+)/.exec(value) !== null && Number(/max-age=(\d+)/.exec(value)?.[1]) >= 31_536_000
      ? null
      : 'HSTS max-age must be at least a year',
  'x-frame-options': (value) => (value.toUpperCase() === 'DENY' ? null : 'must be DENY'),
  'x-content-type-options': (value) => (value === 'nosniff' ? null : 'must be nosniff'),
  'referrer-policy': (value) => (value === 'same-origin' ? null : 'must be same-origin'),
  'permissions-policy': (value) =>
    value.includes('camera=()') ? null : 'must disable camera and friends',
};

const directives = (csp: string): Map<string, string[]> =>
  new Map(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((tokens) => tokens[0] !== undefined && tokens[0] !== '')
      .map(([name, ...values]) => [name ?? '', values]),
  );

/** Problems with a Content-Security-Policy value, or null when it is strict enough. */
export const checkCsp = (csp: string): string | null => {
  const d = directives(csp);
  const problems: string[] = [];
  const is = (name: string, expected: string) => {
    if (d.get(name)?.join(' ') !== expected) problems.push(`${name} must be ${expected}`);
  };
  is('default-src', "'self'");
  is('script-src', "'self'");
  is('style-src', "'self'");
  is('object-src', "'none'");
  is('frame-ancestors', "'none'");
  is('base-uri', "'self'");
  is('form-action', "'self'");
  const images = [...(d.get('img-src') ?? [])].sort();
  const expectedImages = ["'self'", 'data:', ...IMAGE_HOSTS].sort();
  if (images.join(' ') !== expectedImages.join(' ')) {
    problems.push(`img-src must be exactly ${expectedImages.join(' ')}`);
  }
  if (/unsafe-inline|unsafe-eval/.test(csp)) problems.push('no unsafe-inline or unsafe-eval');
  return problems.length === 0 ? null : problems.join('; ');
};

/** Every problem with one response's headers. */
export const checkHeaders = (headers: Headers): string[] =>
  Object.entries(REQUIRED_HEADERS).flatMap(([name, check]) => {
    const value = headers.get(name);
    if (value === null) return [`${name} is missing`];
    const problem = check(value);
    return problem === null ? [] : [`${name}: ${problem}`];
  });
