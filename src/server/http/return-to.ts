const MAX_LENGTH = 512;

/**
 * Where to send someone after sign-in. Only a path on this site: it starts with one `/`,
 * contains no backslash or control characters, and is not too long. Anything else is `/`,
 * so sign-in can never be turned into an open redirect.
 */
export const safeReturnPath = (raw: string | null | undefined): string => {
  if (raw === null || raw === undefined || raw.length > MAX_LENGTH) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  // Control characters and backslashes can be normalised by browsers into `//host`.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return '/';
  try {
    const url = new URL(raw, 'https://same.site');
    return url.origin === 'https://same.site' ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
};
