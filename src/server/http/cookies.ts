/**
 * `__Host-` cookies are only accepted when Secure, with Path=/ and no Domain,
 * so they cannot be set or overridden by another subdomain.
 */
export const SESSION_COOKIE = '__Host-session';
export const LOGIN_STATE_COOKIE = '__Host-login_state';
export const LOGIN_STATE_MAX_AGE_SECONDS = 600;

/** AGENTS.md: HttpOnly; Secure; SameSite=Lax; Path=/. */
export const setCookie = (name: string, value: string, maxAgeSeconds: number): string =>
  `${name}=${value}; Max-Age=${String(maxAgeSeconds)}; Path=/; HttpOnly; Secure; SameSite=Lax`;

export const clearCookie = (name: string): string => setCookie(name, '', 0);

export const readCookie = (request: Request, name: string): string | null => {
  const header = request.headers.get('cookie');
  if (header === null) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value === '' ? null : value;
    }
  }
  return null;
};
