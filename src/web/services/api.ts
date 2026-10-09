import type { ErrorDto } from '../../server/http/contracts.ts';

export type ApiError = ErrorDto['error'] & { readonly status: number };
export type ApiResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ApiError };

/** Page navigation, swappable in tests. */
export const navigation = {
  assign: (url: string): void => {
    window.location.assign(url);
  },
  currentPath: (): string =>
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
};

export const loginUrl = (returnTo: string = navigation.currentPath()): string =>
  `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

interface RequestOptions {
  readonly body?: unknown;
  /** By default a 401 sends the browser to sign in and back. Set for the "am I signed in?" check. */
  readonly allowSignedOut?: boolean;
}

const networkError: ApiError = {
  status: 0,
  code: 'http.network',
  message: 'Could not reach the site. Check your connection and try again.',
};

/**
 * Calls the API. The browser adds the `Origin` header the server checks on mutations,
 * and sends the session cookie because it's same-origin. Bodies are never logged.
 */
const call = async <T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    return { ok: false, error: networkError };
  }

  if (response.status === 401 && options.allowSignedOut !== true) {
    navigation.assign(loginUrl());
  }
  if (response.status === 204) return { ok: true, data: undefined as T };

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (e.g. a gateway error page).
  }
  if (response.ok) return { ok: true, data: body as T };
  const error = (body as Partial<ErrorDto> | null)?.error;
  return {
    ok: false,
    error: {
      status: response.status,
      code: error?.code ?? 'http.unexpected',
      message: error?.message ?? 'Something went wrong. Please try again.',
      ...(error?.details === undefined ? {} : { details: error.details }),
    },
  };
};

export const api = {
  get: <T>(path: string, options?: RequestOptions) => call<T>('GET', path, options),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, { body }),
  put: <T>(path: string, body: unknown) => call<T>('PUT', path, { body }),
  delete: <T>(path: string) => call<T>('DELETE', path),
};
