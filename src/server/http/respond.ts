import type { DomainError, DomainErrorKind } from '../../shared/kernel/index.ts';
import type { ErrorDto } from './contracts.ts';

const STATUS: Record<DomainErrorKind, number> = {
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  invalid: 422,
  unavailable: 503,
};

export const statusFor = (kind: DomainErrorKind): number => STATUS[kind];

/** API responses hold personal data, so nothing is cached. */
const baseHeaders = (): Headers => new Headers({ 'Cache-Control': 'no-store' });

export const json = (body: unknown, status = 200, headers: Headers = baseHeaders()): Response => {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
};

export const noContent = (headers: Headers = baseHeaders()): Response =>
  new Response(null, { status: 204, headers });

export const redirect = (location: string, headers: Headers = baseHeaders()): Response => {
  headers.set('Location', location);
  return new Response(null, { status: 302, headers });
};

export const errorBody = (code: string, message: string): ErrorDto => ({
  error: { code, message },
});

export const domainErrorResponse = (error: DomainError): Response =>
  json(errorBody(error.code, error.message), statusFor(error.kind));

export const withCookies = (...cookies: string[]): Headers => {
  const headers = baseHeaders();
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return headers;
};
